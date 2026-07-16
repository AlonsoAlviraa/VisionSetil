#!/usr/bin/env python3
"""List kernels for the user to find visionsetil kernels and their status."""
import requests, json

TOKEN = "KGAT_47893c54215cc359ba93342189276b23"
USERNAME = "alonsoalviraaaa"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# List all kernels
r = requests.get(
    "https://www.kaggle.com/api/v1/kernels/list",
    params={"user": USERNAME, "page_size": 50},
    headers=HEADERS,
    timeout=30,
)
print(f"List status: {r.status_code}")
if r.status_code != 200:
    print(r.text[:500])
    exit(1)

data = r.json()
print(f"Total kernels returned: {len(data)}\n")

# Filter for visionsetil/fungi kernels
print("=== VisionSetil/Fungi kernels ===")
for k in data:
    ref = k.get("ref", "")
    if any(w in ref.lower() for w in ["vision", "fungi", "setil", "mega"]):
        print(f"  ref: {ref}")
        print(f"  title: {k.get('title','')}")
        print(f"  lastRun: {k.get('lastRunTime','')}")
        print(f"  isPrivate: {k.get('isPrivate','')}")
        print()

# Also show ALL kernels to understand the landscape
print("\n=== ALL kernels (ref + lastRun) ===")
for k in data:
    print(f"  {k.get('ref','?'):50s} | {k.get('lastRunTime','?')}")