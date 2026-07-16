import json, sys

nb_path = 'kaggle/kernel_output_v6/visionsetil-mega-training.ipynb'
with open(nb_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

print(f"Total cells: {len(nb['cells'])}")
print()

for i, cell in enumerate(nb['cells']):
    cell_type = cell.get('cell_type', 'unknown')
    source = ''.join(cell.get('source', []))
    
    # Check outputs for errors
    outputs = cell.get('outputs', [])
    has_error = False
    error_text = ""
    
    for out in outputs:
        if out.get('output_type') == 'error':
            has_error = True
            error_text += f"\nERROR: {out.get('ename', '')}: {out.get('evalue', '')}\n"
            for tb in out.get('traceback', []):
                error_text += tb + "\n"
        elif out.get('output_type') == 'stream' and out.get('name') == 'stderr':
            stream_text = ''.join(out.get('text', []))
            if 'error' in stream_text.lower() or 'traceback' in stream_text.lower() or 'exception' in stream_text.lower():
                error_text += f"\nSTDERR: {stream_text}\n"
    
    if has_error or error_text:
        print(f"=== CELL {i} ({cell_type}) ===")
        print(f"Source (first 500 chars): {source[:500]}")
        print(f"\n--- ERROR OUTPUT ---")
        print(error_text[-3000:])
        print()

# Also print last few cells' outputs regardless
print("\n\n=== LAST 5 CELLS OUTPUT ===")
for i, cell in enumerate(nb['cells'][-5:]):
    real_idx = len(nb['cells']) - 5 + i
    source = ''.join(cell.get('source', []))
    print(f"\n--- Cell {real_idx} ---")
    print(f"Source: {source[:300]}")
    for out in cell.get('outputs', []):
        if out.get('output_type') == 'stream':
            text = ''.join(out.get('text', []))
            print(f"Stream ({out.get('name')}): {text[:1000]}")
        elif out.get('output_type') == 'error':
            print(f"ERROR: {out.get('ename')}: {out.get('evalue')}")
            for tb in out.get('traceback', [])[-5:]:
                print(tb)
        elif out.get('output_type') in ('display_data', 'execute_result'):
            data = out.get('data', {})
            if 'text/plain' in data:
                print(f"Output: {''.join(data['text/plain'])[:500]}")