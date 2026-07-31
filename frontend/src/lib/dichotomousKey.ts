/**
 * Educational dichotomous key (MushroomExpert-lite, v1.11).
 *
 * Narrows the catalog by morphology questions (hymenium type, shape, etc.) so
 * users can explore and learn — NEVER to confirm consumption or forage safety.
 *
 * Policy: orientation only · results are study hints, never edible green-lights.
 * Every endpoint links to the species sheet for open study (Wiki/iNat/GBIF).
 */
import type { CatalogSpecies } from '../data/speciesCatalog'
import { matchesStudyTrait, type StudyTraitId } from './studyTraits'

export type DichotomousQuestionId =
  | 'hymenium'
  | 'shape'
  | 'cap_color_group'
  | 'stipe_ring'

export interface DichotomousOption {
  id: string
  /** i18n key under dichotomous.* — e.g. dichotomous.hymenium.gills */
  labelKey: string
  labelFallback: string
}

export interface DichotomousQuestion {
  id: DichotomousQuestionId
  /** i18n key — dichotomous.question.hymenium */
  titleKey: string
  titleFallback: string
  hintKey: string
  hintFallback: string
  options: DichotomousOption[]
}

/** Himenium options map to StudyTraitId directly. */
export const HYMENIUM_TRAIT_MAP: Record<string, StudyTraitId> = {
  gills: 'gills',
  pores: 'pores',
  folds: 'folds',
  teeth: 'teeth',
  ascomycete: 'ascomycete',
  other: 'other',
}

export const DICHOTOMOUS_QUESTIONS: readonly DichotomousQuestion[] = [
  {
    id: 'hymenium',
    titleKey: 'dichotomous.question.hymenium',
    titleFallback: '¿Qué tipo de himenio tiene debajo del sombrero?',
    hintKey: 'dichotomous.hint.hymenium',
    hintFallback:
      'Mira la parte inferior del sombrero. Láminas = laminillas radiales; poros = como una esponja; pliegues = falsas láminas; aguijones = picos.',
    options: [
      { id: 'gills', labelKey: 'dichotomous.hymenium.gills', labelFallback: 'Láminas' },
      { id: 'pores', labelKey: 'dichotomous.hymenium.pores', labelFallback: 'Poros / tubos' },
      { id: 'folds', labelKey: 'dichotomous.hymenium.folds', labelFallback: 'Pliegues falsos' },
      { id: 'teeth', labelKey: 'dichotomous.hymenium.teeth', labelFallback: 'Aguijones' },
      { id: 'ascomycete', labelKey: 'dichotomous.hymenium.ascomycete', labelFallback: 'Copa / colmena' },
      { id: 'other', labelKey: 'dichotomous.hymenium.other', labelFallback: 'Otra forma' },
    ],
  },
] as const

export type DichotomousAnswers = Partial<Record<DichotomousQuestionId, string>>

export interface DichotomousResult {
  matches: CatalogSpecies[]
  answeredCount: number
  totalQuestions: number
}

/**
 * Filter the catalog by the answered questions. Each answer narrows the set;
 * unanswered questions are skipped. Returns at most `limit` candidates so the
 * UI never implies a definitive ID.
 */
export function applyDichotomousKey(
  catalog: CatalogSpecies[],
  answers: DichotomousAnswers,
  limit = 12,
): DichotomousResult {
  let pool = catalog

  // Hymenium → studyTrait
  if (answers.hymenium && HYMENIUM_TRAIT_MAP[answers.hymenium]) {
    pool = pool.filter((s) => matchesStudyTrait(s, HYMENIUM_TRAIT_MAP[answers.hymenium!]))
  }

  const answeredCount = Object.values(answers).filter(Boolean).length
  return {
    matches: pool.slice(0, limit),
    answeredCount,
    totalQuestions: DICHOTOMOUS_QUESTIONS.length,
  }
}

/** Policy line — always shown on the key surface. */
export const DICHOTOMOUS_POLICY_ES =
  'Clave educativa de estudio — nunca confirma consumo ni identifica con seguridad. Solo orientación.'
