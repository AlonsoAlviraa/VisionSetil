"""Download v7 output via direct REST API (like get_kaggle_nb.py)."""
import requests
import json
import os
import zipfile
import io
from pathlib import Path

USERNAME = "alonsoalviraaaa"
SLUG = "visionsetil-mega-training-v7"
OUT_DIR = Path(r"C:\AlonsoAlviraa\VisionSetil\kaggle\kernel_output_v7")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Try different auth methods
AUTH_METHODS = [
    # Method 1: Bearer token
    {"headers": {"Authorization": f"Bearer KGAT_47893c54215cc359ba93342189276b23"}},
    # Method 2: Basic auth with token as password
    None,  # will use auth tuple
]

BASE_URL = "https://www.kaggle.com/api/v1"

print("=" * 60)
print(f"Trying to download kernel output: {USERNAME}/{SLUG}")
print("=" * 60)

# Try status first
for attempt, auth_config in enumerate(AUTH_METHODS):
    print(f"\n--- Attempt {attempt + 1} ---")
    headers = auth_config["headers"] if auth_config else {}
    auth = (USERNAME, "KGAT_47893c54215cc359ba93342189276b23") if auth_config is None else None
    
    try:
        # Status
        resp = requests.get(
            f"{BASE_URL}/kernels/status",
            params={"userName": USERNAME, "kernelSlug": SLUG},
            headers=headers,
            auth=auth,
            timeout=30,
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Status data: {json.dumps(data, indent=2)[:500]}")
        
        # Output (list)
        resp2 = requests.get(
            f"{BASE_URL}/kernels/output",
            params={"userName": USERNAME, "kernelSlug": SLUG},
            headers=headers,
            auth=auth,
            timeout=60,
        )
        print(f"Output list: {resp2.status_code}")
        if resp2.status_code == 200:
            output_data = resp2.json()
            print(f"Output: {json.dumps(output_data, indent=2)[:1000]}")
            
            # Download each file
            files = output_data.get("files", [])
            for finfo in files:
                fname = finfo.get("fileName", "unknown")
                url = f"{BASE_URL}/kernels/output/download"
                print(f"  Downloading {fname}...")
                dl_resp = requests.get(
                    url,
                    params={"userName": USERNAME, "kernelSlug": SLUG, "fileName": fname},
                    headers=headers,
                    auth=auth,
                    timeout=120,
                    stream=True,
                )
                if dl_resp.status_code == 200:
                    outpath = OUT_DIR / fname
                    with open(outpath, 'wb') as f:
                        for chunk in dl_resp.iter_content(8192):
                            f.write(chunk)
                    print(f"    Saved: {outpath} ({outpath.stat().st_size:,} bytes)")
                else:
                    print(f"    Error: {dl_resp.status_code} {dl_resp.text[:200]}")
            break
        elif resp2.status_code == 200:
            # Check if it's a zip
            content_type = resp2.headers.get('content-type', '')
            if 'zip' in content_type or resp2.content[:2] == b'PK':
                print("Got ZIP file directly")
                with zipfile.ZipFile(io.BytesIO(resp2.content)) as zf:
                    zf.extractall(OUT_DIR)
                print(f"Extracted to {OUT_DIR}")
                break
    except Exception as e:
        print(f"Error: {e}")

# Also try the kernels pull endpoint to get the executed notebook
print("\n--- Trying to pull executed notebook ---")
try:
    resp = requests.get(
        f"{BASE_URL}/kernels/pull",
        params={"userName": USERNAME, "kernelSlug": SLUG},
        auth=(USERNAME, "KGAT_47893c54215cc359ba93342189276b23"),
        timeout=60,
    )
    print(f"Pull: {resp.status_code}")
    if resp.status_code == 200:
        # Could be notebook json or zip
        content_type = resp.headers.get('content-type', '')
        print(f"Content-Type: {content_type}")
        if 'json' in content_type:
            nb_path = OUT_DIR / "executed_notebook.ipynb"
            with open(nb_path, 'wb') as f:
                f.write(resp.content)
            print(f"Saved notebook: {nb_path}")
        elif 'zip' in content_type or resp.content[:2] == b'PK':
            with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                zf.extractall(OUT_DIR)
            print(f"Extracted to {OUT_DIR}")
except Exception as e:
    print(f"Pull error: {e}")

# List what we got
print("\n=== Files in output dir ===")
for f in sorted(OUT_DIR.iterdir()):
    print(f"  {f.name}: {f.stat().st_size:,} bytes")