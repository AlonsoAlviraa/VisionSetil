"""Extract executed notebook and find errors."""
import json, sys
from pathlib import Path

# The pull saved metadata+blob as JSON
raw = json.loads(Path("kaggle/kernel_output_v6/visionsetil_mega_training.ipynb").read_text(encoding="utf-8"))

# The blob contains the actual notebook
if "blob" in raw:
    blob = raw["blob"]
    if isinstance(blob, str):
        nb = json.loads(blob)
    else:
        nb = blob
else:
    nb = raw

# Save the clean notebook
clean_path = Path("kaggle/kernel_output_v6/executed_notebook.ipynb")
clean_path.write_text(json.dumps(nb, indent=1), encoding="utf-8")
print(f"Saved clean notebook: {clean_path} ({clean_path.stat().st_size} bytes)")

# Extract cell sources, outputs, errors
cells = nb.get("cells", [])
print(f"\nTotal cells: {len(cells)}")

errors_found = []
all_outputs = []

for i, cell in enumerate(cells):
    if cell.get("cell_type") != "code":
        continue
    
    source = "".join(cell.get("source", []))
    outputs = cell.get("outputs", [])
    
    cell_log = []
    for out in outputs:
        otype = out.get("output_type", "")
        if otype == "stream":
            text = "".join(out.get("text", []))
            cell_log.append(f"[stream:{out.get('name','stdout')}] {text[:2000]}")
        elif otype == "error":
            ename = out.get("ename", "?")
            evalue = out.get("evalue", "?")
            tb = "\n".join(out.get("traceback", []))
            cell_log.append(f"[ERROR] {ename}: {evalue}")
            cell_log.append(tb[-3000:])
            errors_found.append((i, ename, evalue, tb))
        elif otype == "execute_result":
            data = out.get("data", {})
            if "text/plain" in data:
                text = "".join(data["text/plain"])
                cell_log.append(f"[result] {text[:1000]}")
    
    if cell_log:
        all_outputs.append(f"\n{'='*60}\nCELL {i} (last exec: {cell.get('execution_count','?')}):\n{'='*60}")
        all_outputs.append("\n".join(cell_log))

# Save all outputs
log_path = Path("kaggle/kernel_output_v6/all_cell_outputs.txt")
log_path.write_text("\n".join(all_outputs), encoding="utf-8")
print(f"\nAll outputs saved to: {log_path}")

# Print errors
if errors_found:
    print(f"\n{'='*60}")
    print(f"ERRORS FOUND: {len(errors_found)}")
    print(f"{'='*60}")
    for cell_idx, ename, evalue, tb in errors_found:
        print(f"\n--- Cell {cell_idx}: {ename}: {evalue} ---")
        # Print last 20 lines of traceback
        tb_lines = tb.split("\n")
        for line in tb_lines[-25:]:
            print(line)
else:
    print("\nNo errors found in cell outputs. Kernel may have timed out or OOM'd.")

# Print last cell outputs to see where it stopped
print(f"\n{'='*60}")
print("LAST 3 CELLS WITH OUTPUT:")
print(f"{'='*60}")
for log in all_outputs[-3:]:
    print(log[:3000])