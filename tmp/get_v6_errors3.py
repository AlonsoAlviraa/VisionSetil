import sys, io, os, json, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Don't import kaggle SDK - just use subprocess and file reading
import subprocess

os.environ['KAGGLE_API_TOKEN'] = 'KGAT_47893c54215cc359ba93342189276b23'
os.environ['KAGGLE_USERNAME'] = 'alonsoalviraaaa'
os.environ['PYTHONIOENCODING'] = 'utf-8'

# Delete old output
import shutil
out_dir = 'C:/AlonsoAlviraa/VisionSetil/kaggle/kernel_output_v6'
os.makedirs(out_dir, exist_ok=True)
for f in glob.glob(out_dir + '/*'):
    os.remove(f)

# Use kaggle CLI to get output
result = subprocess.run(
    ['kaggle', 'kernels', 'output', 'alonsoalviraaaa/visionsetil-mega-training', 
     '-p', out_dir, '--force'],
    capture_output=True, text=True, encoding='utf-8', errors='replace'
)
print(f"Return code: {result.returncode}")
if result.stdout:
    print(f"Stdout: {result.stdout[:3000]}")
if result.stderr:
    print(f"Stderr: {result.stderr[:3000]}")

# Check what's in the output dir now
print("\n=== Files in output dir ===")
for f in glob.glob(out_dir + '/*'):
    size = os.path.getsize(f)
    print(f"  {os.path.basename(f)}: {size} bytes")

# Read the log file
for log_name in ['visionsetil-mega-training.log', '__output__.json']:
    log_file = os.path.join(out_dir, log_name)
    if os.path.exists(log_file) and os.path.getsize(log_file) > 0:
        with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
            print(f"\n=== {log_name} CONTENT ===")
            print(content[-5000:] if len(content) > 5000 else content)

# Also try to get kernel details via API
try:
    result2 = subprocess.run(
        ['kaggle', 'kernels', 'list', '-m', '--page-size', '3'],
        capture_output=True, text=True, encoding='utf-8', errors='replace'
    )
    print(f"\n=== KERNEL LIST ===")
    print(result2.stdout)
except Exception as e:
    print(f"List error: {e}")