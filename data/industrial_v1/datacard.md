# Data card — industrial_v1 (plan day 1)

Generated: 2026-07-17T15:30:23.355105+00:00

## Purpose
Focused catalog for E15 (40 species). **Orientation only** — never consumption permission.

## Counts
- Allowlist entries: 40
- Present in E14 label2idx: 40
- Missing from E14 dump: 0 []
- Deadly with labels: ['Amanita muscaria', 'Amanita pantherina', 'Amanita phalloides', 'Amanita virosa', 'Cortinarius rubellus', 'Galerina marginata', 'Gyromitra esculenta', 'Hypholoma fasciculare', 'Lepiota castanea', 'Lepiota subincarnata', 'Paxillus involutus']

## Sources (planned)
1. FungiCLEF + FungiTastic filtered to allowlist (Kaggle)
2. GBIF ES StillImage (week 2)
3. Micocyl / Montes de Soria / MA-Fungi (async request)

## Splits
Observation-level anti-leak (train/val/test). `test_es_gbif` hold-out week 2–3.

## Safety
Deadly taxa forced; class weight 10x in E15. Product quality gate blocks species ID until MAP@3≥0.20 and deadly≥0.90.
