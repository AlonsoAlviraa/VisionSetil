/**
 * Canonical species name hierarchy (S2/S3):
 * common ES → scientific (italic) → family ES · Latin
 * Never invents consumption permission language.
 */
import { getSpeciesByTaxon } from '../data/speciesCatalog'
import { enrichCommonNames } from '../data/commonNamesEs'
import { familyForTaxon } from '../data/genusFamilyMap'
import { familyNameEs } from '../data/familyNamesEs'

export const NO_LOCAL_COMMON_NAME = 'Sin nombre común local'

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
}

/** Pure helper — used by UI and unit tests. */
export function resolveSpeciesDisplay(input: {
  taxon: string
  commonNames?: string[] | string | null
  family?: string | null
  familyEs?: string | null
}): {
  taxon: string
  commonPrimary: string
  commonAll: string[]
  hasLocalCommon: boolean
  familyLatin: string | null
  familyEs: string | null
  familyLine: string | null
} {
  const taxon = (input.taxon || '').trim() || 'Fungi'
  const cat = getSpeciesByTaxon(taxon)
  let commons: string[] = []
  if (typeof input.commonNames === 'string' && input.commonNames.trim()) {
    commons = [input.commonNames.trim()]
  } else if (Array.isArray(input.commonNames) && input.commonNames.length) {
    commons = input.commonNames.map((c) => c.trim()).filter(Boolean)
  } else if (cat?.common_names?.length) {
    commons = [...cat.common_names]
  } else {
    commons = enrichCommonNames(taxon, [])
  }
  // Drop English-only fillers for display
  const engNoise = new Set([
    'death cap',
    'destroying angel',
    'funeral bell',
    'false morel',
    'deadly webcap',
  ])
  commons = commons.filter((c) => !engNoise.has(c.toLowerCase()))

  const familyLatin =
    input.family?.trim() ||
    cat?.family ||
    familyForTaxon(taxon, null) ||
    null
  const familyEs =
    input.familyEs?.trim() ||
    cat?.family_es ||
    (familyLatin ? familyNameEs(familyLatin) : null) ||
    null

  let familyLine: string | null = null
  if (familyEs && familyLatin && familyEs !== familyLatin) {
    familyLine = `${familyEs} · ${familyLatin}`
  } else if (familyEs || familyLatin) {
    familyLine = familyEs || familyLatin
  }

  const hasLocalCommon = commons.length > 0
  return {
    taxon,
    commonPrimary: hasLocalCommon ? commons[0] : NO_LOCAL_COMMON_NAME,
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
}: SpeciesNameBlockProps) {
  const d = resolveSpeciesDisplay({ taxon, commonNames, family, familyEs })

  return (
    <div className={`species-name-block species-name-block--${size} ${className}`.trim()}>
      {commonFirst ? (
        <>
          <p
            className={`species-name-block__common ${!d.hasLocalCommon ? 'is-empty' : ''}`}
          >
            {d.commonPrimary}
          </p>
          <p className="species-name-block__scientific">
            <em>{d.taxon}</em>
          </p>
        </>
      ) : (
        <>
          <p className="species-name-block__scientific">
            <em>{d.taxon}</em>
          </p>
          <p
            className={`species-name-block__common ${!d.hasLocalCommon ? 'is-empty' : ''}`}
          >
            {d.commonPrimary}
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
