# Multi-view four-photo benchmark

**Generated:** 2026-07-27T20:50:26.728423+00:00
**Artifacts:** `kaggle/kernel_output_v20/models`
**Overall:** **PASS**

> Orientation only — never consumption permission. Proxy ablation ≠ field paired study.

## Product contracts

- Canonical order: `gills, front, habitat, detail`
- Soft submit: ≥1 photo; recommended field packet: **gills + front**; full: **4**

## Proxy ablation (E20 holdout probs)

| n_views | signal α | top-1 | MAP@3 | deadly@3 | reject | acc_keep |
|--------:|---------:|------:|------:|---------:|-------:|---------:|
| 1 | 0.38 | 0.5206 | 0.5836 | 0.6609 | 1.0 | None |
| 2 | 0.7 | 0.6745 | 0.7357 | 0.8066 | 0.655 | 0.7681 |
| 3 | 0.85 | 0.7355 | 0.7949 | 0.862 | 0.3043 | 0.8285 |
| 4 | 1.0 | 0.802 | 0.8603 | 0.9271 | 0.182 | 0.8808 |

### Deltas (4 photos vs fewer)

- MAP@3 (2−1): **0.1521**
- MAP@3 (4−1): **0.2767**
- MAP@3 (4−2): **0.1246**
- reject (1−4): **0.818** (positive ⇒ fewer rejects with full packet)
- deadly@3 (4−1): **0.2662**

**Proxy gates pass:** `True`

## Leave-one-view-out (proxy)

| view | weight | MAP@3 | ΔMAP@3 | reject | Δreject |
|------|-------:|------:|-------:|-------:|--------:|
| gills | 0.38 | 0.7021 | -0.1582 | 0.8895 | 0.7075 |
| front | 0.32 | 0.7181 | -0.1422 | 0.7453 | 0.5633 |
| habitat | 0.15 | 0.7943 | -0.066 | 0.3043 | 0.1223 |
| detail | 0.15 | 0.7965 | -0.0638 | 0.3043 | 0.1223 |

## Torch forward smoke (1/2/4)

- ok: **True**
- arch: `multiview_v8` load_s=6.906
- note: PASS: MultiView accepts 1/2/4 photo tensors with view_idx encoding

- n=1 slots=['gills'] ok=True ms=195.36 logits=[1, 40]
- n=2 slots=['gills', 'front'] ok=True ms=297.31 logits=[1, 40]
- n=4 slots=['gills', 'front', 'habitat', 'detail'] ok=True ms=527.25 logits=[1, 40]

## Verdict

Proxy: reject drops 1→4 by 0.818 ( thr keeps more IDs when multi-view signal is full); MAP@3 (4−1)=0.2767; required pair ≥ single-view. Torch accepts 1/2/4 slots. Torch MultiView accepts 1/2/4 view batches with slot indices.

**product_unlock:** `False`

