"""Extract ALL cell outputs from the Kaggle notebook."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

with open("kaggle/kernel_output/visionsetil-mega-training.ipynb", "r", encoding="utf-8") as f:
    nb = json.load(f)

cells = nb.get("cells", [])

for i, cell in enumerate(cells):
    source = "".join(cell.get("source", []))[:120]
    outputs = cell.get("outputs", [])
    exec_count = cell.get("execution_count")

    print(f"\n{'='*60}")
    print(f"CELL {i} (exec_count={exec_count}, {len(outputs)} outputs)")
    print(f"Source: {source}")
    print(f"-" * 40)

    for out in outputs:
        otype = out.get("output_type", "?")
        if otype == "stream":
            text = "".join(out.get("text", []))
            print(f"  [{out.get('name', '?')}] {text[:800]}")
        elif otype == "error":
            print(f"  [ERROR] {out.get('ename')}: {out.get('evalue')}")
            for line in out.get("traceback", []):
                # Clean ANSI codes
                import re
                clean = re.sub(r'\x1b\[[0-9;]*m', '', line)
                print(f"    {clean[:200]}")
        elif otype == "execute_result":
            data = out.get("data", {})
            if "text/plain" in data:
                txt = "".join(data["text/plain"])[:300]
                print(f"  [result] {txt}")
        elif otype == "display_data":
            data = out.get("data", {})
            if "text/plain" in data:
                txt = "".join(data["text/plain"])[:300]
                print(f"  [display] {txt}")