# Loop post-train suite (latest)

**Generated:** `2026-08-05T20:31:50.962146+00:00`  
**Run id:** `e20c`  
**Status:** `suite_ok_with_gaps`  
**suite_ok:** `True`  
**product_unlock:** `False` (forced false)  
**Policy:** `orientation_only_never_consume`

> Cite **[MEASURED]** full precision from JSON SSOT / this report. Never invent.

## Operator action

Post-train suite complete. Compare vs E20 SSOT with loop_ml_compare_to_baseline.py. product_unlock remains false. Do not auto-unlock; continue lab frictions (open-set / deadly@1 / ECE dual). GAP: MO+iNat claimed in protocol but train_obs has zero MO/iNat rows — metrics reflect FT-only train (same family as E20); investigate dataset mount.

## Measured metrics

Source: `kaggle/kernel_output_v20c/models/metrics.json`  
version: `v20c-E20-mo-inat` · protocol: `source_holdout_e20c_mo_inat`  
train_domain: `fungitastic_plus_mo_inat_non_gbif` · test_domain: `gbif_es_only`

| Metric | [MEASURED] |
|--------|------------|
| MAP@3 | 0.8572782667569362 |
| deadly@1 | 0.789922480620155 |
| deadly@3 | 0.9186046511627907 |
| n_deadly | 2580 |
| ECE primary (train_published) | 0.18942074356203395 |
| ECE posthoc (lab-only) | n/a |
| claim_train_published | `True` |
| primary_source | `kernel_metrics_test_ece_as_train_published` |

### Soft gates (advisory only)

- soft MAP@3 ≥ 0.25: `True`
- soft deadly@3 ≥ 0.9: `True`
- dual deadly keys: `True`

## Dual ECE honesty

- **Primary:** `train_published` = `0.18942074356203395` (source=`kernel_metrics_test_ece_as_train_published`)
- **Posthoc (separate, no serve):** `None`

## Checks

- leak_hits_total: `0`
- split_manifest: `PASS`
- obs_disjoint: `PASS`
- source_domains: `PASS`
- mo_inat: `{'claimed_in_protocol_or_config': True, 'train_source_keys_matching': [], 'train_mo_inat_obs': 0, 'note': 'If claimed but zero, suite still runs on available FT+GBIF metrics; do not invent MO+iNat uplift.'}`

## GAPs

- `mo_inat_claimed_but_zero_train_obs`

---

_Orientation only · never consumption · product_unlock=false_
