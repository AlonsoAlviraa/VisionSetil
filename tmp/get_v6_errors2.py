import sys, io, os, json, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

os.environ['KAGGLE_API_TOKEN'] = 'KGAT_47893c54215cc359ba93342189276b23'
os.environ['KAGGLE_USERNAME'] = 'alonsoalviraaaa'

from kaggle.api.kaggle_api_extended import KaggleApi
api = KaggleApi()
api.authenticate()

# Try to get kernel details with error info
try:
    # Use the raw API to get kernel status/details
    owner_slug = 'alonsoalviraaaa'
    kernel_slug = 'visionsetil-mega-training'
    
    # List kernel versions to find the failed one
    versions = api.kernels_list(owner_slug, kernel_slug, page_size=5)
    print("Kernel versions:")
    for v in versions:
        print(f"  Version {v.version_number}: status={v.status}, run_time={v.total_time_ms}")
except Exception as e:
    print(f"List versions error: {repr(e)}")

# Try to get output via API
try:
    import subprocess
    result = subprocess.run(
        ['kaggle', 'kernels', 'output', 'alonsoalviraaaa/visionsetil-mega-training', 
         '-p', 'C:/AlonsoAlviraa/VisionSetil/kaggle/kernel_output_v6', '--force'],
        capture_output=True, text=True, encoding='utf-8',
        env={**os.environ, 'KAGGLE_API_TOKEN': 'KGAT_47893c54215cc359ba93342189276b23',
             'PYTHONIOENCODING': 'utf-8'}
    )
    print(f"\nReturn code: {result.returncode}")
    print(f"Stdout: {result.stdout[:2000]}")
    print(f"Stderr: {result.stderr[:2000]}")
except Exception as e:
    print(f"Subprocess error: {repr(e)}")

# Check what's in the output dir now
import glob
print("\n=== Files in output dir ===")
for f in glob.glob('C:/AlonsoAlviraa/VisionSetil/kaggle/kernel_output_v6/*'):
    size = os.path.getsize(f)
    print(f"  {f}: {size} bytes")

# Read the log file
log_file = 'C:/AlonsoAlviraa/VisionSetil/kaggle/kernel_output_v6/visionsetil-mega-training.log'
if os.path.exists(log_file) and os.path.getsize(log_file) > 0:
    with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
        print(f"\n=== LOG CONTENT ===")
        print(f.read())
else:
    print(f"\nLog file is empty or doesn't exist")