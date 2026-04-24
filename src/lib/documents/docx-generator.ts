import {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  Packer, ShadingType, PageOrientation, convertInchesToTwip,
  UnderlineType, Header, Footer, PageNumber,
} from 'docx'

// ─── Couleurs & styles ───────────────────────────────────────────────────────
const BLUE_DARK = '1E3A5F'   // bleu marine officiel
const BLUE_MED  = '2563EB'   // bleu primaire
const GREY_BG   = 'F3F4F6'   // fond gris clair pour en-têtes de tableau
const GREY_LINE = 'D1D5DB'   // bordure grise
const WHITE     = 'FFFFFF'

// ─── Helpers typographiques ──────────────────────────────────────────────────
function run(text: string, opts: Partial<{
  bold: boolean; italic: boolean; size: number; color: string; underline: boolean
}> = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    size: (opts.size ?? 11) * 2,        // docx uses half-points
    color: opts.color ?? '111827',
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    font: 'Arial',
  })
}

function para(children: TextRun[], opts: Partial<{
  align: typeof AlignmentType[keyof typeof AlignmentType]; spaceBefore: number; spaceAfter: number; indent: number
}> = {}) {
  return new Paragraph({
    children,
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: (opts.spaceBefore ?? 0) * 20, after: (opts.spaceAfter ?? 60) * 20 },
    indent: opts.indent ? { left: opts.indent * 20 } : undefined,
  })
}

function heading1(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: WHITE, font: 'Arial' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    shading: { type: ShadingType.SOLID, color: BLUE_DARK, fill: BLUE_DARK },
    indent: { left: 200, right: 200 },
  })
}

function heading2(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: BLUE_DARK, font: 'Arial' })],
    spacing: { before: 300, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE_MED } },
  })
}

function heading3(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, color: '374151', font: 'Arial' })],
    spacing: { before: 200, after: 80 },
  })
}

// ─── Largeurs de colonnes (DXA = twips) ──────────────────────────────────────
// A4 (11906 twips) – marges 1,2" gauche (1728) + 1,0" droite (1440) = 8738 twips utiles
const CONTENT_W = 8738
const COL_LABEL  = Math.round(CONTENT_W * 0.35)       // 3058
const COL_VALUE  = CONTENT_W - COL_LABEL               // 5680

function pctToDxa(pcts: number[]): number[] {
  const raw = pcts.map(p => Math.round(CONTENT_W * p / 100))
  const diff = CONTENT_W - raw.reduce((a, b) => a + b, 0)
  raw[raw.length - 1] += diff   // ajustement sur la dernière colonne
  return raw
}

// ─── Tableau formulaire (label | valeur) ─────────────────────────────────────
function formRow(label: string, value: string, highlight = false) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: COL_LABEL, type: WidthType.DXA },
        shading: highlight
          ? { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG }
          : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 80 },
        borders: formBorders(),
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true, size: 20, color: '374151', font: 'Arial' })],
        })],
      }),
      new TableCell({
        width: { size: COL_VALUE, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 80 },
        borders: formBorders(),
        children: [new Paragraph({
          children: [new TextRun({ text: value || '[À compléter]', size: 20, color: value ? '111827' : '9CA3AF', font: 'Arial' })],
        })],
      }),
    ],
  })
}

function sectionHeaderRow(text: string) {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: BLUE_DARK, fill: BLUE_DARK },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders: formBorders(),
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, size: 22, color: WHITE, font: 'Arial' })],
        })],
      }),
    ],
  })
}

function formBorders() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE }
  return { top: b, bottom: b, left: b, right: b }
}

function formTable(rows: TableRow[]) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [COL_LABEL, COL_VALUE],
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows,
  })
}

// ─── Tableau à colonnes multiples (données) ───────────────────────────────────
function dataTable(headers: string[], rows: string[][], widths?: number[]) {
  const pcts = widths ?? headers.map(() => Math.floor(100 / headers.length))
  const colWidths = pctToDxa(pcts)

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: BLUE_DARK, fill: BLUE_DARK },
      margins: { top: 80, bottom: 80, left: 120, right: 80 },
      borders: formBorders(),
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, size: 20, color: WHITE, font: 'Arial' })],
      })],
    })),
  })
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: ri % 2 === 1 ? { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 80 },
      borders: formBorders(),
      children: [new Paragraph({
        children: [new TextRun({ text: cell || '—', size: 20, font: 'Arial' })],
      })],
    })),
  }))
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  })
}

function spacer(lines = 1) {
  return Array.from({ length: lines }, () => new Paragraph({
    children: [new TextRun({ text: ' ' })],
    spacing: { before: 0, after: 100 },
  }))
}

// ─── Document de base (mémoire technique et autres documents libres) ──────────
export async function generateDocx(title: string, sections: { title: string; content: string }[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    heading1(title),
    ...spacer(1),
  ]

  for (const section of sections) {
    children.push(heading2(section.title))
    const lines = section.content.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const isBullet = line.trim().startsWith('-') || line.trim().startsWith('•')
      children.push(new Paragraph({
        children: [run(line.trim().replace(/^[-•]\s*/, ''))],
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: 80 },
      }))
    }
    children.push(...spacer(1))
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) },
        },
      },
      children: children as Paragraph[],
    }],
  })

  return await Packer.toBuffer(doc)
}

// ─── DC1 — Lettre de candidature (structure officielle DAJ v01/04/2019) ───────
export async function generateDC1Docx(data: Record<string, string>): Promise<Buffer> {
  const seul = data.groupement !== 'oui'
  const children: (Paragraph | Table)[] = [
    // En-tête officiel
    heading1('DC1 — LETTRE DE CANDIDATURE'),
    para([run('Désignation du mandataire par ses co-traitants', { italic: true, color: '6B7280' })], { align: AlignmentType.CENTER }),
    para([run('Formulaire DAJ — Version 01/04/2019 — Ministère de l\'Économie et des Finances', { italic: true, size: 9, color: '9CA3AF' })], { align: AlignmentType.CENTER }),
    ...spacer(1),

    // A — Identification de l'acheteur
    formTable([
      sectionHeaderRow('A — IDENTIFICATION DE L\'ACHETEUR PUBLIC'),
      formRow('Nom / Raison sociale', data.acheteur_nom),
      formRow('Adresse postale', data.acheteur_adresse),
      formRow('Adresse électronique', data.acheteur_email || ''),
    ]),
    ...spacer(1),

    // B — Objet de la consultation
    formTable([
      sectionHeaderRow('B — OBJET DE LA CONSULTATION'),
      formRow('Objet du marché ou de l\'accord-cadre', data.objet_marche || data.titre_ao || ''),
      formRow('Référence de la procédure', data.reference_marche || ''),
    ]),
    ...spacer(1),

    // C — Objet de la candidature
    formTable([
      sectionHeaderRow('C — OBJET DE LA CANDIDATURE'),
      formRow('Le candidat soumissionne pour', data.lots_candidats
        ? `Les lots : ${data.lots_candidats}`
        : 'Le marché global (procédure sans allotissement)'),
    ]),
    ...spacer(1),

    // D — Présentation du candidat
    formTable([
      sectionHeaderRow('D — PRÉSENTATION DU CANDIDAT'),
      formRow('Situation', seul ? '☑ Le candidat se présente seul' : '☑ Le candidat est membre d\'un groupement'),
      formRow('Nom commercial et dénomination sociale', data.raison_sociale),
      formRow('Adresse de l\'établissement', data.adresse_siege),
      formRow('Code postal — Ville', `${data.code_postal || ''} ${data.ville || ''}`.trim()),
      formRow('Adresse électronique', data.email || ''),
      formRow('Numéro SIRET', data.siret),
      ...(seul ? [] : [
        formRow('Type de groupement', data.type_groupement || '[Conjoint / Solidaire]'),
        formRow('Rôle dans le groupement', data.role_groupement || '[Mandataire / Co-traitant]'),
      ]),
    ]),
    ...spacer(1),

    // E — Membres du groupement (si applicable)
    ...(!seul ? [
      formTable([
        sectionHeaderRow('E — IDENTIFICATION DES MEMBRES DU GROUPEMENT'),
        formRow('Mandataire désigné', data.mandataire || data.raison_sociale),
        formRow('Autres co-traitants', data.cotraitants || '[À lister avec SIRET et répartition des prestations]'),
      ]),
      ...spacer(1),
    ] : []),

    // F — Engagements
    heading2('F — ENGAGEMENTS DU CANDIDAT'),
    para([run('F1 — Déclarations sur l\'honneur relatives aux interdictions de soumissionner', { bold: true })]),
    para([run('Le candidat déclare sur l\'honneur n\'entrer dans aucun des cas d\'exclusion prévus aux articles L. 2141-1 à L. 2141-14 du code de la commande publique, et être en règle au regard des articles L. 5212-1 à L. 5212-11 du code du travail (emploi des travailleurs handicapés).')]),
    ...spacer(1),
    para([run('F2 — Capacités du candidat', { bold: true })]),
    para([run('Le candidat joint à sa candidature le formulaire DC2 complété, attestant de ses capacités économiques, financières et techniques.')]),
    ...spacer(1),

    // G — Mandataire (si groupement)
    ...(!seul ? [
      formTable([
        sectionHeaderRow('G — DÉSIGNATION DU MANDATAIRE (groupement)'),
        formRow('Mandataire', data.mandataire || data.raison_sociale),
        formRow('SIRET du mandataire', data.siret_mandataire || data.siret),
      ]),
      ...spacer(1),
    ] : []),

    // Signature (non obligatoire depuis 2016, sauf si le RC le prévoit)
    heading2('SIGNATURE'),
    para([run('Note : la signature du DC1 est facultative depuis le 01/01/2016, sauf si les documents de la consultation le prévoient expressément.', { italic: true, size: 9, color: '6B7280' })]),
    ...spacer(1),
    formTable([
      formRow('Fait à', data.lieu_signature || data.ville || '[Ville]'),
      formRow('Le', data.date_signature || new Date().toLocaleDateString('fr-FR')),
      formRow('Nom et prénom', `${data.representant_prenom || ''} ${data.representant_nom || ''}`.trim()),
      formRow('Qualité', data.representant_qualite || '[Qualité / Fonction]'),
      new TableRow({
        children: [new TableCell({
          columnSpan: 2,
          margins: { top: 500, bottom: 500, left: 120, right: 120 },
          borders: formBorders(),
          children: [
            new Paragraph({ children: [run('Signature et cachet :', { bold: true })] }),
            new Paragraph({ children: [run(' ')] }),
            new Paragraph({ children: [run(' ')] }),
          ],
        })],
      }),
    ]),
    ...spacer(1),
    para([run('Ce formulaire DC1 doit être accompagné du DC2 et de toutes les pièces exigées par le Règlement de Consultation.', { italic: true, size: 9, color: '6B7280' })], { align: AlignmentType.CENTER }),
  ]

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'DC1 — Réf. consultation : ', size: 16, font: 'Arial', color: '9CA3AF' }),
              new TextRun({ text: data.reference_marche || '', size: 16, font: 'Arial', color: '9CA3AF' }),
              new TextRun({ children: ['    Page ', PageNumber.CURRENT], size: 16, font: 'Arial', color: '9CA3AF' }),
            ],
            alignment: AlignmentType.RIGHT,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE } },
          })],
        }),
      },
      children: children as Paragraph[],
    }],
  })
  return await Packer.toBuffer(doc)
}

// ─── DC2 — Déclaration du candidat (structure officielle DAJ v01/04/2019, MàJ 21/11/2023) ───
export async function generateDC2Docx(data: Record<string, any>): Promise<Buffer> {
  const refs: any[] = data.references_selectionnees || []
  const children: (Paragraph | Table)[] = [
    heading1('DC2 — DÉCLARATION DU CANDIDAT'),
    para([run('Individuel ou membre du groupement', { italic: true, color: '6B7280' })], { align: AlignmentType.CENTER }),
    para([run('Formulaire DAJ — Version 01/04/2019 (MàJ 21/11/2023) — Marchés publics', { italic: true, size: 9, color: '9CA3AF' })], { align: AlignmentType.CENTER }),
    ...spacer(1),

    // A — Identification de l'acheteur
    formTable([
      sectionHeaderRow('A — IDENTIFICATION DE L\'ACHETEUR'),
      formRow('Acheteur public', data.acheteur_nom || '[À compléter par l\'acheteur]'),
    ]),
    ...spacer(1),

    // B — Objet de la consultation
    formTable([
      sectionHeaderRow('B — OBJET DE LA CONSULTATION'),
      formRow('Objet du marché', data.objet_marche || '[À compléter]'),
      formRow('Lot(s) concerné(s)', data.lots_candidats || 'Marché global'),
    ]),
    ...spacer(1),

    // C1 — Identification du candidat (cas général)
    formTable([
      sectionHeaderRow('C1 — IDENTIFICATION DU CANDIDAT (cas général)'),
      formRow('Nom commercial et dénomination sociale', data.raison_sociale),
      formRow('Adresse de l\'établissement exécutant la prestation', data.adresse_siege),
      formRow('Code postal — Ville', `${data.code_postal || ''} ${data.ville || ''}`.trim()),
      formRow('Adresse électronique', data.email || ''),
      formRow('Numéro SIRET', data.siret),
      formRow('Forme juridique', data.forme_juridique || '[SA, SARL, EURL, SAS, association, etc.]'),
      formRow('Code NAF/APE', data.code_naf || ''),
      formRow('PME / artisan ?', 'À préciser selon situation (art. R. 2151-13 CCP)'),
    ]),
    ...spacer(1),

    // E — Aptitude à exercer l'activité
    formTable([
      sectionHeaderRow('E — APTITUDE À EXERCER L\'ACTIVITÉ PROFESSIONNELLE'),
      formRow('Inscription registre professionnel', data.registre_professionnel || 'Registre du commerce et des sociétés (RCS)'),
      formRow('N° d\'inscription', data.siret ? `SIRET : ${data.siret}` : '[À compléter]'),
      formRow('Documents disponibles en ligne', data.url_documents || '[URL si applicable]'),
    ]),
    ...spacer(1),

    // F — Capacité économique et financière
    heading2('F — CAPACITÉ ÉCONOMIQUE ET FINANCIÈRE'),
    para([run('F1 — Chiffres d\'affaires hors taxes des trois derniers exercices disponibles', { bold: true })]),
    ...spacer(1),
    dataTable(
      ['Exercice', 'Période', 'CA global HT (€)', 'Part CA marché (%)'],
      [
        ['N-1', data.periode_n1 || `${new Date().getFullYear() - 1}`, data.ca_n1 ? `${Number(data.ca_n1).toLocaleString('fr-FR')} €` : '[À renseigner]', ''],
        ['N-2', data.periode_n2 || `${new Date().getFullYear() - 2}`, data.ca_n2 ? `${Number(data.ca_n2).toLocaleString('fr-FR')} €` : '[À renseigner]', ''],
        ['N-3', data.periode_n3 || `${new Date().getFullYear() - 3}`, data.ca_n3 ? `${Number(data.ca_n3).toLocaleString('fr-FR')} €` : '[À renseigner]', ''],
      ],
      [15, 25, 35, 25]
    ),
    ...spacer(1),
    formTable([
      formRow('F2 — Autres informations financières', `Effectif moyen annuel : ${data.effectif ? `${data.effectif} salariés` : '[À renseigner]'}`),
      formRow('Capital social', data.capital_social ? `${Number(data.capital_social).toLocaleString('fr-FR')} €` : '[À renseigner]'),
      formRow('Marge brute N-1', data.marge_brute ? `${Number(data.marge_brute).toLocaleString('fr-FR')} €` : '[À renseigner]'),
      formRow('F3 — Assurance RC professionnelle n°', data.assurance_rc_numero || '[À renseigner]'),
      formRow('Compagnie d\'assurance', data.assurance_rc_compagnie || '[À renseigner]'),
      formRow('Expiration', data.assurance_rc_expiration || '[À renseigner]'),
    ]),
    ...spacer(1),

    // G — Capacité technique et professionnelle
    heading2('G — CAPACITÉ TECHNIQUE ET PROFESSIONNELLE'),
    para([run('G1 — Références de prestations similaires réalisées au cours des 3 à 5 dernières années', { bold: true })]),
    ...spacer(1),
  ]

  if (refs.length > 0) {
    children.push(
      dataTable(
        ['Intitulé du marché', 'Acheteur public', 'Année', 'Montant (€)', 'Attestation'],
        refs.map((r: any) => [
          r.intitule_marche || '',
          r.acheteur_public || '',
          String(r.annee_execution || ''),
          r.montant ? `${Number(r.montant).toLocaleString('fr-FR')} €` : '—',
          r.attestation_bonne_execution ? 'Oui' : 'Sur demande',
        ]),
        [32, 25, 10, 18, 15]
      )
    )
  } else {
    children.push(para([run('Aucune référence renseignée — à compléter depuis votre profil AOP.', { italic: true, color: '6B7280' })]))
  }

  children.push(...spacer(1))
  children.push(formTable([
    formRow('G1 — Effectifs & moyens humains', data.effectif ? `${data.effectif} collaborateurs` : '[À renseigner]'),
    formRow('Certifications / qualifications', Array.isArray(data.certifications) && data.certifications.length > 0
      ? data.certifications.join(' — ')
      : (data.certifications && typeof data.certifications === 'string' ? data.certifications : 'Aucune certification renseignée')),
    formRow('G2 — Documents disponibles en ligne', '[URL si applicable]'),
  ]))
  children.push(...spacer(1))

  // H — Présentation de l'agence (bloc différenciateur, issu du profil)
  if (data.presentation_agence || (data.equipe_membres && data.equipe_membres.length > 0)) {
    children.push(heading2('H — PRÉSENTATION DE L\'AGENCE'))
    children.push(para([run(
      'Cette section présente l\'agence candidate, son positionnement et son équipe. Elle complète les données administratives et financières du présent DC2.',
      { italic: true, size: 9, color: '6B7280' }
    )]))
    children.push(...spacer(1))

    if (data.presentation_agence) {
      children.push(para([run('Positionnement et atouts :', { bold: true })]))
      // Chaque paragraphe séparé par \n\n
      const paragraphs = String(data.presentation_agence).split('\n\n').filter(Boolean)
      for (const p of paragraphs) {
        children.push(para([run(p.trim())]))
      }
      children.push(...spacer(1))
    }

    if (data.equipe_membres && data.equipe_membres.length > 0) {
      children.push(para([run(`Équipe (${data.nb_collaborateurs || data.equipe_membres.length} collaborateur(s)) :`, { bold: true })]))
      children.push(
        dataTable(
          ['Collaborateur', 'Poste / Rôle'],
          data.equipe_membres.map((m: string) => {
            const sep = m.indexOf(' — ')
            if (sep !== -1) {
              return [m.substring(0, sep).trim(), m.substring(sep + 3).trim()]
            }
            return [m, '']
          }),
          [40, 60]
        )
      )
      children.push(...spacer(1))
    }
  }

  // Signature (facultative)
  children.push(heading2('DÉCLARATION SUR L\'HONNEUR ET SIGNATURE'))
  children.push(para([run('Je soussigné(e), représentant habilité du candidat, certifie l\'exactitude de toutes les informations fournies dans le présent DC2 et atteste sur l\'honneur de la capacité du candidat à réaliser les prestations objet du marché.')]))
  children.push(para([run('Note : la signature est facultative sauf si les documents de la consultation le prévoient expressément.', { italic: true, size: 9, color: '6B7280' })]))
  children.push(...spacer(1))
  children.push(formTable([
    formRow('Fait à', data.lieu_signature || data.ville || '[Ville]'),
    formRow('Le', data.date_signature || new Date().toLocaleDateString('fr-FR')),
    formRow('Nom et prénom du représentant habilité', `${data.representant_prenom || ''} ${data.representant_nom || ''}`.trim()),
    formRow('Qualité', data.representant_qualite || '[Qualité / Fonction]'),
    new TableRow({
      children: [new TableCell({
        columnSpan: 2,
        margins: { top: 500, bottom: 500, left: 120, right: 120 },
        borders: formBorders(),
        children: [
          new Paragraph({ children: [run('Signature et cachet de l\'entreprise :', { bold: true })] }),
          new Paragraph({ children: [run(' ')] }),
          new Paragraph({ children: [run(' ')] }),
        ],
      })],
    }),
  ]))

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'DC2 — ', size: 16, font: 'Arial', color: '9CA3AF' }),
              new TextRun({ text: data.raison_sociale || '', size: 16, font: 'Arial', color: '9CA3AF' }),
              new TextRun({ children: ['    Page ', PageNumber.CURRENT], size: 16, font: 'Arial', color: '9CA3AF' }),
            ],
            alignment: AlignmentType.RIGHT,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE } },
          })],
        }),
      },
      children: children as Paragraph[],
    }],
  })
  return await Packer.toBuffer(doc)
}

// ─── Mémoire technique (document libre, bien formaté) ────────────────────────
export async function generateMemoireDocx(titre: string, sections: { title: string; content: string }[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    heading1(`MÉMOIRE TECHNIQUE\n${titre}`),
    ...spacer(2),
  ]

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    children.push(heading2(`${i + 1}. ${s.title}`))
    const lines = s.content.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('###') ) {
        children.push(heading3(trimmed.replace(/^###\s*/, '')))
      } else if (trimmed.startsWith('##')) {
        children.push(heading2(trimmed.replace(/^##\s*/, '')))
      } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        children.push(new Paragraph({
          children: [run(trimmed.replace(/^[-•]\s*/, ''))],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }))
      } else if (trimmed) {
        children.push(para([run(trimmed)], { spaceAfter: 8 }))
      }
    }
    children.push(...spacer(1))
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
    },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'MÉMOIRE TECHNIQUE — ', bold: true, size: 16, color: BLUE_DARK, font: 'Arial' }),
              new TextRun({ text: titre, size: 16, color: '6B7280', font: 'Arial' }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ children: ['Page ', PageNumber.CURRENT], size: 16, font: 'Arial', color: '9CA3AF' }),
            ],
            alignment: AlignmentType.RIGHT,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE } },
          })],
        }),
      },
      children: children as Paragraph[],
    }],
  })
  return await Packer.toBuffer(doc)
}
