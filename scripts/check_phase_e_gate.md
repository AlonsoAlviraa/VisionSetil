# Industrial gate loop (E-15)

```powershell
# 1) After Kaggle E15/E16 complete, download metrics next to weights
# 2) Evaluate serve gate (SSOT sibling metrics.json)
python scripts/check_industrial_gate.py

# 3) Optional: tick orchestrator
python scripts/industrial_tick.py

# Policy
# - MAP@3 >= 0.20 and deadly recall >= 0.90 required for species_id_allowed
# - Never open mode=real with fake metrics
```
