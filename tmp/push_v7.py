"""Push v7 kernel to Kaggle using API directly."""
import requests
import json
import os
import zipfile
import io

USERNAME = "alonsoalviraaaa"
TOKEN = "KGAT_47893c54215cc359ba93342189276b23"

# First check kernel status
print("Checking kernel status...")
resp = requests.get(
    "https://www.kaggle.com/api/v1/kernels/status",
    params={"userName": USERNAME, "kernelSlug": "visionsetil-mega-training"},
    auth=(USERNAME, TOKEN),
    timeout=30,
)
print(f"Status code: {resp.status_code}")
print(f"Response: {resp.text[:500]}")

if resp.status_code == 200:
    data = resp.json()
    status = data.get("status", "unknown")
    print(f"Kernel status: {status}")
    if status == "running":
        print("Kernel is RUNNING — cannot push until it finishes or is cancelled.")
        print("Attempting to cancel...")
        # Try to cancel the running kernel
        cancel_resp = requests.post(
            "https://www.kaggle.com/api/v1/kernels/cancel",
            data={"userName": USERNAME, "kernelSlug": "visionsetil-mega-training"},
            auth=(USERNAME, TOKEN),
            timeout=30,
        )
        print(f"Cancel status: {cancel_resp.status_code} {cancel_resp.text[:200]}")
elif resp.status_code == 403:
    print("Auth issue with status endpoint. Trying push directly...")

# Read the notebook
nb_path = r"C:\AlonsoAlviraa\VisionSetil\kaggle\visionsetil_mega_training.ipynb"
with open(nb_path, "r", encoding="utf-8") as f:
    notebook_content = f.read()

# Push kernel via API
print("\nPushing kernel v7...")
push_data = {
    "text": notebook_content,
    "kernelType": "notebook",
    "title": "visionsetil-mega-training",
    "id": f"{USERNAME}/visionsetil-mega-training",
    "language": "python",
    "isPrivate": True,
    "enableGpu": True,
    "enableTpu": False,
    "enableInternet": True,
    "datasetDataSources": ["seemshukla/fungiclef", "picekl/fungitastic"],
    "competitionDataSources": [],
    "kernelDataSources": [],
    "categoryIds": [],
}

push_resp = requests.post(
    "https://www.kaggle.com/api/v1/kernels/push",
    data={"text": json.dumps(push_data)},
    auth=(USERNAME, TOKEN),
    timeout=120,
)
print(f"Push status: {push_resp.status_code}")
print(f"Push response: {push_resp.text[:500]}")