"""E15b: same allowlist as E15 + deadly_topk_penalty (ready if E15 fails week1 KPI)."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
# Reuse E15 builder then inject penalty into generated notebook string
import subprocess, sys
subprocess.check_call([sys.executable, str(ROOT / "build_exp_v15_focus40.py")])
nb_path = ROOT / "visionsetil_exp_v15_focus40.ipynb"
text = nb_path.read_text(encoding="utf-8")
# rename version strings for E15b
text = text.replace("E15-focus40", "E15b-focus40-deadlypen")
text = text.replace("v15-E15-focus40", "v15b-E15b-deadlypen")
# inject penalty after loss_cls line in notebook JSON source
old = "loss_cls = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)"
new = (
    "loss_cls = F.cross_entropy(logits, labels, weight=class_weights, label_smoothing=cfg.label_smoothing)\\n"
    "            # E15b: push deadly true class into top-k\\n"
    "            if len(deadly_label_indices) > 0:\\n"
    "                _didx = deadly_label_indices\\n"
    "                _is_d = torch.tensor([int(l) in _didx for l in labels.tolist()], device=logits.device)\\n"
    "                if _is_d.any():\\n"
    "                    _true = logits.gather(1, labels.unsqueeze(1)).squeeze(1)\\n"
    "                    _kth = logits.topk(3, dim=-1).values[:, -1]\\n"
    "                    loss_cls = loss_cls + 0.5 * torch.relu(_kth - _true + 0.1)[_is_d].mean()"
)
if old not in text:
    print("WARN: loss line not found for E15b inject")
else:
    text = text.replace(old, new)
    print("injected deadly penalty")
out = ROOT / "visionsetil_exp_v15b_focus40.ipynb"
out.write_text(text, encoding="utf-8")
print("wrote", out, out.stat().st_size)
