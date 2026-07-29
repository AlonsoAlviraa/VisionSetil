# Competitive apps → VisionSetil adoption map

**Policy:** orientation only · never consumption permission · open-set honesty.

Research snapshot (2025–2026 public rankings + community forums):

| App | Best-in-class | Weakness | VisionSetil response |
|-----|---------------|----------|----------------------|
| **Picture Mushroom** | Fast AI, polished UI, multi-angle photos | Paywall; thin safety culture | Multi-view 4 slots with **inferior + perfil first**; freemium without edible green lights |
| **Seek (iNat)** | Camera-first, gamification, free | Not fungi-specialist; weak lookalikes | Games (Setadle/Reto) stay educational; no “win = edible” |
| **iNaturalist** | Community verification, research-grade | Slower; popularity bias on Amanita | Expert handoff + community CTA on results |
| **Shroomify / Shroom ID** | Encyclopedia depth | Variable accuracy claims | SSOT catalog + risk chips; dual confidence honesty |
| **Generic AI IDs** | Instant answers | Overconfidence / edible UX | Open-set reject + quality gate + no food-safe chrome |

## Adopted / reinforced in product

1. **Multi-angle capture** (Picture Mushroom): labels/hints stress underside + profile before habitat/detail.
2. **Lookalike depth** (field guides): Studio + result lookalike list + “Comparar en Studio” CTA.
3. **Community second opinion** (iNat): “Preguntar a la comunidad” from result layer 2.
4. **Honest abstain** (safer than competitors): open-set rejection is first-class UI, not an error toast.
5. **Cotos / permits links** (local CyL/Aragón): map + trust strip — competitors rarely do Spain-first permits.
6. **Phenology bar** (encyclopedia depth / Shroomify-style): 12-month educational season on species habitat tab (`PhenologyBar` + `lib/phenology.ts`) — never a harvest calendar.
7. **Study badges & streaks** (Seek): local-only educational milestones on Quiz/Setadle (`StudyBadgesPanel` + `lib/studyBadges.ts`) — never edible framing.
8. **Privacy / no-account explore** (Seek private learning): home privacy strip + local study progress without login.
9. **Verification status strip** (iNat Needs ID language): result-layer honest statuses (`lib/verificationStatus.ts`) — never research-grade or edible clearance from model scores.
10. **Season study challenge** (Seek challenge categories): quiz mode `season` + daily rotation — phenology study only.

## Explicit non-adoptions

- Green “edible” / “safe to eat” badges.
- One-tap ID without multi-view guidance.
- Claiming medical/forage permission from model scores.
- Paywall that hides safety education.
- Badge rewards for “correct edible” identify outcomes.

## Workflow research output (2026-07-27)

**Already strong vs competitors:** multi-view wizard, open-set, honesty modes, lookalike studio + ranked deadly confusions, safety-by-surface, Setadle/Quiz educational games, offline packs (study-only), expert handoff, community language bans, Spain cotos map.

**Shipped this cycle:**

1. Always-visible “no app is food-safe / use multi-photo + mycologist” pro-check on Identify ← **shipped** (`identify-pro-check`).
2. Soft single-photo entry that **coaches** into multi-view (soft readiness already; wizard copy stresses inferior+profile).
3. Result CTAs: Studio compare + community (iNat second opinion) ← **shipped** (always visible on result via `lookalike-next-actions`, not only when lookalike list is non-empty).
4. Deeper encyclopedia phenology / season cards ← **shipped** (`PhenologyBar`).
5. Seek-like badges/streaks without edible framing ← **shipped** (games/study only).
6. Privacy messaging / no-account explore polish ← **shipped** (`home-privacy-strip`).
7. iNat-inspired verification strip on results ← **shipped** (`result-verification-status` + `lib/verificationStatus.ts`) — *Needs ID / needs expert / provisional model cue / open-set abstain*; **never** research-grade or edible clearance from model scores.
8. Extra Seek-style educational challenge category ← **shipped** (quiz mode `season` — phenology study only; never a harvest calendar).

**Shipped v1.6 (2026-07-28):**

9. **Educational trait filters** (stem/gill/pore study shortlists) ← **shipped** (`lib/studyTraits.ts` + encyclopedia chips) — never forage.
10. **Home product discover hub** + mobile Identify FAB ← **shipped** (visual conversion, orientation policy).

**Shipped v1.7 (2026-07-28 autonomous graph eng):**

11. **Soft pre-submit multi-view coach** ← **shipped** (`preSubmitMultiViewCoach` + Identify alertdialog) — soft path only.
12. **Static framing guides** on wizard slots ← **shipped** (no continuous species green-light).
13. **Private notebook geo pins** (EXIF stripped) ← **shipped** (`notebookGeo` + History UI).

**Optional later (not blocking)** — residual backlog:

1. ~~Progressive single-photo coaching that more strongly guides underside+profile before submit.~~ **done v1.7**
2. Live-camera framing assist (getUserMedia overlays) for multi-view slots (no continuous “green light” species ID).
3. ~~Educational trait filters (stem/gill/pore) for study shortlists only.~~ **done v1.6**
4. Richer community *human* consensus loop (still never model→research-grade).
5. ~~Richer private find collections/maps (notebook pins).~~ **done v1.7** (local pins; no marketplace).
6. Consumer capture polish parity with Picture Mushroom **while keeping** multi-view + abstain (partial via framing).
7. Offline encyclopedia depth only — **never** offline food-safe AI ID.
8. ECE calibration residual (ML honesty, not product chrome).

## Workflows

| Workflow | Purpose |
|----------|---------|
| `competitive-apps-research` | Scan competitors → gap map → adopt plan report |
| `competitive-adopt-harden` | Re-scan gaps → implement safe gaps → run FE + pro + accenture testers |

## Tester gate

- Frontend: full `vitest run` (incl. `competitiveFeatures`, `phenology`, `studyBadges`, `verificationStatus`, `mushroomQuiz`)
- Accenture audit: `python scripts/run_accenture_audit.py`
- Professional ML: `python scripts/run_professional_tester.py --fast`
- Auth/security: cookie E-08 + `test_security.py`
- Competitive contracts: `src/lib/competitiveFeatures.test.ts`
