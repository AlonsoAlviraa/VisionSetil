# E20b diagnose — Lepiota FT (ML-02)

**Generated:** `2026-08-05T20:43:03.533933+00:00`  
**Kernel:** `alonsoalviraaaa/visionsetil-exp-v20b-lepiota-ft`  
**Kaggle status:** `ERROR`  
**Classification:** `launch_script_bug`  
**Decision:** `RELAUNCH_PATH_DOCUMENTED_NOT_EXECUTED`  
**product_unlock:** `False` (forced false)  
**Lab only:** `True` · **kaggle_push:** `False`  
**Policy:** `orientation_only_never_consume`

> Diagnose-first. No blind epoch bumps. Dual ECE: primary=train_published; posthoc separate. Orientation only — never consumption.

## Decision tree

1. **status** → ERROR
2. **logs** → parsed kernel log (if present)
3. **classify** → launch_script_bug
4. **diagnose first** → this artifact
5. **suite OR ≤1 relaunch OR continue baseline** → RELAUNCH_PATH_DOCUMENTED_NOT_EXECUTED

**Operator action:** Rails green + SyntaxError+weight-path fixed in tracked kaggle/visionsetil_exp_v20b_lepiota_ft.ipynb + kaggle/kernel-metadata-exp-v20b.json (push_e20b is gitignored staging only). ≤1 human relaunch budget remaining=1 (used=0). Push only via scripts/push_kaggle_e20b.py --execute --i-accept-operator-responsibility after dry-run. This diagnose run does NOT push. Continue E20 baseline SSOT until e20b COMPLETE. product_unlock=false.

## Findings

- **syntax_hard_neg_commas** (blocking): SyntaxError in In[17] _HARD_NEG dict: trailing commas lived inside comments after values (e.g. `28.0  # E20b FT boost,`), so the next key was a SyntaxError.
- **missing_pretrained_weights_path** (high): E20b FT resume did not find best.pt. Dataset alonsoalviraaaa/visionsetil-e20-weights may be mounted under /kaggle/input/datasets/<owner>/<slug>/ while notebook only probed /kaggle/input/visionsetil-e20-weights/.
- **mush215_optional_empty** (low): Optional mush215 source loaded 0 images (non-blocking; FT train still fungitastic).
- **split_rails_pass_before_crash** (info): Source-holdout split artifacts written and pass=True before crash.

## Root cause

- **Primary:** SyntaxError in _HARD_NEG class-weight dict (commas inside comments)
- **Secondary:** missing_pretrained_weights_path
- **Training quality failure?** `False`
- **Blind epoch bump?** `False` (must stay false)

## Rails + notebook fix readiness

- rails can_stage: `True` status=`rails_green_can_stage`
- notebook present: `True`
- syntax fix present: `True`
- weight path fix present: `True`
- relaunch_allowed: `True` executed=`False`

### ≤1 relaunch checklist (human only — not executed here)

- [ ] Confirm anti-leak rails still green (verify_anti_leak_rails_for_train.py)
- [ ] Confirm visionsetil-e20-weights has best.pt on Kaggle (push preflight)
- [ ] Confirm tracked notebook syntax_fix_present + weight_path_fix_present
- [ ] Human: python scripts/push_kaggle_e20b.py --dry-run  (inspect gates)
- [ ] Human: python scripts/push_kaggle_e20b.py --execute --i-accept-operator-responsibility
- [ ] No blind epoch bumps; keep 12-epoch FT + hard-neg weights design
- [ ] Never product_unlock; dual ECE primary=train_published

## Baseline SSOT (continue until e20b COMPLETE)

Source: `eval/reports/ml_experiments/E20_BASELINE_METRICS_TO_IMPROVE.json` · version=`v20-E20-source-holdout` · protocol=`source_holdout_e20`

| Metric | [MEASURED] |
|--------|------------|
| MAP@3 | 0.8575265177160878 |
| deadly@1 | 0.7895348837209303 |
| deadly@3 | 0.9217054263565891 |
| n_deadly | 2580 |
| ECE primary (train_published) | 0.18741017924867615 |
| ECE posthoc (lab-only) | 0.04544782004819755 |

### Dual ECE honesty

- primary label: `train_published` claim_train_published=`True`
- posthoc separate: `True` — never serve as primary
- T_train=`1.5812190771102905` · T_posthoc=`2.899999999999997`

## Lepiota holdout friction (E20 baseline GBIF-ES — why FT was designed)

| Species | n_test | top1 | MAP@3 | true@3 | deadly | top confusions |
|---------|-------:|-----:|------:|-------:|:------:|----------------|
| Lepiota castanea | 82 | 0.5487804878048781 | 0.7256097560975611 | 0.926829268292683 | True | Lepiota castanea=45, Lepiota cristata=16, Armillaria lutea=5 |
| Lepiota cristata | 179 | 0.8770949720670391 | 0.9050279329608939 | 0.9441340782122905 | False | Lepiota cristata=157, Laccaria laccata=3, Marasmius oreades=3 |
| Lepiota subincarnata | 57 | 0.0 | 0.17543859649122806 | 0.47368421052631576 | True | Lepiota cristata=37, Armillaria lutea=6, Amanita virosa=4 |

- train Lepiota obs: `{'Lepiota castanea': 20, 'Lepiota cristata': 87, 'Lepiota subincarnata': 6}`
- val Lepiota obs: `{'Lepiota cristata': 15, 'Lepiota castanea': 4, 'Lepiota subincarnata': 1}`
- test Lepiota obs: `{'Lepiota cristata': 179, 'Lepiota castanea': 82, 'Lepiota subincarnata': 57}`
- friction: `{'subincarnata_top1_collapse': True, 'subincarnata_train_obs': 6, 'primary_confuser': 'Lepiota cristata', 'rationale': 'Deadly L. subincarnata collapses to L. cristata on GBIF-ES holdout; tiny train n drives E20b hard-neg FT design. Orientation only.'}`

## E20b run artifacts

- metrics.json present: `False`
- split_manifest: protocol=`source_holdout_e20b_lepiota_ft` pass=`True` n_train/val/test=`5767/1018/7385`
- suite ran: `False` — E20b not COMPLETE with metrics — suite deferred. Continue baseline SSOT; suite only after successful e20b COMPLETE.

## Gaps

- e20b_metrics_json_missing

## Never

- auto product_unlock=true
- auto kaggle push without operator gates
- blind epoch bumps
- sell posthoc ECE as primary
- forage or consumption permission
- contaminate GBIF ES holdout

---

_Orientation only · never consumption · product_unlock=false · dual ECE honesty_
