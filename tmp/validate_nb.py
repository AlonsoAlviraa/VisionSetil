import json

nb = json.load(open("kaggle/visionsetil_mega_training.ipynb"))
print(f"Valid JSON. Cells: {len(nb['cells'])}. Format: {nb['nbformat']}")
print("---")
for i, cell in enumerate(nb["cells"]):
    src = "".join(cell["source"])
    first_line = src.strip().split("\n")[0][:80]
    print(f"Cell {i:2d} [{cell['cell_type']:8s}] {first_line}")

# Check DoD criteria keywords exist
full_src = "".join("".join(c["source"]) for c in nb["cells"])
checks = {
    "DO1_time": "est. ~3-4h" in full_src,
    "DO2_map3_ci": "ci_low" in full_src and "ci_high" in full_src,
    "DO3_deadly": "safety_recall_deadly" in full_src,
    "DO4_flush": "sys.stdout.flush()" in full_src,
    "DO5_checkpoint": "save_checkpoint" in full_src,
    "DO6_bmm": "torch.bmm" in full_src,
    "DO7_multidb": "anti-collision" in full_src.lower() or "source_db" in full_src,
    "DO8_artifacts": "best.pt" in full_src and "metrics.json" in full_src,
    "DO9_ece": "ece" in full_src.lower(),
    "DO10_perspecies": "per_species" in full_src or "Per-species" in full_src,
}
print("\n=== DoD Coverage Check ===")
for k, v in checks.items():
    print(f"  {k}: {'✅' if v else '❌'}")