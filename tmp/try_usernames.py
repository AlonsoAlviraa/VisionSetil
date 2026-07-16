"""Try different username variants for downloading."""
import requests
import json
import zipfile
import io
from pathlib import Path

TOKEN = "KGAT_47893c54215cc359ba93342189276b23"
SLUG = "visionsetil-mega-training-v7"
OUT_DIR = Path(r"C:\AlonsoAlviraa\VisionSetil\kaggle\kernel_output_v7")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Try different username variants
USERNAMES = ["alonsoalvira", "alonsoalviraaaa", "alonsoalviraa"]
BASE_URL = "https://www.kaggle.com/api/v1"

for user in USERNAMES:
    print(f"\n{'='*60}")
    print(f"Trying username: {user}")
    print(f"{'='*60}")
    
    auth = (user, TOKEN)
    
    # Status
    resp = requests.get(
        f"{BASE_URL}/kernels/status",
        params={"userName": user, "kernelSlug": SLUG},
        auth=auth,
        timeout=30,
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Status: {json.dumps(data, indent=2)}")
        
        # If we can get status, try output
        resp2 = requests.get(
            f"{BASE_URL}/kernels/output",
            params={"userName": user, "kernelSlug": SLUG},
            auth=auth,
            timeout=120,
            stream=True,
        )
        print(f"Output: {resp2.status_code}")
        if resp2.status_code == 200:
            content = resp2.content
            ct = resp2.headers.get('content-type', '')
            print(f"Content-Type: {ct}, Size: {len(content)}")
            
            if 'zip' in ct or content[:2] == b'PK':
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    zf.extractall(OUT_DIR)
                print(f"Extracted ZIP to {OUT_DIR}")
            elif 'json' in ct:
                data = resp2.json()
                print(f"JSON keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")
                # If it's a list of files, download each
                if isinstance(data, list):
                    for finfo in data:
                        fname = finfo.get("fileName", "unknown")
                        print(f"  Need to download: {fname}")
            break
        else:
            print(f"Output error: {resp2.text[:300]}")
    else:
        print(f"Status response: {resp.text[:200]}")

# List downloaded
print(f"\n=== Files in {OUT_DIR} ===")
for f in sorted(OUT_DIR.iterdir()):
    print(f"  {f.name}: {f.stat().st_size:,} bytes")