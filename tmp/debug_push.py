#!/usr/bin/env python3
"""Debug the 409 conflict and try alternative push approaches."""
import requests, json, os
from pathlib import Path

TOKEN = "KGAT_47893c54215cc359ba93342189276b23"
USERNAME = "alonsoalviraaaa"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

# Read the metadata
meta = json.loads(Path("kaggle/kernel-metadata.json").read_text())
print("=== Current metadata ===")
print(json.dumps(meta, indent=2))

# Read the notebook
nb_path = Path("kaggle/visionsetil_mega_training.ipynb")
nb_content = nb_path.read_text()

# Check if kernel v11 exists via list
print("\n=== Checking if v11 kernel exists ===")
r = requests.get(
    "https://www.kaggle.com/api/v1/kernels/list",
    params={"user": USERNAME, "page_size": 50},
    headers=HEADERS,
    timeout=30,
)
kernels = r.json()
for k in kernels:
    ref = k.get("ref", "")
    if "visionsetil" in ref.lower() or "mega" in ref.lower():
        print(f"  Found: {ref}")

# Try to get details of the base kernel
print("\n=== Getting base kernel details ===")
r = requests.get(
    f"https://www.kaggle.com/api/v1/kernels/pull",
    params={"userName": USERNAME, "kernelSlug": "visionsetil-mega-training"},
    headers=HEADERS,
    timeout=30,
)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    print(f"  Title: {data.get('title','')}")
    print(f"  ref: {data.get('ref','')}")
    # Check current version
    if "metadata" in data:
        print(f"  Metadata: {json.dumps(data['metadata'], indent=2)[:500]}")

# Try push via REST API directly
print("\n=== Trying push via REST API ===")
push_payload = {
    "text": nb_content,
    "kernelType": "notebook",
    "isPrivate": True,
    "title": "visionsetil-mega-training-v11",
    "language": "python",
    "enableGpu": True,
    "enableTpu": False,
    "enableInternet": True,
    "datasetDataSources": meta.get("dataset_sources", []),
    "competitionDataSources": [],
    "kernelDataSources": [],
    "categoryIds": [],
}
r = requests.post(
    "https://www.kaggle.com/api/v1/kernels/push",
    json={"content": json.dumps(push_payload)},
    headers=HEADERS,
    timeout=60,
)
print(f"  Push status: {r.status_code}")
print(f"  Response: {r.text[:1000]}")