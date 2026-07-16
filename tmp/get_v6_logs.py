import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

os.environ['KAGGLE_API_TOKEN'] = 'KGAT_47893c54215cc359ba93342189276b23'

from kaggle.api.kaggle_api_extended import KaggleApi
api = KaggleApi()
api.authenticate()

try:
    result = api.kernels_output(
        'alonsoalviraaaa/visionsetil-mega-training',
        path='C:/AlonsoAlviraa/VisionSetil/kaggle/kernel_output_v6',
        force=True
    )
    print('Downloaded:', result)
except Exception as e:
    print('Error:', repr(e))

# Now read the log file
import glob
log_files = glob.glob('C:/AlonsoAlviraa/VisionSetil/kaggle/kernel_output_v6/*.log')
for lf in log_files:
    print(f'\n=== {lf} ===')
    with open(lf, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
        print(content[-5000:] if len(content) > 5000 else content)