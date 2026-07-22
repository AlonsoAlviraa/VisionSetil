#!/usr/bin/env python3
"""Push E15b to an existing completed kernel slot (call only when E15 done/failed and GPU free)."""
import json, subprocess, shutil
from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
K = REPO / "kaggle"
def main():
    nb = K / "visionsetil_exp_v15b_focus40.ipynb"
    if not nb.is_file():
        print("missing E15b notebook"); return 1
    # prefer v12 slot if complete
    pull = K / "push_e15b_tmp"
    if pull.exists(): shutil.rmtree(pull)
    pull.mkdir()
    r = subprocess.run(["kaggle","kernels","pull","alonsoalvira/visionsetil-exp-v12-data-scale","-p",str(pull),"-m"], capture_output=True, text=True)
    print(r.stdout, r.stderr)
    meta_path = pull / "kernel-metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    code = meta.get("code_file") or "visionsetil-exp-v12-data-scale.ipynb"
    shutil.copy(nb, pull / code)
    meta["title"] = "visionsetil-exp-v15b-focus40"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    r2 = subprocess.run(["kaggle","kernels","push","-p",str(pull)], capture_output=True, text=True)
    print(r2.stdout, r2.stderr)
    return r2.returncode
if __name__ == "__main__":
    raise SystemExit(main())
