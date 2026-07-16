import requests, json, sys

resp = requests.get(
    'https://www.kaggle.com/api/v1/kernels/status',
    params={'userName': 'alonsoalviraaaa', 'kernelSlug': 'visionsetil-mega-training'},
    auth=('alonsoalviraaaa', 'KGAT_47893c54215cc359ba93342189276b23'),
    timeout=30,
)
print('Status:', resp.status_code)
data = resp.json()
print(json.dumps(data, indent=2)[:3000])