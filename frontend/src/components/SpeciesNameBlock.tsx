/**
 * Canonical species name hierarchy (S2/S3):
 * common (locale) → scientific (italic, always when taxon exists) → family
 * Never invents consumption permission language.
 * Scientific binomials stay Latin; never blank "undefined"/"null"/raw slug.
 */
import { useTranslation } from 'react-i18next'
import { getSpeciesByTaxon } from '../data/speciesCatalog'
import { enrichCommonNames } from '../data/commonNamesEs'
import { enrichCommonNamesEn } from '../data/commonNamesEn'
import { familyForTaxon } from '../data/genusFamilyMap'
import { familyNameEs } from '../data/familyNamesEs'

export const NO_LOCAL_COMMON_NAME = 'Sin nombre común local'
export const NO_LOCAL_COMMON_NAME_EN = 'No local common name'

/** English-only vernaculars that should not lead Spanish UI. */
const ENG_NOISE = new Set([
  'death cap',
  'destroying angel',
  'funeral bell',
  'false morel',
  'deadly webcap',
])

export type SpeciesNameBlockProps = {
  taxon: string
  /** Override common names (e.g. API prediction) */
  commonNames?: string[] | string | null
  family?: string | null
  familyEs?: string | null
  /** compact | default | large */
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showFamily?: boolean
  /** When true, common line is visually primary */
  commonFirst?: boolean
  /** BCP-47 / app locale; defaults to es when omitted (pure helper). */
  locale?: string
}

function polishTaxon(raw: string): string {
  const t = (raw || '').trim()
  if (!t || t === 'undefined' || t === 'null') return ''
  // Reject raw kebab slugs used as display names
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(t) && !t.includes(' ')) {
    const parts = t.split('-')
    if (parts.length >= 2) {
      const genus = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
      const rest = parts.slice(1).join(' ')
      return `${genus} ${rest}`
    }
  }
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return t
  const genus = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  const rest = parts.slice(1).map((p) => p.toLowerCase()).join(' ')
  return `${genus} ${rest}`
}

function asNameList(v: string[] | string | null | undefined): string[] {
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  if (Array.isArray(v)) {
    return v
      .map((c) => (c == null ? '' : String(c).trim()))
      .filter((c) => c && c !== 'undefined' && c !== 'null')
  }
  return []
}

function isEnglishLocale(locale?: string): boolean {
  return (locale || '').toLowerCase().startsWith('en')
}

/** Pure helper — used by UI and unit tests. */
export function resolveSpeciesDisplay(input: {
  taxon: string
  commonNames?: string[] | string | null
  family?: string | null
  familyEs?: string | null
  locale?: string
}): {
  taxon: string
  commonPrimary: string
  commonAll: string[]
  hasLocalCommon: boolean
  familyLatin: string | null
  familyEs: string | null
  familyLine: string | null
} {
  const en = isEnglishLocale(input.locale)
  const emptyLabel = en ? NO_LOCAL_COMMON_NAME_EN : NO_LOCAL_COMMON_NAME
  const taxon = polishTaxon(input.taxon) || 'Fungi'
  const cat = getSpeciesByTaxon(taxon)

  let commons: string[] = []
  const override = asNameList(input.commonNames)

  if (en) {
    // EN: prefer English commons; never leave blank — fall back to scientific only
    if (override.length) {
      commons = override
    } else if (cat?.common_names_en?.length) {
      commons = [...cat.common_names_en]
    } else {
      commons = enrichCommonNamesEn(taxon, [])
    }
    // Drop pure scientific duplicate if it was the only "common"
    commons = commons.filter((c) => c.toLowerCase() !== taxon.toLowerCase())
  } else {
    if (override.length) {
      commons = override
    } else if (cat?.common_names?.length) {
      commons = [...cat.common_names]
    } else {
      commons = enrichCommonNames(taxon, [])
    }
    // Drop English-only fillers for Spanish display when Spanish exists
    const hasEsLocal = commons.some((c) => !ENG_NOISE.has(c.toLowerCase()))
    if (hasEsLocal) {
      commons = commons.filter((c) => !ENG_NOISE.has(c.toLowerCase()))
    }
  }

  const familyLatin =
    (input.family && input.family !== 'undefined' ? input.family.trim() : '') ||
    cat?.family ||
    familyForTaxon(taxon, null) ||
    null
  const familyEsRaw =
    (input.familyEs && input.familyEs !== 'undefined' ? input.familyEs.trim() : '') ||
    cat?.family_es ||
    (familyLatin ? familyNameEs(familyLatin) : null) ||
    null
  const familyEs =
    familyEsRaw && familyEsRaw !== 'undefined' && familyEsRaw !== 'null'
      ? familyEsRaw
      : null

  // EN: Latin family only (Spanish family_es is UI chrome noise)
  let familyLine: string | null = null
  if (en) {
    familyLine =
      familyLatin && !/undefined|null/i.test(familyLatin) ? familyLatin : null
  } else if (familyEs && familyLatin && familyEs !== familyLatin) {
    familyLine = `${familyEs} · ${familyLatin}`
  } else if (familyEs || familyLatin) {
    familyLine = familyEs || familyLatin
  }
  // Never surface raw undefined/null tokens
  if (familyLine && /undefined|null/i.test(familyLine)) {
    familyLine = familyLatin && !/undefined|null/i.test(familyLatin) ? familyLatin : null
  }

  const hasLocalCommon = commons.length > 0
  // When no common name: EN falls back to scientific as display primary text
  // (still hasLocalCommon=false so UI can style empty state); ES keeps placeholder.
  const commonPrimary = hasLocalCommon
    ? commons[0]
    : en
      ? taxon
      : emptyLabel

  return {
    taxon,
    commonPrimary,
    commonAll: commons,
    hasLocalCommon,
    familyLatin,
    familyEs: familyEs && familyEs !== 'Sin familia' ? familyEs : familyEs,
    familyLine,
  }
}

export function SpeciesNameBlock({
  taxon,
  commonNames,
  family,
  familyEs,
  size = 'md',
  className = '',
  showFamily = true,
  commonFirst = true,
  locale: localeProp,
}: SpeciesNameBlockProps) {
  const { t, i18n } = useTranslation()
  const locale = localeProp || i18n.resolvedLanguage || i18n.language || 'es'
  const d = resolveSpeciesDisplay({ taxon, commonNames, family, familyEs, locale })

  const commonLine = d.hasLocalCommon
    ? d.commonPrimary
    : isEnglishLocale(locale)
      ? // Already falls back to scientific in resolveSpeciesDisplay for EN
        d.commonPrimary
      : t('names.noLocalCommon', { defaultValue: NO_LOCAL_COMMON_NAME })

  // Scientific is always present and italicizable when taxon exists
  const scientific = d.taxon || polishTaxon(taxon) || 'Fungi'

  return (
    <div className={`species-name-block species-name-block--${size} ${className}`.trim()}>
      {commonFirst ? (
        <>
          <p
            className={`species-name-block__common ${!d.hasLocalCommon ? 'is-empty' : ''}`}
          >
            {commonLine}
          </p>
          <p className="species-name-block__scientific">
            <em>{scientific}</em>
          </p>
        </>
      ) : (
        <>
          <p className="species-name-block__scientific">
            <em>{scientific}</em>
          </p>
          <p
            className={`species-name-block__common ${!d.hasLocalCommon ? 'is-empty' : ''}`}
          >
            {commonLine}
          </p>
        </>
      )}
      {showFamily && d.familyLine && (
        <p className="species-name-block__family" title={d.familyLatin || undefined}>
          {d.familyLine}
        </p>
      )}
    </div>
  )
}
