/**
 * Competitive adoption contracts — multi-angle capture + result lookalike CTAs
 * + phenology + Seek-style study badges + privacy strip + verification strip
 * + season educational challenge (games only).
 *
 * Safety: never edible green lights / consumption permission / research-grade from model.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VIEW_SLOTS, assessMultiViewReadiness } from './multiViewSlots'
import { buildPhenologyBar } from './phenology'
import { BADGE_DEFS, recordStudyActivity } from './studyBadges'
import { resolveVerificationStatus } from './verificationStatus'
import { dailyModeForRound, QUIZ_SEASON_OPTIONS } from './mushroomQuiz'

const root = resolve(__dirname, '../..')

describe('competitive feature adoption', () => {
  it('multi-view slots prioritize underside + profile (Picture Mushroom style)', () => {
    expect(VIEW_SLOTS[0].view).toBe('gills')
    expect(VIEW_SLOTS[0].required).toBe(true)
    expect(VIEW_SLOTS[1].view).toBe('front')
    expect(VIEW_SLOTS[1].required).toBe(true)
    expect(VIEW_SLOTS[0].hintEs.toLowerCase()).toMatch(/debajo|inferior|láminas|laminas/)
    expect(VIEW_SLOTS[1].hintEs.toLowerCase()).toMatch(/lado|perfil|pie/)
  })

  it('soft readiness allows single photo but warns on missing required', () => {
    const r = assessMultiViewReadiness({
      gills: { fileName: 'a.jpg', previewUrl: 'blob:a' },
    })
    expect(r.canSubmit).toBe(true)
    expect(r.missingRequired).toContain('front')
    expect(r.warningCodes.length).toBeGreaterThan(0)
  })

  it('ResultCard wires pair-specific critical_views for lookalikes', () => {
    const src = readFileSync(
      resolve(root, 'src/components/ResultCard.tsx'),
      'utf8',
    )
    expect(src).toMatch(/diagnosticForLookalikeMate/)
    expect(src).toMatch(/lookalike-item__diag/)
    expect(src).toMatch(/pairCriticalViews/)
    expect(src).toMatch(/orientation|nunca consumo|never consumption/i)
    expect(src).toMatch(/result-orientation-sticky|result-card--v182/)
    expect(src).toMatch(/result-packet-chip|result-card--v184/)
  })

  it('Identify page v1.8.4 visual polish chrome (flow + capture mode)', () => {
    const id = readFileSync(resolve(root, 'src/pages/IdentifyPage.tsx'), 'utf8')
    expect(id).toMatch(/page-identify--v184|data-capture-mode/)
    expect(id).toMatch(/identify-soft-confirm|preSubmitFreeModeCoach/)
  })

  it('v1.8.5 P14 capture density + free-mode polish + result view density', () => {
    const id = readFileSync(resolve(root, 'src/pages/IdentifyPage.tsx'), 'utf8')
    expect(id).toMatch(/identify-capture-density|freeModeCaptureCoachLine/)
    expect(id).toMatch(/identify-free-capture|identify-free-view-badge/)
    expect(id).toMatch(/capturePacketDensity|formatViewTypesShort/)
    expect(id.toLowerCase()).toMatch(/nunca permiso de consumo|solo orientación|orientation/)
    const rc = readFileSync(resolve(root, 'src/components/ResultCard.tsx'), 'utf8')
    expect(rc).toMatch(/result-view-density|result-card--v185/)
    expect(rc).toMatch(/capturePacketDensity|formatViewTypesShort/)
    const slots = readFileSync(resolve(root, 'src/lib/multiViewSlots.ts'), 'utf8')
    expect(slots).toMatch(/capturePacketDensity|freeModeCaptureCoachLine/)
    expect(slots.toLowerCase()).toMatch(/never edible|orientation only|nunca/)
  })

  it('Encyclopedia LookalikeCompare + Studio wire pair critical_views', () => {
    const compare = readFileSync(
      resolve(root, 'src/components/LookalikeCompare.tsx'),
      'utf8',
    )
    expect(compare).toMatch(/findDiagnosticPair/)
    expect(compare).toMatch(/lookalike-compare-diag/)
    expect(compare).toMatch(/pairDiagPolicy|nunca consumo/)
    const studio = readFileSync(
      resolve(root, 'src/pages/LookalikeStudioPage.tsx'),
      'utf8',
    )
    expect(studio).toMatch(/findDiagnosticPair|diagnosticForLookalikeMate/)
    expect(studio).toMatch(/studio-selection-diag|studio-classic-diag/)
  })

  it('Quiz lookalike feedback wires critical_views coach', () => {
    const quizLib = readFileSync(resolve(root, 'src/lib/mushroomQuiz.ts'), 'utf8')
    expect(quizLib).toMatch(/findDiagnosticPair/)
    expect(quizLib).toMatch(/critical_views/)
    const page = readFileSync(resolve(root, 'src/pages/QuizGamePage.tsx'), 'utf8')
    expect(page).toMatch(/quiz-lookalike-diag|critical_views/)
    expect(page).toMatch(/pairCriticalViews|pairDiagPolicy/)
  })

  it('Expert handoff packages lookalike critical_views for mycologist review', () => {
    const handoff = readFileSync(resolve(root, 'src/lib/expertHandoff.ts'), 'utf8')
    expect(handoff).toMatch(/buildLookalikeDiagnostics/)
    expect(handoff).toMatch(/lookalike_diagnostics/)
    expect(handoff).toMatch(/missing_critical_views/)
    const page = readFileSync(resolve(root, 'src/pages/ExpertReviewPage.tsx'), 'utf8')
    expect(page).toMatch(/expert-lookalike-diag|lookalike_diagnostics/)
  })

  it('Education page teaches multi-view diagnostic pairs (orientation only)', () => {
    const edu = readFileSync(resolve(root, 'src/pages/EducationPage.tsx'), 'utf8')
    expect(edu).toMatch(/deadlyDiagnosticPairs|deadlyPriorityViews/)
    expect(edu).toMatch(/edu-multiview-diagnostic/)
    expect(edu).toMatch(/deadlyCoach/)
    expect(edu).toMatch(/orientation|nunca consumo|pairDiagPolicy/i)
  })

  it('Offline pack + Community surface multi-view honesty (no unlock)', () => {
    const offline = readFileSync(resolve(root, 'src/pages/OfflinePackPage.tsx'), 'utf8')
    expect(offline).toMatch(/offlinePackMultiviewHonesty|offline-multiview-honesty/)
    expect(offline).toMatch(/product_unlock|pairDiagPolicy|nunca consumo/i)
    const community = readFileSync(resolve(root, 'src/pages/CommunityPage.tsx'), 'utf8')
    expect(community).toMatch(/community-multiview-tip/)
    expect(community).toMatch(/l[aá]minas|gills|perfil|nunca consumo/i)
  })

  it('Home + Map surface multi-view diagnostic coach (orientation only)', () => {
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/home-multiview-coach|deadlyPriorityViews/)
    expect(home).toMatch(/home-trust-multiview/)
    expect(home).toMatch(/nunca consumo|orientaci/i)
    const map = readFileSync(resolve(root, 'src/pages/SpainMapPage.tsx'), 'utf8')
    expect(map).toMatch(/map-multiview-chip/)
    expect(map).toMatch(/multi-vista|no recolección|no identifica/i)
  })

  it('PreflightBanner wires multiview diagnostic tip (no unlock language)', () => {
    const src = readFileSync(
      resolve(root, 'src/components/PreflightBanner.tsx'),
      'utf8',
    )
    expect(src).toMatch(/preflight-multiview-tip|deadlyPriorityViews/)
    expect(src).toMatch(/nunca consumo|orientaci/i)
    expect(src).not.toMatch(/product_unlock\s*=\s*true|safe to eat/i)
  })

  it('ML dashboard surfaces E21 readiness fail-closed (never launched)', () => {
    const dash = readFileSync(
      resolve(root, 'src/pages/MlDashboardPage.tsx'),
      'utf8',
    )
    expect(dash).toMatch(/e21_readiness|ml-e21-readiness/)
    expect(dash).toMatch(/ml-e21-launched/)
    expect(dash).toMatch(/never auto|unlock=false/i)
  })

  it('M3 field holdout surfaces on ML dashboard + multiview product', () => {
    const dash = readFileSync(resolve(root, 'src/pages/MlDashboardPage.tsx'), 'utf8')
    expect(dash).toMatch(/ml-field-holdout-m3|field_holdout_m3/)
    expect(dash).toMatch(/same.specimen|same_specimen|field holdout/i)
    expect(dash.toLowerCase()).toMatch(/nunca|never consumption|product_unlock=false/)
    const mv = readFileSync(
      resolve(root, '../backend/app/ml/multiview_product.py'),
      'utf8',
    )
    expect(mv).toMatch(/field_holdout_m3|field_multiview_holdout/)
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/home-field-holdout-note|fieldHoldoutCoachLines/)
    expect(home.toLowerCase()).toMatch(/nunca|consumo|lookalike|open-set/)
    const lib = readFileSync(resolve(root, 'src/lib/fieldHoldoutHonesty.ts'), 'utf8')
    expect(lib).toMatch(/FIELD_HOLDOUT_PROTOCOL|same_specimen/)
    expect(lib).toMatch(/product_unlock:\s*false/)
  })

  it('Games + footer surface multiview field honesty (orientation only)', () => {
    const wordle = readFileSync(
      resolve(root, 'src/pages/MushroomWordlePage.tsx'),
      'utf8',
    )
    expect(wordle).toMatch(/wordle-multiview-tip/)
    expect(wordle).toMatch(/l[aá]minas|nunca consumo/i)
    const setadle = readFileSync(resolve(root, 'src/pages/SetadlePage.tsx'), 'utf8')
    expect(setadle).toMatch(/setadle-multiview-tip/)
    expect(setadle).toMatch(/l[aá]minas|nunca consumo/i)
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
    expect(app).toMatch(/footer-multiview-note|footer-education/)
    expect(app).toMatch(/footer-lookalikes/)
    expect(app).toMatch(/nunca consumo|orientaci/i)
  })

  it('History notebook detail wires lookalike critical_views chips', () => {
    const src = readFileSync(resolve(root, 'src/pages/HistoryPage.tsx'), 'utf8')
    expect(src).toMatch(/diagnosticForLookalikeMate/)
    expect(src).toMatch(/notebook-lookalikes/)
    expect(src).toMatch(/notebook-lookalike-diag-/)
    expect(src).toMatch(/critical_views/)
    expect(src.toLowerCase()).toMatch(/nunca consumo|orientaci/)
  })

  it('Species detail + beta feedback surface multiview diagnostic honesty', () => {
    const detail = readFileSync(resolve(root, 'src/pages/SpeciesDetailPage.tsx'), 'utf8')
    expect(detail).toMatch(/species-detail-multiview/)
    expect(detail).toMatch(/deadlyPriorityViews|deadlyCoach/)
    expect(detail).toMatch(/diagnosticPolicy/)
    expect(detail).toMatch(/species-detail-multiview-priority/)
    expect(detail.toLowerCase()).toMatch(/nunca consumo|orientaci/)
    const beta = readFileSync(resolve(root, 'src/pages/BetaFeedbackPage.tsx'), 'utf8')
    expect(beta).toMatch(/beta-feedback-multiview-tip/)
    expect(beta).toMatch(/gills|l[aá]minas|front|detail|volva/i)
    expect(beta).toMatch(/beta-feedback-multiphoto-hint/)
    expect(beta).toMatch(/parcial_diag/)
    expect(beta.toLowerCase()).toMatch(/nunca consumo|orientaci/)
  })

  it('Index Fungorum nomenclature wire (species detail + footer attribution)', () => {
    const detail = readFileSync(resolve(root, 'src/pages/SpeciesDetailPage.tsx'), 'utf8')
    expect(detail).toMatch(/resolveIndexFungorumName|species-if-nomen/)
    expect(detail).toMatch(/INDEX_FUNGORUM_HOME|indexFungorumPolicy/)
    expect(detail.toLowerCase()).toMatch(/nomenclatura|nunca|ssot|consumo/)
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
    expect(app).toMatch(/footer-index-fungorum|indexfungorum\.org/)
    const lib = readFileSync(resolve(root, 'src/lib/indexFungorum.ts'), 'utf8')
    expect(lib).toMatch(/nomenclature\/resolve/)
    expect(lib.toLowerCase()).toMatch(/never consumption|nunca|not consumption/)
  })

  it('P18 model card + docs IF citation + ML dashboard panel', () => {
    const modelCard = readFileSync(resolve(root, '../docs/MODEL_CARD.md'), 'utf8')
    expect(modelCard).toMatch(/Index Fungorum/)
    expect(modelCard).toMatch(/Royal Botanic Gardens, Kew|RBG Kew/i)
    expect(modelCard).toMatch(/indexfungorum\.org/)
    expect(modelCard.toLowerCase()).toMatch(/never consumption|not consumption|nunca|orientation/)
    expect(modelCard).not.toMatch(/product_unlock\s*=\s*true/i)
    // Prohibition phrases OK; positive edible clearance is not
    expect(modelCard.toLowerCase()).not.toMatch(
      /is safe to eat|safe for consumption|edible clearance granted/,
    )
    const ifDoc = readFileSync(resolve(root, '../docs/INDEX_FUNGORUM.md'), 'utf8')
    expect(ifDoc).toMatch(/fungus\.asmx|NameSearch/)
    expect(ifDoc).toMatch(/Citation|citaci/i)
    const dash = readFileSync(resolve(root, 'src/pages/MlDashboardPage.tsx'), 'utf8')
    expect(dash).toMatch(/ml-model-card-nomenclature|ml-if-citation/)
    expect(dash).toMatch(/MODEL_CARD\.md|INDEX_FUNGORUM\.md/)
    const routes = readFileSync(
      resolve(root, '../backend/app/api/routes_models.py'),
      'utf8',
    )
    expect(routes).toMatch(/nomenclature|attribution_block|MODEL_CARD/)
  })

  it('v1.9.1 P17 encyclopedia search boost by IF current name', () => {
    const ency = readFileSync(resolve(root, 'src/pages/EncyclopediaPage.tsx'), 'utf8')
    expect(ency).toMatch(/nomenclatureHints|ifSearchHintFromResolve|ency-if-search-hint/)
    expect(ency).toMatch(/looksLikeScientificQuery|resolveIndexFungorumName/)
    expect(ency.toLowerCase()).toMatch(/nomenclatura|nunca permiso de consumo|ssot/)
    const search = readFileSync(resolve(root, 'src/lib/catalogSearch.ts'), 'utf8')
    expect(search).toMatch(/nomenclatureHints|aliasesForTaxon|scoreTaxonAgainstNomenclature/)
    const lib = readFileSync(resolve(root, 'src/lib/indexFungorum.ts'), 'utf8')
    expect(lib).toMatch(/nomenclatureQueryVariants|ifSearchHintFromResolve/)
  })

  it('Encyclopedia browse + NotFound surface multiview field honesty', () => {
    const ency = readFileSync(resolve(root, 'src/pages/EncyclopediaPage.tsx'), 'utf8')
    expect(ency).toMatch(/encyclopedia-multiview-tip/)
    expect(ency).toMatch(/deadlyPriorityViews/)
    expect(ency).toMatch(/encyclopedia-multiview-priority/)
    expect(ency.toLowerCase()).toMatch(/nunca consumo|orientaci|no autoriza/)
    const nf = readFileSync(resolve(root, 'src/pages/NotFoundPage.tsx'), 'utf8')
    expect(nf).toMatch(/not-found-multiview-tip/)
    expect(nf).toMatch(/deadlyPriorityViews/)
    expect(nf).toMatch(/not-found-cta-identify/)
    expect(nf.toLowerCase()).toMatch(/nunca consumo|orientaci/)
  })

  it('Encyclopedia educational trait filters (study shortlists, never forage)', () => {
    const ency = readFileSync(resolve(root, 'src/pages/EncyclopediaPage.tsx'), 'utf8')
    expect(ency).toMatch(/ency-trait-filters/)
    expect(ency).toMatch(/filterByStudyTrait|STUDY_TRAIT_OPTIONS/)
    expect(ency).toMatch(/ency-trait-policy/)
    expect(ency.toLowerCase()).toMatch(/nunca|orientaci|estudio/)
    const traits = readFileSync(resolve(root, 'src/lib/studyTraits.ts'), 'utf8')
    expect(traits).toMatch(/gills|pores|folds|teeth|ascomycete/)
    expect(traits.toLowerCase()).toMatch(/never consumption|nunca permiso|orientation only/)
  })

  it('Home discover hub + mobile Identify FAB (visual product surfaces)', () => {
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/home-discover-hub/)
    expect(home).toMatch(/home-discover-identify/)
    expect(home).toMatch(/home-discover-lookalikes/)
    expect(home.toLowerCase()).toMatch(/nunca permiso de consumo|orientaci/)
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
    expect(app).toMatch(/fab-identify/)
    expect(app).toMatch(/footer--v16|footer-multiview-note/)
  })

  it('v1.9.3 home residual polish + orientation sticky + IF trust', () => {
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/home-mkt--v193|home-orientation-sticky|home-page-v193/)
    expect(home).toMatch(/home-trust-nomenclature|trustIfTitle/)
    expect(home).toMatch(/home-discover-notebook|historial/)
    expect(home.toLowerCase()).toMatch(/nunca permiso de consumo|orientaci|index fungorum|ssot/)
  })

  it('v1.9.4 M2 ECE residual honesty on ML dashboard', () => {
    const ml = readFileSync(resolve(root, 'src/pages/MlDashboardPage.tsx'), 'utf8')
    expect(ml).toMatch(/ml-ece-residual|normalizeEceResidual|ece_residual/)
    expect(ml).toMatch(/data-product-unlock="false"/)
    expect(ml.toLowerCase()).toMatch(/nunca consumo|orientaci|ece/)
    const lib = readFileSync(resolve(root, 'src/lib/eceHonesty.ts'), 'utf8')
    expect(lib).toMatch(/classifyEceBand|eceProductGuidance/)
    expect(lib.toLowerCase()).toMatch(/never consumption|nunca/)
  })

  it('v1.9.6 ECE confidence chrome on ResultCard + Identify (high residual hides %)', () => {
    const rc = readFileSync(resolve(root, 'src/components/ResultCard.tsx'), 'utf8')
    expect(rc).toMatch(/resolveIdentifyConfidenceChrome|result-ece-sticky|E20_ECE_SNAPSHOT/)
    expect(rc).toMatch(/data-ece-band|result-card--v196|result-card--ece-deemph/)
    const id = readFileSync(resolve(root, 'src/pages/IdentifyPage.tsx'), 'utf8')
    expect(id).toMatch(/identify-ece-note|identify-field-holdout-note/)
    expect(id).toMatch(/eceConfidenceStickyLine|fieldHoldoutCoachLines/)
    const lib = readFileSync(resolve(root, 'src/lib/eceHonesty.ts'), 'utf8')
    expect(lib).toMatch(/resolveIdentifyConfidenceChrome/)
    expect(lib).toMatch(/productUnlock:\s*false|product_unlock:\s*false/)
  })

  it('v1.9.7 live ece_residual from /models/status into Identify ResultCard', () => {
    const id = readFileSync(resolve(root, 'src/pages/IdentifyPage.tsx'), 'utf8')
    expect(id).toMatch(/fetchEceBandForIdentify|eceBand/)
    expect(id).toMatch(/eceBand=\{eceBand\}/)
    expect(id).toMatch(/data-ece-source/)
    const lib = readFileSync(resolve(root, 'src/lib/eceHonesty.ts'), 'utf8')
    expect(lib).toMatch(/fetchEceBandForIdentify|eceBandFromModelsStatus/)
    expect(lib).toMatch(/models\/status/)
    expect(lib).toMatch(/source:\s*'snapshot'|E20_ECE_SNAPSHOT/)
  })

  it('v1.9.8 S9 traffic depth honesty on ML dashboard', () => {
    const dash = readFileSync(resolve(root, 'src/pages/MlDashboardPage.tsx'), 'utf8')
    expect(dash).toMatch(/ml-s9-traffic-depth|normalizeS9LiveReject|traffic_depth/)
    expect(dash).toMatch(/ml-s9-modes|data-product-unlock="false"/)
    expect(dash.toLowerCase()).toMatch(/nunca|product_unlock=false|orientaci/)
    const lib = readFileSync(resolve(root, 'src/lib/s9LiveRejectHonesty.ts'), 'utf8')
    expect(lib).toMatch(/classifyS9TrafficDepth|normalizeS9LiveReject/)
    expect(lib).toMatch(/productUnlock:\s*false/)
  })

  it('v1.9.9 S9 classification log stamps view_coverage + product_unlock false', () => {
    const fl = readFileSync(
      resolve(root, '../backend/app/services/feedback_logger.py'),
      'utf8',
    )
    expect(fl).toMatch(/build_s9_log_entry|normalize_view_coverage/)
    expect(fl).toMatch(/view_coverage|product_unlock/)
    expect(fl).toMatch(/orientation_only_never_consume|utc_iso_now/)
    const clf = readFileSync(
      resolve(root, '../backend/app/services/classify_simple.py'),
      'utf8',
    )
    expect(clf).toMatch(/view_coverage|log_classification/)
    expect(clf).toMatch(/product_unlock.*False|product_unlock\": False/)
  })

  it('Identify soft pre-submit coach + wizard framing guides (soft path)', () => {
    const id = readFileSync(resolve(root, 'src/pages/IdentifyPage.tsx'), 'utf8')
    expect(id).toMatch(/preSubmitMultiViewCoach|identify-soft-confirm/)
    expect(id).toMatch(/requestClassify|confirmClassifySoft/)
    expect(id.toLowerCase()).toMatch(/orientaci|nunca consumo|soft/)
    const wiz = readFileSync(resolve(root, 'src/components/MultiViewWizard.tsx'), 'utf8')
    expect(wiz).toMatch(/framingGuideForView|mv-frame-guide/)
    expect(wiz).not.toMatch(/safe to eat|product_unlock\s*=\s*true/i)
  })

  it('History notebook private geo pins (EXIF stripped, local only)', () => {
    const hist = readFileSync(resolve(root, 'src/pages/HistoryPage.tsx'), 'utf8')
    expect(hist).toMatch(/notebook-pin-block|notebookGeo/)
    expect(hist).toMatch(/requestBrowserNotebookPin|parseManualPinInput/)
    expect(hist).toMatch(/coords_only_no_exif|NOTEBOOK_GEO_POLICY|sin EXIF|no EXIF|notebookGeoPolicy/i)
    const geo = readFileSync(resolve(root, 'src/lib/notebookGeo.ts'), 'utf8')
    expect(geo).toMatch(/coords_only_no_exif/)
    expect(geo.toLowerCase()).toMatch(/never store|no exif|privacy/)
  })

  it('v1.8.3 notebook private pin list table (local · not marketplace)', () => {
    const hist = readFileSync(resolve(root, 'src/pages/HistoryPage.tsx'), 'utf8')
    expect(hist).toMatch(/notebook-pin-list|listNotebookPinsFromEntries/)
    expect(hist).toMatch(/notebookPinsShareText|summarizeNotebookPins/)
    expect(hist.toLowerCase()).toMatch(/no marketplace|sin exif|no exif|coords only/)
    const geo = readFileSync(resolve(root, 'src/lib/notebookGeo.ts'), 'utf8')
    expect(geo).toMatch(/listNotebookPinsFromEntries/)
    expect(geo).toMatch(/notebookPinsShareText/)
    expect(geo.toLowerCase()).not.toMatch(/marketplace upload|forage permission/)
    const es = readFileSync(resolve(root, 'src/locales/es/common.json'), 'utf8')
    const en = readFileSync(resolve(root, 'src/locales/en/common.json'), 'utf8')
    expect(es).toMatch(/"pinListTitle"/)
    expect(en).toMatch(/"pinListTitle"/)
    expect(es).toMatch(/"softConfirm"/)
    expect(en).toMatch(/"softConfirm"/)
    expect(es).toMatch(/"consensusTitle"/)
    expect(en).toMatch(/"consensusTitle"/)
    expect(es).toMatch(/"gpsPinLabel"/)
    expect(en).toMatch(/"gpsPinLabel"/)
  })

  it('v1.8 free-mode soft coach + identify GPS pin + camera framing', () => {
    const id = readFileSync(resolve(root, 'src/pages/IdentifyPage.tsx'), 'utf8')
    expect(id).toMatch(/preSubmitFreeModeCoach/)
    expect(id).toMatch(/identify-gps-pin-toggle|attachGpsPin/)
    expect(id).toMatch(/requestBrowserNotebookPin/)
    expect(id).toMatch(/buildHistoryEntry/)
    expect(id).toMatch(/nextCameraSlot|cameraTargetSlot/)
    const cam = readFileSync(resolve(root, 'src/components/CameraCapture.tsx'), 'utf8')
    expect(cam).toMatch(/camera-frame-assist/)
    expect(cam.toLowerCase()).toMatch(/no identifica|nunca|encuadre/)
    const slots = readFileSync(resolve(root, 'src/lib/multiViewSlots.ts'), 'utf8')
    expect(slots).toMatch(/preSubmitFreeModeCoach/)
  })

  it('v1.8 community human consensus + offline encyclopedia depth', () => {
    const community = readFileSync(resolve(root, 'src/pages/CommunityPage.tsx'), 'utf8')
    expect(community).toMatch(/community-consensus-strip|communityConsensusChip/)
    expect(community).toMatch(/community-consensus-chip/)
    expect(community.toLowerCase()).toMatch(/research-grade|nunca consumo|orientaci/)
    const offline = readFileSync(resolve(root, 'src/pages/OfflinePackPage.tsx'), 'utf8')
    expect(offline).toMatch(/offline-ency-depth/)
    expect(offline.toLowerCase()).toMatch(/nunca identifica|estudio|consumo/)
  })

  it('Auth (login/register) + PWA install surface multiview / orientation honesty', () => {
    const login = readFileSync(resolve(root, 'src/pages/LoginPage.tsx'), 'utf8')
    expect(login).toMatch(/login-multiview-tip/)
    expect(login).toMatch(/deadlyPriorityViews/)
    expect(login).toMatch(/login-orientation-policy/)
    expect(login.toLowerCase()).toMatch(/nunca consumo|no autoriza/)
    const reg = readFileSync(resolve(root, 'src/pages/RegisterPage.tsx'), 'utf8')
    expect(reg).toMatch(/register-multiview-tip/)
    expect(reg).toMatch(/deadlyPriorityViews/)
    expect(reg).toMatch(/register-orientation-policy/)
    expect(reg.toLowerCase()).toMatch(/nunca consumo|no autoriza/)
    const pwa = readFileSync(resolve(root, 'src/components/PwaInstallHint.tsx'), 'utf8')
    expect(pwa).toMatch(/pwa-install-multiview-note|pwa-ios-multiview-note/)
    expect(pwa).toMatch(/pwa-install-identify|pwa-ios-identify/)
    expect(pwa.toLowerCase()).toMatch(/nunca consumo|orientaci|offline/)
  })

  it('Home + footer try-first CTAs and beta feedback entry', () => {
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/home-cta-identify/)
    expect(home).toMatch(/Probar Identificar|ctaTryIdentify/)
    expect(home).toMatch(/home-beta-feedback/)
    expect(home).toMatch(/betaFeedbackHref/)
    expect(home).toMatch(/betaFeedbackConfig/)
    expect(home).toMatch(/home-beta-feedback-source/)
    expect(home).toMatch(/home-install-guide/)
    expect(home).toMatch(/Abrir en el m[oó]vil|Instalar app|installTitle/i)
    expect(home).toMatch(/isPublicAppUrlConfigured/)
    expect(home).toMatch(/home-public-url-missing/)
    expect(home).toMatch(/import\.meta\.env\.DEV/)
    expect(home).toMatch(/WaitlistTemporada/)
    const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
    expect(app).toMatch(/tryIdentify|Probar Identificar/)
    expect(app).toMatch(/betaFeedbackHref/)
    expect(app).toMatch(/betaFeedback/)
    expect(app).toMatch(/PwaInstallHint/)
    const gtm = readFileSync(resolve(root, '../docs/GTM_BETA_COHORT.md'), 'utf8')
    expect(gtm).toMatch(/VITE_BETA_FEEDBACK_URL/)
    expect(gtm).toMatch(/HOSTING_DEPLOY_BETA/)
    expect(gtm).toMatch(/Añadir a pantalla de inicio/)
    expect(gtm.toLowerCase()).toMatch(/forbidden|nunca permiso de consumo|never/)
    const hosting = readFileSync(resolve(root, '../docs/HOSTING_DEPLOY_BETA.md'), 'utf8')
    expect(hosting).toMatch(/Path A/)
    expect(hosting).toMatch(/deploy\/Caddyfile|Caddy/)
    expect(hosting).toMatch(/VITE_PUBLIC_APP_URL/)
    expect(hosting).toMatch(/product_unlock.*(false|operator)|stays \*\*false\*\*/i)
  })

  it('MultiViewWizard shows progressive soft coach (never hard-block default)', () => {
    const wiz = readFileSync(
      resolve(root, 'src/components/MultiViewWizard.tsx'),
      'utf8',
    )
    expect(wiz).toMatch(/progressiveMultiViewCoach/)
    expect(wiz).toMatch(/mv-progressive-coach/)
    expect(wiz).toMatch(/softOk|Envío soft|soft/)
  })

  it('ML dashboard surfaces operator unlock runbook + fail-closed eval', () => {
    const dash = readFileSync(
      resolve(root, 'src/pages/MlDashboardPage.tsx'),
      'utf8',
    )
    expect(dash).toMatch(/ml-operator-unlock-panel/)
    expect(dash).toMatch(/ml-product-unlock-status/)
    expect(dash).toMatch(/ml-live-reject-status/)
    expect(dash).toMatch(/ml-s9-ops-panel/)
    expect(dash).toMatch(/ml-s9-windows/)
    expect(dash).toMatch(/ml-s9-reasons/)
    expect(dash).toMatch(/ml-s9-multiview/)
    expect(dash).toMatch(/health_flags/)
    expect(dash).toMatch(/live_reject_monitor --write|live_reject_monitor/)
    expect(dash).toMatch(/product_unlock_eval/)
    expect(dash).toMatch(/unlock_eligible_advisory/)
    expect(dash).toMatch(/eligible_but_locked/)
    expect(dash).toMatch(/residual_lock_reasons/)
    expect(dash).toMatch(/operator_action/)
    expect(dash).toMatch(/operator_unlock_ops/)
    expect(dash).toMatch(/OPERATOR_UNLOCK_RUNBOOK/)
    expect(dash).toMatch(/python -m kaggle\.ml_qa\.gate_eval/)
    // Forage/consumption bound from ops/eval (API-reflected), not a bare hardcode
    expect(dash).toMatch(/ml-forage-consumption/)
    expect(dash).toMatch(/forage_permission/)
    expect(dash).toMatch(/consumption_permission/)
    expect(dash.toLowerCase()).toMatch(/orientation only|never consumption|nunca consumo/)
    // Metrics eligibility ≠ forage; soft gates advisory only
    expect(dash).toMatch(/ml-metrics-not-forage-note|ml-advisory-vs-serve/)
    expect(dash.toLowerCase()).toMatch(
      /not.*forage permission|metrics eligibility is.*not.*forage|advisory only/,
    )
    expect(dash.toLowerCase()).toMatch(/safe to eat|soft map\/deadly|deadly confusions/)
    expect(dash).toMatch(/PRODUCT_UNLOCK never launches E21|does not launch E21/)
    expect(dash).toMatch(/ml-e21-kaggle-push|kaggle_push/)
    // Hard-coded product_unlock display must default false, never claim true
    expect(dash).toMatch(/product_unlock.*false|String\(summary\?\.product_unlock \?\? false\)/)
    const runbook = readFileSync(
      resolve(root, '../docs/OPERATOR_UNLOCK_RUNBOOK.md'),
      'utf8',
    )
    expect(runbook).toMatch(/product_unlock/)
    expect(runbook).toMatch(/false/)
    expect(runbook).toMatch(/orientation_only/)
    expect(runbook).toMatch(/python -m kaggle\.ml_qa\.gate_eval/)
    expect(runbook).toMatch(/kernel_output_v20|evaluate_e20_local_artifacts/)
    expect(runbook.toLowerCase()).toMatch(/never auto|human operator/)
    expect(runbook.toLowerCase()).toMatch(/forage|consumption/)
  })

  it('ResultCard wires always-visible Studio + community CTAs + verification strip', () => {
    const src = readFileSync(
      resolve(root, 'src/components/ResultCard.tsx'),
      'utf8',
    )
    expect(src).toMatch(/cta-lookalike-studio-from-result/)
    expect(src).toMatch(/cta-community-from-result/)
    expect(src).toMatch(/to="\/lookalikes"/)
    expect(src).toMatch(/to="\/comunidad"/)
    expect(src).toMatch(/result-verification-status/)
    expect(src).toMatch(/resolveVerificationStatus/)
    expect(src).toMatch(/data-research-grade="false"/)
    // CTAs must not be gated only on rankedLookalikes.length
    expect(src).toMatch(/Always-visible second-opinion CTAs/)
  })

  it('verification status never mints research-grade or edible clearance', () => {
    const s = resolveVerificationStatus({
      decision: 'accepted',
      missing_evidence: [],
      recommend_human_review: false,
      dangerous_lookalikes: [],
      open_set_reason: null,
      warnings: [],
    })
    expect(s.isResearchGrade).toBe(false)
    const blob = `${s.titleEn} ${s.bodyEn} ${s.titleEs} ${s.bodyEs}`.toLowerCase()
    expect(blob).not.toMatch(/safe to eat|permiso de consumo/)
    expect(blob).toMatch(/provisional|orientaci|not inat research-grade|no es research-grade/)
  })

  it('competitive doc and home differentiators exist', () => {
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/mkt-diff/)
    expect(home).toMatch(/diffMultiTitle|Multi-foto/)
    const doc = readFileSync(
      resolve(root, '../docs/COMPETITIVE_APPS.md'),
      'utf8',
    )
    expect(doc).toMatch(/Picture Mushroom/)
    expect(doc).toMatch(/never consumption/i)
    expect(doc).toMatch(/PhenologyBar|study badges|privacy strip/i)
  })

  it('Identify always shows pro-check strip (no app is food-safe)', () => {
    const id = readFileSync(resolve(root, 'src/pages/IdentifyPage.tsx'), 'utf8')
    expect(id).toMatch(/identify-pro-check/)
    expect(id.toLowerCase()).toMatch(/micólogo|mycologist|ninguna app/)
    expect(id.toLowerCase()).not.toMatch(/safe to eat/)
  })

  it('Home privacy strip: explore without account (Seek-like)', () => {
    const home = readFileSync(resolve(root, 'src/pages/HomePage.tsx'), 'utf8')
    expect(home).toMatch(/home-privacy-strip/)
    expect(home.toLowerCase()).toMatch(/sin cuenta|without account|no.?account/)
    expect(home.toLowerCase()).toMatch(/nunca pedimos permiso de consumo|never/)
  })

  it('Species detail embeds educational phenology bar', () => {
    const detail = readFileSync(
      resolve(root, 'src/pages/SpeciesDetailPage.tsx'),
      'utf8',
    )
    expect(detail).toMatch(/PhenologyBar/)
    const bar = buildPhenologyBar('Otoño', { now: new Date(2026, 9, 1) })
    expect(bar.months.some((m) => m.active)).toBe(true)
    // Must explicitly deny harvest/consumption permission (safety copy)
    expect(bar.disclaimer.toLowerCase()).toMatch(/educativ/)
    expect(bar.disclaimer.toLowerCase()).toMatch(/no es calendario|not a harvest|ni permiso|never/)
    expect(bar.disclaimer.toLowerCase()).not.toMatch(/safe to eat|autoriza el consumo/)
  })

  it('Quiz + Setadle wire study badges (Seek-style, educational only)', () => {
    const quiz = readFileSync(resolve(root, 'src/pages/QuizGamePage.tsx'), 'utf8')
    const setadle = readFileSync(resolve(root, 'src/pages/SetadlePage.tsx'), 'utf8')
    expect(quiz).toMatch(/StudyBadgesPanel|recordStudyActivity/)
    expect(setadle).toMatch(/StudyBadgesPanel|recordStudyActivity/)
    const blob = BADGE_DEFS.map((b) => b.titleEn + b.blurbEn).join(' ').toLowerCase()
    expect(blob).not.toMatch(/edible|safe to eat/)
    const mem = {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null
      },
      setItem(k: string, v: string) {
        this.store[k] = v
      },
    }
    const r = recordStudyActivity('quiz', { storage: mem, date: new Date(2026, 0, 1) })
    expect(r.newlyEarned).toContain('first_quiz')
  })

  it('Seek-style season challenge category is educational only', () => {
    const quiz = readFileSync(resolve(root, 'src/pages/QuizGamePage.tsx'), 'utf8')
    expect(quiz).toMatch(/modeSeason|season/)
    expect(quiz).toMatch(/quiz-season-answers|mode: 'season'|"season"/)
    expect(QUIZ_SEASON_OPTIONS).toHaveLength(4)
    const seasonBlob = QUIZ_SEASON_OPTIONS.map((o) => o.label + o.hint).join(' ').toLowerCase()
    expect(seasonBlob).toMatch(/educativo|no es recolecci/)
    expect(seasonBlob).not.toMatch(/safe to eat|permiso de consumo/)
    const modes = [0, 1, 2, 3, 4].map(dailyModeForRound)
    expect(modes).toContain('season')
  })

  it('must_not safety rails remain in competitive doc', () => {
    const doc = readFileSync(
      resolve(root, '../docs/COMPETITIVE_APPS.md'),
      'utf8',
    )
    expect(doc).toMatch(/Green .*edible|safe to eat/i)
    expect(doc).toMatch(/One-tap ID/i)
    expect(doc).toMatch(/paywall/i)
    expect(doc).toMatch(/Badge rewards|edible/i)
  })
})
