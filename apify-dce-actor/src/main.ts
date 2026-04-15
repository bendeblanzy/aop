/**
 * Acteur Apify — Téléchargeur DCE achatpublic.com
 *
 * Flow par AO :
 *  1. Ouvre l'URL de la fiche achatpublic.com
 *  2. Détecte et gère la redirection vers login si nécessaire
 *  3. Navigue vers l'onglet "Pièces de marché" / "Documents de la consultation"
 *  4. Télécharge le .zip ou les fichiers individuels
 *  5. Upload dans Supabase Storage bucket 'dce' (path: {org_id}/{idweb}/{filename})
 *  6. Met à jour tender_dce : status='uploaded', documents=[...], apify_run_id
 *  7. Pause entre chaque pour respecter le rate limit (max 10/h)
 */

import { Actor, log } from 'apify'
import { chromium, Browser, BrowserContext, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import AdmZip from 'adm-zip'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderInput {
  idweb: string
  url_avis: string
  organization_id: string
}

interface ActorInput {
  tenders: TenderInput[]
  achatpublic_username: string
  achatpublic_password: string
  supabase_url: string
  supabase_service_key: string
  rate_limit_per_hour: number
}

interface DceDocument {
  filename: string
  url: string
  type: string
  label: string
  taille: number
  uploaded_at: string
}

// ─── Helpers Supabase (REST direct, sans SDK) ─────────────────────────────────

async function supabaseUpdateDce(
  supabaseUrl: string,
  serviceKey: string,
  idweb: string,
  organizationId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/tender_dce?tender_idweb=eq.${encodeURIComponent(idweb)}&organization_id=eq.${organizationId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Supabase PATCH tender_dce failed: ${res.status} ${body}`)
  }
}

async function supabaseUploadFile(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  storagePath: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': mimeType,
      'x-upsert': 'true', // écrase si déjà présent
    },
    body: fileBuffer as unknown as BodyInit,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Supabase Storage upload failed (${storagePath}): ${res.status} ${body}`)
  }

  // Retourne l'URL publique signée (ou l'URL de base)
  return `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${storagePath}`
}

// ─── Helpers achatpublic.com ──────────────────────────────────────────────────

/**
 * Vérifie si la page actuelle est la page de login
 */
function isLoginPage(page: Page): boolean {
  const url = page.url()
  return (
    url.includes('/sdm/ent/gen/ent_login') ||
    url.includes('loginAction') ||
    url.includes('connexion') ||
    url.includes('login')
  )
}

/**
 * Effectue le login sur achatpublic.com
 * La page de login utilise JSF — on remplit les champs et soumet
 */
async function doLogin(page: Page, username: string, password: string): Promise<void> {
  log.info('[login] Page de login détectée, connexion en cours...')

  // Attendre que le formulaire soit chargé
  await page.waitForLoadState('load', { timeout: 15000 })

  // Sélecteurs possibles pour achatpublic.com (JSF)
  // On tente plusieurs variantes au cas où le formulaire change
  const usernameSelectors = [
    'input[name="j_username"]',
    'input[name="username"]',
    'input[id*="username"]',
    'input[id*="login"]',
    'input[type="text"]',
  ]
  const passwordSelectors = [
    'input[name="j_password"]',
    'input[name="password"]',
    'input[id*="password"]',
    'input[type="password"]',
  ]

  let userField = null
  for (const sel of usernameSelectors) {
    userField = page.locator(sel).first()
    if (await userField.count() > 0) break
    userField = null
  }

  let passField = null
  for (const sel of passwordSelectors) {
    passField = page.locator(sel).first()
    if (await passField.count() > 0) break
    passField = null
  }

  if (!userField || !passField) {
    throw new Error('Impossible de trouver les champs login/password sur la page de connexion')
  }

  await userField.fill(username)
  await passField.fill(password)

  // Soumettre le formulaire
  const submitSelectors = [
    'input[type="submit"]',
    'button[type="submit"]',
    'button:has-text("Connexion")',
    'button:has-text("Se connecter")',
    'input[value*="onnexion"]',
  ]
  let submitted = false
  for (const sel of submitSelectors) {
    const btn = page.locator(sel).first()
    if (await btn.count() > 0) {
      await btn.click()
      submitted = true
      break
    }
  }
  if (!submitted) {
    // Fallback : touche Entrée
    await passField.press('Enter')
  }

  await page.waitForLoadState('load', { timeout: 15000 })
  log.info(`[login] Connexion effectuée, URL actuelle : ${page.url()}`)
}

/**
 * Ferme le bandeau cookie Didomi s'il est présent
 * (bloque les clics sur achatpublic.com)
 */
async function dismissCookieBanner(page: Page): Promise<void> {
  try {
    const agreeSelectors = [
      '#didomi-notice-agree-button',
      'button[id*="agree"]',
      'button:has-text("Accepter")',
      'button:has-text("Tout accepter")',
      'button:has-text("Accept")',
    ]
    for (const sel of agreeSelectors) {
      const btn = page.locator(sel).first()
      if (await btn.count() > 0 && await btn.isVisible()) {
        await btn.click({ timeout: 5000 })
        log.info('[cookie] Bandeau Didomi fermé')
        await page.waitForTimeout(500)
        return
      }
    }
    // Fallback : forcer la fermeture via JS (string pour éviter le contexte DOM TypeScript)
    const dismissed = await page.evaluate(
      "const el = document.getElementById('didomi-host'); if (el) { el.remove(); true; } else { false; }"
    )
    if (dismissed) log.info('[cookie] Bandeau Didomi supprimé via JS')
  } catch {
    // Pas de popup, on continue
  }
}

/**
 * Navigue vers l'onglet "Pièces de marché" / "Documents de la consultation"
 * et retourne les liens de téléchargement trouvés
 */
async function findDceDownloadLinks(
  page: Page,
  avisUrl: string
): Promise<{ url: string; label: string }[]> {
  // S'assurer qu'on est sur la bonne page
  if (!page.url().includes(new URL(avisUrl).hostname)) {
    await page.goto(avisUrl, { waitUntil: 'load', timeout: 30000 })
  }

  await page.waitForLoadState('load', { timeout: 15000 })

  // Onglets possibles selon la version de la plateforme
  const tabSelectors = [
    'a:has-text("Pièces de marché")',
    'a:has-text("Documents de la consultation")',
    'a:has-text("DCE")',
    'a:has-text("Télécharger le DCE")',
    'li:has-text("Pièces de marché") a',
    '[id*="pieceMarche"]',
    '[id*="dce"]',
  ]

  // Supprimer la popup Didomi via JS (plus fiable que le clic)
  await page.evaluate(`
    const host = document.getElementById('didomi-host');
    if (host) host.remove();
    const backdrop = document.getElementById('didomi-popup');
    if (backdrop) backdrop.remove();
  `).catch(() => {})

  // Cliquer sur l'onglet "Pièces de marché" via JS (sélecteurs CSS natifs)
  // On connaît l'ID exact depuis les logs : jqTabOpener--2
  const nativeTabSelectors = [
    'a[id="jqTabOpener--2"]',
    'a[href="#tab2"]',
    'a[aria-label*="Pièces de marché"]',
    'a.jqTabOpener[href="#tab2"]',
  ]

  let tabClicked = false
  for (const sel of nativeTabSelectors) {
    const clicked = await page.evaluate((s: string) => {
      const el = document.querySelector(s) as HTMLElement | null
      if (el) { el.click(); return true }
      return false
    }, sel).catch(() => false)

    if (clicked) {
      log.info(`[dce] Onglet cliqué via JS : ${sel}`)
      tabClicked = true
      await page.waitForTimeout(2000)
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {})
      break
    }
  }

  if (!tabClicked) {
    log.warning('[dce] Aucun onglet cliqué — on cherche quand même les liens')
  }

  // Chercher les liens de téléchargement (zip ou fichiers individuels)
  const downloadLinks: { url: string; label: string }[] = []

  // 1. Bouton "Télécharger le dossier complet" (zip)
  const zipSelectors = [
    'a:has-text("Télécharger le dossier")',
    'a:has-text("Télécharger tout")',
    'a[href*=".zip"]',
    'a:has-text("dossier complet")',
    'input[value*="Télécharger"]:not([type="hidden"])',
  ]

  for (const sel of zipSelectors) {
    const links = page.locator(sel)
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href')
      const text = await links.nth(i).innerText().catch(() => 'DCE complet')
      if (href) {
        const absolute = href.startsWith('http')
          ? href
          : new URL(href, page.url()).toString()
        downloadLinks.push({ url: absolute, label: text.trim() || 'DCE complet' })
      }
    }
    if (downloadLinks.length > 0) break
  }

  // 2. Fallback : tous les liens PDF/ZIP dans la zone de contenu
  if (downloadLinks.length === 0) {
    const allLinks = page.locator('a[href*=".pdf"], a[href*=".zip"], a[href*=".doc"], a[href*="download"], a[href*="telecharger"]')
    const count = await allLinks.count()
    for (let i = 0; i < count; i++) {
      const href = await allLinks.nth(i).getAttribute('href')
      const text = await allLinks.nth(i).innerText().catch(() => '')
      if (href && !href.startsWith('#')) {
        const absolute = href.startsWith('http')
          ? href
          : new URL(href, page.url()).toString()
        downloadLinks.push({ url: absolute, label: text.trim() || path.basename(href) })
      }
    }
  }

  log.info(`[dce] ${downloadLinks.length} lien(s) de téléchargement trouvé(s)`)
  return downloadLinks
}

/**
 * Télécharge un fichier via Playwright (gère les redirections et les cookies de session)
 * Retourne le buffer et le nom de fichier réel
 */
async function downloadFile(
  context: BrowserContext,
  url: string,
  tmpDir: string
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const page = await context.newPage()

  try {
    // Déclencher le téléchargement
    // Note: page.goto() lève "Download is starting" quand l'URL déclenche un download direct
    // C'est normal — on ignore cette erreur, le download event se déclenche quand même
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 })
    page.goto(url, { waitUntil: 'commit', timeout: 30000 }).catch((err: Error) => {
      if (!err.message.includes('Download is starting')) {
        log.warning(`[download] goto non-fatal: ${err.message}`)
      }
    })
    const download = await downloadPromise

    const suggestedName = download.suggestedFilename() || `dce_${Date.now()}.zip`
    const filePath = path.join(tmpDir, suggestedName)
    await download.saveAs(filePath)

    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(suggestedName).toLowerCase()
    const mimeType =
      ext === '.zip' ? 'application/zip' :
      ext === '.pdf' ? 'application/pdf' :
      ext === '.doc' || ext === '.docx' ? 'application/msword' :
      'application/octet-stream'

    return { buffer, filename: suggestedName, mimeType }
  } finally {
    await page.close()
  }
}

/**
 * Extrait les fichiers d'un zip et retourne la liste { buffer, filename }
 * Limite aux PDF, DOCX, XLSX (ignore les dossiers et fichiers inutiles)
 */
function extractZipFiles(
  zipBuffer: Buffer
): { buffer: Buffer; filename: string; mimeType: string }[] {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()
  const results: { buffer: Buffer; filename: string; mimeType: string }[] = []

  const allowedExts = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods'])

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!allowedExts.has(ext)) continue

    const mimeType =
      ext === '.pdf' ? 'application/pdf' :
      ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
      ext === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
      'application/octet-stream'

    results.push({
      buffer: entry.getData(),
      filename: entry.name,
      mimeType,
    })
  }

  log.info(`[zip] Extrait ${results.length} fichier(s) du zip`)
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Actor.main(async () => {
  const input = await Actor.getInput<ActorInput>()

  if (!input) throw new Error('Input manquant')

  const {
    tenders,
    achatpublic_username,
    achatpublic_password,
    supabase_url,
    supabase_service_key,
    rate_limit_per_hour = 10,
  } = input

  if (!tenders || tenders.length === 0) {
    log.info('Aucun tender à traiter.')
    return
  }

  // Délai entre chaque téléchargement (en ms) pour respecter le rate limit
  const delayMs = Math.ceil((3600 * 1000) / rate_limit_per_hour)
  log.info(`Traitement de ${tenders.length} AO — rate limit: ${rate_limit_per_hour}/h — délai: ${delayMs / 1000}s entre chaque`)

  // Dossier temporaire pour les téléchargements
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dce-'))
  log.info(`Dossier temporaire: ${tmpDir}`)

  // Lancer Playwright
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const context: BrowserContext = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })

  let loginDone = false

  try {
    for (let i = 0; i < tenders.length; i++) {
      const tender = tenders[i]
      log.info(`\n── AO ${i + 1}/${tenders.length} : ${tender.idweb} ──`)

      // Marquer comme "en cours" dans Supabase
      await supabaseUpdateDce(supabase_url, supabase_service_key, tender.idweb, tender.organization_id, {
        apify_run_id: Actor.getEnv().actorRunId ?? 'local-test',
        apify_run_at: new Date().toISOString(),
        apify_error: null,
      })

      try {
        const page = await context.newPage()

        // Naviguer vers la fiche AO
        log.info(`[${tender.idweb}] Navigation vers ${tender.url_avis}`)
        // domcontentloaded suffît pour les apps JSF — plus rapide et plus fiable que 'load'
        try {
          await page.goto(tender.url_avis, { waitUntil: 'domcontentloaded', timeout: 45000 })
        } catch {
          // Fallback : commit = dès que les headers arrivent, on continue
          log.warning(`[${tender.idweb}] domcontentloaded timeout, fallback sur commit...`)
          await page.goto(tender.url_avis, { waitUntil: 'commit', timeout: 30000 })
          await page.waitForTimeout(3000) // laisser le JS s'exécuter
        }

        // Gérer le login si nécessaire (une seule fois par session)
        if (!loginDone && isLoginPage(page)) {
          await doLogin(page, achatpublic_username, achatpublic_password)
          loginDone = true
          // Retourner sur la fiche après login
          if (!page.url().includes(new URL(tender.url_avis).hostname)) {
            await page.goto(tender.url_avis, { waitUntil: 'domcontentloaded', timeout: 45000 })
          }
        } else if (isLoginPage(page)) {
          // Session expirée, re-login
          log.warning(`[${tender.idweb}] Session expirée, re-connexion...`)
          await doLogin(page, achatpublic_username, achatpublic_password)
          await page.goto(tender.url_avis, { waitUntil: 'domcontentloaded', timeout: 45000 })
        }

        // Trouver les liens de téléchargement
        const downloadLinks = await findDceDownloadLinks(page, tender.url_avis)
        await page.close()

        if (downloadLinks.length === 0) {
          log.warning(`[${tender.idweb}] Aucun lien de téléchargement trouvé — marqué 'no_dce'`)
          await supabaseUpdateDce(supabase_url, supabase_service_key, tender.idweb, tender.organization_id, {
            status: 'no_dce',
            apify_error: 'Aucun lien de téléchargement trouvé sur la page',
          })
          continue
        }

        // Télécharger et uploader chaque fichier
        const uploadedDocs: DceDocument[] = []

        for (const link of downloadLinks) {
          log.info(`[${tender.idweb}] Téléchargement: ${link.label} — ${link.url}`)

          const { buffer, filename, mimeType } = await downloadFile(context, link.url, tmpDir)

          // Si c'est un zip, extraire et uploader chaque PDF/doc
          if (filename.endsWith('.zip') || mimeType === 'application/zip') {
            const extracted = extractZipFiles(buffer)

            for (const file of extracted) {
              const storagePath = `${tender.organization_id}/${tender.idweb}/${file.filename}`
              const fileUrl = await supabaseUploadFile(
                supabase_url, supabase_service_key,
                'dce', storagePath,
                file.buffer, file.mimeType
              )
              uploadedDocs.push({
                filename: file.filename,
                url: fileUrl,
                type: file.mimeType,
                label: file.filename,
                taille: file.buffer.length,
                uploaded_at: new Date().toISOString(),
              })
              log.info(`[${tender.idweb}] Uploadé: ${file.filename} (${Math.round(file.buffer.length / 1024)} KB)`)
            }
          } else {
            // Fichier direct (PDF, DOCX...)
            const storagePath = `${tender.organization_id}/${tender.idweb}/${filename}`
            const fileUrl = await supabaseUploadFile(
              supabase_url, supabase_service_key,
              'dce', storagePath,
              buffer, mimeType
            )
            uploadedDocs.push({
              filename,
              url: fileUrl,
              type: mimeType,
              label: link.label,
              taille: buffer.length,
              uploaded_at: new Date().toISOString(),
            })
            log.info(`[${tender.idweb}] Uploadé: ${filename} (${Math.round(buffer.length / 1024)} KB)`)
          }
        }

        // Mettre à jour tender_dce avec status 'uploaded'
        await supabaseUpdateDce(supabase_url, supabase_service_key, tender.idweb, tender.organization_id, {
          status: 'uploaded',
          documents: uploadedDocs,
          updated_at: new Date().toISOString(),
        })

        log.info(`[${tender.idweb}] ✅ ${uploadedDocs.length} fichier(s) uploadé(s) avec succès`)

        // Sauvegarder dans le dataset Apify pour traçabilité
        await Actor.pushData({
          idweb: tender.idweb,
          organization_id: tender.organization_id,
          status: 'uploaded',
          files_count: uploadedDocs.length,
          files: uploadedDocs.map(d => d.filename),
        })

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        log.error(`[${tender.idweb}] ❌ Erreur: ${message}`)

        // Marquer l'erreur sans changer le statut (reste 'pending' pour retry)
        await supabaseUpdateDce(supabase_url, supabase_service_key, tender.idweb, tender.organization_id, {
          apify_error: message,
        }).catch(() => {})

        await Actor.pushData({
          idweb: tender.idweb,
          organization_id: tender.organization_id,
          status: 'error',
          error: message,
        })
      }

      // Rate limiting : attendre entre chaque AO (sauf le dernier)
      if (i < tenders.length - 1) {
        log.info(`Attente ${Math.round(delayMs / 1000)}s avant le prochain AO...`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

  } finally {
    await browser.close()
    // Nettoyage du dossier temporaire
    fs.rmSync(tmpDir, { recursive: true, force: true })
    log.info('Navigateur fermé, dossier temporaire supprimé.')
  }

  log.info('Acteur terminé.')
})
