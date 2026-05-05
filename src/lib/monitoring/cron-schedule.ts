import { adminClient } from '@/lib/supabase/admin'

/**
 * Détermine si un cron source doit s'exécuter MAINTENANT selon ses settings DB.
 *
 * Approche : tous les crons Vercel tournent toutes les heures (déclencheur)
 * et chaque route check au démarrage si son preset matche l'heure courante.
 *
 * Permet à l'utilisateur de modifier la fréquence depuis l'UI sans redeploy.
 */

export type CronPreset = 'disabled' | 'daily' | 'every_2h' | 'every_4h' | 'every_8h' | 'every_12h' | 'hourly'

export interface CronSettings {
  source: string
  preset: CronPreset
  daily_hour_utc: number | null
  enabled: boolean
}

const PRESET_LABELS: Record<CronPreset, string> = {
  disabled: 'Désactivé',
  daily: 'Quotidien',
  every_2h: 'Toutes les 2h',
  every_4h: 'Toutes les 4h',
  every_8h: 'Toutes les 8h',
  every_12h: 'Toutes les 12h',
  hourly: 'Toutes les heures',
}

export function getPresetLabel(preset: CronPreset): string {
  return PRESET_LABELS[preset] ?? preset
}

/**
 * Décrit la prochaine occurrence prévue (texte humain).
 */
export function describeNextRun(settings: CronSettings, nowDate: Date = new Date()): string {
  if (!settings.enabled || settings.preset === 'disabled') return 'Désactivé'

  const hourUtc = nowDate.getUTCHours()
  switch (settings.preset) {
    case 'hourly':
      return 'Au début de chaque heure'
    case 'daily': {
      const h = settings.daily_hour_utc ?? 5
      // Convert UTC → local Europe/Paris pour l'affichage
      const parisOffset = nowDate.getTimezoneOffset() === 0 ? 1 : 0 // approx, on n'utilise pas Intl ici
      const localH = (h + 1 + parisOffset) % 24 // approx UTC+1 (CET) ou UTC+2 (CEST)
      return `Tous les jours à ${String(localH).padStart(2, '0')}h00 (Paris)`
    }
    case 'every_2h':
    case 'every_4h':
    case 'every_8h':
    case 'every_12h': {
      const interval = parseInt(settings.preset.split('_')[1].replace('h', ''))
      const next = Math.ceil((hourUtc + 1) / interval) * interval
      return `Toutes les ${interval}h (prochaine ~${next % 24}h UTC)`
    }
    default:
      return settings.preset
  }
}

/**
 * Vérifie si on doit run pour cette source à l'heure courante.
 * Renvoie {shouldRun, reason} pour debug.
 */
export async function shouldRunNow(source: string, nowDate: Date = new Date()): Promise<{ shouldRun: boolean; reason: string; settings?: CronSettings }> {
  const { data, error } = await adminClient
    .from('cron_settings')
    .select('source, preset, daily_hour_utc, enabled')
    .eq('source', source)
    .maybeSingle()

  if (error) {
    // En cas d'erreur DB, on laisse passer pour ne pas bloquer le sync.
    return { shouldRun: true, reason: `DB error: ${error.message} → fallback run` }
  }
  if (!data) {
    // Pas de config → comportement par défaut : run (compatible avec l'existant)
    return { shouldRun: true, reason: 'no settings → default run' }
  }

  const settings = data as CronSettings
  if (!settings.enabled || settings.preset === 'disabled') {
    return { shouldRun: false, reason: 'disabled', settings }
  }

  const hourUtc = nowDate.getUTCHours()
  const minuteUtc = nowDate.getUTCMinutes()

  switch (settings.preset) {
    case 'hourly':
      return { shouldRun: true, reason: 'hourly', settings }
    case 'daily': {
      const targetHour = settings.daily_hour_utc ?? 5
      // Vercel cron déclenche à HH:00 — on accepte une fenêtre 0-15 min
      if (hourUtc === targetHour && minuteUtc < 30) {
        return { shouldRun: true, reason: `daily ${targetHour}h match`, settings }
      }
      return { shouldRun: false, reason: `daily ${targetHour}h, current ${hourUtc}h${minuteUtc} no match`, settings }
    }
    case 'every_2h':
    case 'every_4h':
    case 'every_8h':
    case 'every_12h': {
      const interval = parseInt(settings.preset.split('_')[1].replace('h', ''))
      if (hourUtc % interval === 0 && minuteUtc < 30) {
        return { shouldRun: true, reason: `${settings.preset} match`, settings }
      }
      return { shouldRun: false, reason: `${settings.preset}, current ${hourUtc}h${minuteUtc} no match`, settings }
    }
    default:
      return { shouldRun: true, reason: 'unknown preset → fallback', settings }
  }
}

/**
 * Charge tous les settings (pour la page d'admin).
 */
export async function listCronSettings(): Promise<CronSettings[]> {
  const { data } = await adminClient
    .from('cron_settings')
    .select('source, preset, daily_hour_utc, enabled')
    .order('source')
  return (data ?? []) as CronSettings[]
}
