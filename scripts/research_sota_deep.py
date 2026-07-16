"""Deeper SOTA research — fetch FungiCLEF 2025 1st place solution structure,
the prototype-network paper, and catalogue best public datasets.

Run:  python scripts/research_sota_deep.py
"""
from __future__ import annotations

import json
import re
import urllib.request


def fetch(url: str, timeout: int = 20, accept: str | None = None) -> bytes:
    headers = {"User-Agent": "VisionSetil-Research/1.0"}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_text(url: str) -> str:
    return fetch(url).decode("utf-8", errors="replace")


def fetch_json(url: str) -> dict:
    return json.loads(fetch(url, accept="application/vnd.github.v3+json"))


def list_repo(repo: str, path: str = "") -> None:
    url = f"https://api.github.com/repos/{repo}/contents/{path}"
    try:
        data = fetch_json(url)
        print(f"\n--- {repo}/{path} ---")
        for item in data:
            print(f"  {item['type']:6s} {item['size']:9d}  {item['name']}")
    except Exception as e:
        print(f"  [error listing {repo}/{path}: {e}]")


def fetch_raw(repo: str, path: str, max_chars: int = 6000) -> None:
    url = f"https://raw.githubusercontent.com/{repo}/main/{path}"
    try:
        text = fetch_text(url)
        print(f"\n--- {repo}/{path} ({len(text)} chars) ---")
        print(text[:max_chars])
    except Exception as e:
        print(f"  [error fetching {repo}/{path}: {e}]")


if __name__ == "__main__":
    # FungiCLEF 2025 1st place
    list_repo("Jack-Etheredge/fungiclef2025")
    fetch_raw("Jack-Etheredge/fungiclef2025", "README.md")

    # Prototype network paper repo
    list_repo("abtraore/Prototype-Network-FungiCLEF25")
    fetch_raw("abtraore/Prototype-Network-FungiCLEF25", "README.md")

    # Check for pytorch-fungi / FungiTastic official
    list_repo("BoleteFilter/bolete-classifier")
    fetch_raw("BoleteFilter/bolete-classifier", "README.md", max_chars=2500)

    # FungiTastic / Danish Fungi official datasets on github
    for repo in ["pwawra/fungitastic", "piasorensen/danish-fungi-2020", "BVLC/caffe"]:
        try:
            info = fetch_json(f"https://api.github.com/repos/{repo}")
            print(f"\n{repo}: stars={info.get('stargazers_count')} "
                  f"desc={(info.get('description') or '')[:80]}")
        except Exception as e:
            print(f"{repo}: {e}")