import sys, io, os, glob, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

os.environ['KAGGLE_API_TOKEN'] = 'KGAT_47893c54215cc359ba93342189276b23'
os.environ['KAGGLE_USERNAME'] = 'alonsoalviraaaa'
os.environ['KAGGLE_KEY'] = 'KGAT_47893c54215cc359ba93342189276b23'

from kaggle.api.kaggle_api_extended import KaggleApi
api = KaggleApi()
api.authenticate()

OUT_DIR = 'C:/AlonsoAlviraa/VisionSetil/kaggle/kernel_output_v7'
os.makedirs(OUT_DIR, exist_ok=True)

print("Downloading v7 kernel output...")
try:
    result = api.kernels_output(
        'alonsoalviraaaa/visionsetil-mega-training-v7',
        path=OUT_DIR,
        force=True
    )
    print('Downloaded:', result)
except Exception as e:
    print('Error:', repr(e))

# List files
print("\n=== Files downloaded ===")
for f in sorted(glob.glob(OUT_DIR + '/*')):
    size = os.path.getsize(f)
    print(f"  {os.path.basename(f)}: {size:,} bytes")

# Read log file
print("\n=== LOG FILE (last 8000 chars) ===")
for lf in glob.glob(OUT_DIR + '/*.log'):
    with open(lf, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    print(f"File: {lf} ({len(content)} chars)")
    print(content[-8000:] if len(content) > 8000 else content)

# Read metrics.json if it exists
print("\n=== METRICS.JSON ===")
for mf in glob.glob(OUT_DIR + '/**/metrics.json', recursive=True) + glob.glob(OUT_DIR + '/metrics.json'):
    with open(mf, 'r') as f:
        print(f.read())

# Read notebook outputs
print("\n=== NOTEBOOK CELL OUTPUTS (searching for key metrics) ===")
for nb_path in glob.glob(OUT_DIR + '/*.ipynb'):
    with open(nb_path, 'r', encoding='utf-8', errors='replace') as f:
        nb = json.load(f)
    for i, cell in enumerate(nb.get('cells', [])):
        if cell['cell_type'] != 'code':
            continue
        for output in cell.get('outputs', []):
            if output.get('output_type') == 'stream':
                text = ''.join(output.get('text', []))
                if any(kw in text.lower() for kw in ['map@3', 'accuracy', 'safety', 'ece', 'result', 
                       'complete', 'error', 'traceback', 'dod', 'deadly', 'definition']):
                    print(f"\n--- Cell {i} output ---")
                    print(text[-2000:])