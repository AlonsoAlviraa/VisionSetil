"""Write professional tester reports."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def write_reports(payload: dict[str, Any], out_prefix: Path) -> tuple[Path, Path]:
    out_prefix = Path(out_prefix)
    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    jp = out_prefix.with_suffix(".json")
    mp = out_prefix.with_suffix(".md")
    jp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = [
        "# Professional ML Tester Report",
        "",
        f"**Generated:** {payload.get('generated', '')}",
        f"**Overall:** **{payload.get('overall', 'UNKNOWN')}**",
        f"**Exit intent:** {payload.get('exit_code', '')}",
        "",
        "> Orientation only — never consumption permission. Gates are advisory.",
        "",
        "## Suites",
        "",
    ]
    lines.append(
        f"**product_unlock:** `{payload.get('product_unlock', False)}` "
        "(fail-closed until E20 honest holdout)"
    )
    lines.append("")
    for s in payload.get("suites", []):
        lines.append(f"### {s.get('name', '?')} — {s.get('status', '?')}")
        if s.get("detail"):
            lines.append(f"- {s['detail']}")
        for f in s.get("flags", [])[:20]:
            lines.append(f"- flag: {f}")
        lines.append("")
    if payload.get("pair_metrics"):
        lines.append("## Pair metrics")
        lines.append("")
        lines.append(f"```json\n{json.dumps(payload['pair_metrics'], indent=2)[:1500]}\n```")
        lines.append("")
    if payload.get("open_set_holdout"):
        lines.append("## Open-set holdout monitor (S8)")
        lines.append("")
        osh = payload["open_set_holdout"]
        rec = (osh.get("recommended") or {}) if isinstance(osh, dict) else {}
        mate = (osh.get("lookalike_mate_rates") or {}) if isinstance(osh, dict) else {}
        lines.append(f"- **top1_accuracy:** `{osh.get('top1_accuracy') if isinstance(osh, dict) else None}`")
        lines.append(
            f"- **recommended conf/margin:** `{rec.get('conf_thr')}` / `{rec.get('margin_thr')}` "
            f"(reject_rate=`{rec.get('reject_rate')}`, acc_keep=`{rec.get('acc_keep')}`)"
        )
        lines.append(
            f"- **mate@3 rate:** `{mate.get('lookalike_mate_in_topk_rate')}` "
            f"(true@3=`{mate.get('true_in_topk_rate')}`)"
        )
        lines.append("")
        lines.append(f"```json\n{json.dumps(osh if isinstance(osh, dict) else {}, indent=2)[:2000]}\n```")
        lines.append("")
    if payload.get("product_unlock_eval"):
        ue = payload["product_unlock_eval"]
        lines.append("## product_unlock criteria evaluation")
        lines.append("")
        lines.append(f"- **product_unlock:** `{ue.get('product_unlock', False)}`")
        lines.append(
            f"- **unlock_eligible_advisory:** `{ue.get('unlock_eligible_advisory', False)}`"
        )
        lines.append(f"- **reasons:** {ue.get('reasons')}")
        lines.append(f"- **checks:** `{json.dumps(ue.get('checks') or {})}`")
        lines.append("")
    if payload.get("artifacts"):
        lines.append("## Artifact audits")
        lines.append("")
        for a in payload["artifacts"]:
            st = a.get("status", a.get("pass"))
            lines.append(f"- `{a.get('path')}`: {st} flags={a.get('flags', [])}")
        lines.append("")
    mp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return jp, mp


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
