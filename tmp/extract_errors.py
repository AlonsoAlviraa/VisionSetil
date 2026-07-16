"""Extract error outputs from the Kaggle notebook."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

with open("kaggle/kernel_output/visionsetil-mega-training.ipynb", "r", encoding="utf-8") as f:
    nb = json.load(f)

cells = nb.get("cells", [])
print(f"Total cells: {len(cells)}\n")

for i, cell in enumerate(cells):
    source = "".join(cell.get("source", []))
    outputs = cell.get("outputs", [])

    # Check for errors
    has_error = False
    error_text = ""
    for out in outputs:
        if out.get("output_type") == "error":
            has_error = True
            error_text += f"\n--- ERROR in cell {i} ---\n"
            error_text += f"Name: {out.get('ename', '?')}\n"
            error_text += f"Value: {out.get('evalue', '?')}\n"
            tb = out.get("traceback", [])
            # Join traceback lines
            for line in tb:
                error_text += line + "\n"
            error_text += "\n"

    if has_error:
        print(error_text)
        # Print first line of source for context
        print(f"Source (first 200 chars): {source[:200]}")
        print("=" * 80)

# Also print last few cells' stream outputs to see where it died
print("\n\n=== LAST 3 CELLS STREAM OUTPUT ===")
for cell in cells[-3:]:
    source = "".join(cell.get("source", []))[:100]
    print(f"\nCell source: {source}")
    for out in cell.get("outputs", []):
        if out.get("output_type") in ("stream",):
            text = "".join(out.get("text", []))
            print(f"  [{out.get('name', '?')}] {text[-500:]}")
        elif out.get("output_type") == "error":
            print(f"  [ERROR] {out.get('ename')}: {out.get('evalue')}")