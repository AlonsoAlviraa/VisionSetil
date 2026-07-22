# Monitor Kaggle E12

```bash
python scripts/monitor_kaggle_exp_v12.py --poll 90 --timeout-hours 14
```

On COMPLETE:
1. Downloads to `kaggle/kernel_output_v12/`
2. Runs experiment battery → `eval/reports/ml_experiments/v12/`
3. Status file: `eval/reports/ml_experiments/kaggle_monitor_status.json`

Kernel: https://www.kaggle.com/code/alonsoalvira/visionsetil-exp-v12-data-scale
