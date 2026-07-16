"""Quick SOTA research script for VisionSetil — fetches GitHub repos & arXiv papers
on fungi/mushroom classification, FungiCLEF, and related vision backbones.

Run:  python scripts/research_sota.py
"""
from __future__ import annotations

import json
import urllib.request


def fetch_json(url: str, timeout: int = 20) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-Research/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_repos(query: str, limit: int = 10) -> None:
    url = (
        "https://api.github.com/search/repositories?q="
        + urllib.request.quote(query)
        + f"&sort=stars&order=desc&per_page={limit}"
    )
    data = fetch_json(url)
    print(f"\n{'='*80}\nREPOS: {query}\n{'='*80}")
    for r in data.get("items", [])[:limit]:
        name = r["full_name"]
        stars = r["stargazers_count"]
        desc = (r.get("description") or "")[:75]
        print(f"  {name:50s} stars={stars:5d}  {desc}")


def search_arxiv(query: str, limit: int = 5) -> None:
    url = (
        "http://export.arxiv.org/api/query?search_query="
        + urllib.request.quote(query)
        + f"&start=0&max_results={limit}"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VisionSetil-Research/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            text = resp.read().decode("utf-8")
        print(f"\n{'='*80}\narXiv: {query}\n{'='*80}")
        # Simple XML parse for titles
        import re
        titles = re.findall(r"<title>(.*?)</title>", text, re.DOTALL)
        for t in titles[1:limit+1]:  # skip feed title
            clean = " ".join(t.split())[:90]
            print(f"  - {clean}")
    except Exception as e:
        print(f"  [arXiv error: {e}]")


if __name__ == "__main__":
    for q in [
        "fungiclef fungi classification",
        "mushroom identification deep learning",
        "danish fungi 2020 DF20",
        "plantCLEF hyperbolic embedding",
        "vision transformer fine-grained classification",
    ]:
        search_repos(q, limit=8)

    for q in [
        "FungiCLEF mushroom classification observation",
        "fine-grained visual classification fungi",
        "open-set recognition fungi species",
        "DINOv3 self-supervised mushroom",
        "multi-view fusion attention pooling",
    ]:
        search_arxiv(q, limit=5)