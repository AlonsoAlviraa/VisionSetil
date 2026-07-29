#!/usr/bin/env python3
"""VisionSetil mega-auditoría (tipo Accenture): juegos, nombres, cookies, seguridad.

Orquesta tests reales del repo + chequeos estáticos.
Escribe informe y logs **durables** bajo eval/reports/accenture_audit/ con rutas
relativas al repo (nunca Temp\\grok-goal-...).

Usage (repo root):
  python scripts/run_accenture_audit.py
  python scripts/run_accenture_audit.py --with-e2e
  python scripts/run_accenture_audit.py --extra-copy /path/for/goal-scratch
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REPORT_DIR = REPO / "eval" / "reports" / "accenture_audit"
POLICY = "orientation_only; unsafe_to_consume; never_forage_permission; product_unlock_not_in_scope"

# Areas that count toward overall_pass / exit code
GATING_AREAS = frozenset(
    {
        "juegos_quiz_setadle",
        "nombres_i18n",
        "cookies_auth_frontend",
        "cookies_auth_backend",
        "seguridad_backend",
        "security_static",
        "app_web_pwa",
    }
)


def _npx_cmd() -> list[str]:
    if os.name == "nt":
        return ["npx.cmd"]
    return ["npx"]


def rel_repo(path: Path | str | None) -> str:
    """Path relative to repo root with forward slashes (portable evidence refs)."""
    if path is None:
        return ""
    p = Path(path)
    try:
        if p.is_absolute():
            return p.resolve().relative_to(REPO.resolve()).as_posix()
    except ValueError:
        return str(p).replace("\\", "/")
    return p.as_posix()


def run_cmd(
    cmd: list[str],
    *,
    cwd: Path,
    log_path: Path,
    env: dict | None = None,
) -> dict:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    merged = {**os.environ, **(env or {})}
    merged.setdefault("PYTHONIOENCODING", "utf-8")
    if cmd and cmd[0] == "npx":
        cmd = _npx_cmd() + cmd[1:]
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        env=merged,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=False,
    )
    out = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    log_path.write_text(out, encoding="utf-8")
    return {
        "cmd": cmd,
        "cwd": str(cwd),
        "returncode": proc.returncode,
        "log": rel_repo(log_path),
        "pass": proc.returncode == 0,
        "tail": out[-2000:] if len(out) > 2000 else out,
    }


def static_security_scan(out_dir: Path) -> dict:
    patterns = {
        "localStorage_token_key": re.compile(r"visionsetil_session_token|SESSION_TOKEN_KEY"),
        "document_cookie": re.compile(r"document\.cookie"),
        "AUTH_COOKIE": re.compile(r"AUTH_COOKIE|auth_cookie_enabled|VITE_FEATURE_AUTH_COOKIE"),
        "auth_routes": re.compile(r"/auth/(login|logout|register|me)"),
        "httponly": re.compile(r"HttpOnly|httponly|set_cookie", re.I),
        "cors_star": re.compile(r'CORS_ORIGINS.*\*|"\*"'),
    }
    roots = [REPO / "frontend" / "src", REPO / "backend" / "app"]
    hits: dict[str, list[str]] = {k: [] for k in patterns}
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".py", ".js"}:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            rel = rel_repo(path)
            for name, rx in patterns.items():
                if rx.search(text):
                    hits[name].append(rel)

    out_path = out_dir / "accenture_static_security.txt"
    lines = ["# Static security surface scan", f"repo={rel_repo(REPO) or '.'}", ""]
    for name, files in hits.items():
        uniq = sorted(set(files))[:40]
        lines.append(f"## {name} ({len(set(files))} files)")
        for f in uniq:
            lines.append(f"  - {f}")
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")

    must = {
        "localStorage_token_key": any(
            "sessionTokenPolicy" in f or "AuthContext" in f for f in hits["localStorage_token_key"]
        ),
        "AUTH_COOKIE": len(hits["AUTH_COOKIE"]) >= 2,
        "auth_routes": len(hits["auth_routes"]) >= 1,
        "httponly": len(hits["httponly"]) >= 1,
    }
    return {
        "area": "security_static",
        "gating": True,
        "pass": all(must.values()),
        "status": "PASS" if all(must.values()) else "FAIL",
        "checks": must,
        "evidence": rel_repo(out_path),
        "hit_counts": {k: len(set(v)) for k, v in hits.items()},
    }


def pwa_web_surface_check() -> dict:
    vite = (REPO / "frontend" / "vite.config.ts").is_file() or (
        REPO / "frontend" / "vite.config.js"
    ).is_file()
    pwa_plugin = False
    for name in ("vite.config.ts", "vite.config.js", "package.json"):
        p = REPO / "frontend" / name
        if p.is_file() and "vite-plugin-pwa" in p.read_text(encoding="utf-8", errors="ignore"):
            pwa_plugin = True
            break
    sw = list((REPO / "frontend").rglob("sw*.js")) or list(
        (REPO / "frontend").rglob("*service-worker*")
    )
    ok = vite and pwa_plugin
    return {
        "area": "app_web_pwa",
        "gating": True,
        "pass": ok,
        "status": "PASS" if ok else "FAIL",
        "vite_config": vite,
        "pwa_plugin": pwa_plugin,
        "service_worker_candidates": len(sw),
        "evidence": "frontend/vite.config.ts + vite-plugin-pwa (shared SPA/PWA)",
        "note": "Same SPA serves web + PWA installable surface",
    }


def area_result(
    area: str,
    *,
    passed: bool | None,
    evidence: str,
    gating: bool = True,
    status: str | None = None,
    **extra,
) -> dict:
    if status is None:
        if passed is True:
            status = "PASS"
        elif passed is False:
            status = "FAIL"
        else:
            status = "SKIPPED"
    return {
        "area": area,
        "gating": gating,
        "pass": passed,
        "status": status,
        "evidence": evidence,
        **extra,
    }


def write_report(out_dir: Path, areas: list[dict], overall_pass: bool) -> Path:
    ts = datetime.now(timezone.utc).isoformat()
    # Sanitize: ensure no absolute temp paths in serialized areas
    clean_areas = []
    for a in areas:
        ca = dict(a)
        for key in ("log", "evidence"):
            if key in ca and ca[key]:
                ca[key] = rel_repo(ca[key]) if Path(str(ca[key])).is_absolute() else str(ca[key]).replace("\\", "/")
        # drop huge tails from durable JSON (keep short)
        if "tail" in ca and isinstance(ca["tail"], str) and len(ca["tail"]) > 800:
            ca["tail"] = ca["tail"][-800:]
        clean_areas.append(ca)

    report = {
        "title": "VisionSetil mega-auditoría (Accenture-style)",
        "generated": ts,
        "policy": POLICY,
        "product_unlock": False,
        "consumption_permission": False,
        "orientation_only": True,
        "overall_pass": overall_pass,
        "report_dir": rel_repo(out_dir),
        "areas": clean_areas,
        "matrix": [
            {
                "area": a["area"],
                "status": a.get("status")
                or (
                    "PASS"
                    if a.get("pass") is True
                    else "FAIL"
                    if a.get("pass") is False
                    else "SKIPPED"
                ),
                "pass": a.get("pass"),
                "gating": a.get("gating", a["area"] in GATING_AREAS),
                "evidence": a.get("evidence") or a.get("log") or a.get("note") or "",
            }
            for a in clean_areas
        ],
    }

    json_path = out_dir / "accenture_audit_report.json"
    md_path = out_dir / "accenture_audit_report.md"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = [
        "# VisionSetil mega-auditoría (tipo Accenture)",
        "",
        f"- Generated: `{ts}`",
        f"- Overall (gating only): **{'PASS' if overall_pass else 'FAIL'}**",
        f"- Policy: `{POLICY}`",
        "- **product_unlock: false** (esta auditoría no desbloquea Identify/consumo)",
        "- **consumption_permission: false**",
        f"- Report dir: `{rel_repo(out_dir)}`",
        "",
        "## Matriz área × resultado × evidencia",
        "",
        "| Área | Resultado | Gating | Evidencia |",
        "|------|-----------|--------|-----------|",
    ]
    for row in report["matrix"]:
        lines.append(
            f"| {row['area']} | {row['status']} | {'yes' if row['gating'] else 'no'} | `{row['evidence']}` |"
        )
    lines.extend(
        [
            "",
            "## Superficies",
            "",
            "- **App / Web / PWA**: misma codebase Vite + `vite-plugin-pwa` (SPA instalable).",
            "- **Juegos**: quiz (name/photo/food/lookalike) + Setadle — pool documentado.",
            "- **Nombres / i18n**: paridad EN/ES + catálogo SSOT.",
            "- **Cookies / auth**: dual bearer vs HttpOnly cookie (E-08); cookie mode sin token en localStorage.",
            "- **Seguridad**: CORS no-wildcard con credentials, cookie HttpOnly, API keys en prod, path hardening.",
            "",
            "## Defectos abiertos / notas",
            "",
        ]
    )
    fails = [a for a in clean_areas if a.get("gating") and a.get("pass") is False]
    skips = [a for a in clean_areas if a.get("pass") is None or a.get("status") == "SKIPPED"]
    if not fails:
        lines.append("- Ningún fallo en áreas **gating**.")
    else:
        for a in fails:
            lines.append(
                f"- **FAIL** `{a.get('area')}`: {a.get('note') or a.get('tail') or a.get('evidence')}"
            )
    if skips:
        for a in skips:
            lines.append(
                f"- **SKIPPED** `{a.get('area')}`: {a.get('note') or a.get('evidence')} (no cuenta en overall)"
            )
    lines.extend(
        [
            "",
            "## Deviations / limitaciones",
            "",
            "- E2e Playwright omitido por defecto → **SKIPPED** (no PASS falso); usar `--with-e2e` si hay browser.",
            "- No se afirma unlock de producto ni permiso de forrajeo/consumo.",
            "",
        ]
    )
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return md_path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--out",
        type=Path,
        default=REPORT_DIR,
        help="Durable report dir (default: eval/reports/accenture_audit)",
    )
    ap.add_argument(
        "--extra-copy",
        type=Path,
        default=None,
        help="Optional extra copy of reports/logs (e.g. goal scratch); primary remains --out",
    )
    ap.add_argument(
        "--scratch",
        type=Path,
        default=None,
        help="Deprecated alias for --extra-copy (primary output is always durable --out)",
    )
    ap.add_argument("--with-e2e", action="store_true", help="Attempt Playwright e2e (gating if run)")
    args = ap.parse_args()

    out_dir = args.out if args.out.is_absolute() else (REPO / args.out)
    # Always durable under repo unless user forces absolute elsewhere
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    areas: list[dict] = []

    def append_cmd(area: str, result: dict) -> None:
        areas.append(
            area_result(
                area,
                passed=result["pass"],
                evidence=result["log"],
                log=result["log"],
                tail=result.get("tail", "")[-500:],
                returncode=result.get("returncode"),
            )
        )

    append_cmd(
        "juegos_quiz_setadle",
        run_cmd(
            [
                "npx",
                "vitest",
                "run",
                "src/lib/mushroomQuiz.test.ts",
                "src/lib/quizMatch.test.ts",
                "src/lib/setadle.test.ts",
                "src/lib/foodQuality.test.ts",
                "src/lib/safetyCopy.test.ts",
                "src/lib/lookalikeStudio.test.ts",
            ],
            cwd=REPO / "frontend",
            log_path=out_dir / "accenture_games.log",
            env={"CI": "1"},
        ),
    )

    append_cmd(
        "nombres_i18n",
        run_cmd(
            [
                "npx",
                "vitest",
                "run",
                "src/lib/i18nParity.test.ts",
                "src/data/namesEs.test.ts",
                "src/lib/slug.test.ts",
                "src/data/speciesCatalog.split.test.ts",
            ],
            cwd=REPO / "frontend",
            log_path=out_dir / "accenture_names_i18n.log",
            env={"CI": "1"},
        ),
    )

    append_cmd(
        "cookies_auth_frontend",
        run_cmd(
            [
                "npx",
                "vitest",
                "run",
                "src/auth/sessionTokenPolicy.test.ts",
                "src/api/auth.cookieMode.test.ts",
            ],
            cwd=REPO / "frontend",
            log_path=out_dir / "accenture_cookies_fe.log",
            env={"CI": "1"},
        ),
    )

    append_cmd(
        "cookies_auth_backend",
        run_cmd(
            [
                sys.executable,
                "-m",
                "pytest",
                "backend/app/tests/test_auth_cookie_e08.py",
                "backend/app/tests/test_authz_phase_e.py",
                "-q",
                "--tb=line",
            ],
            cwd=REPO,
            log_path=out_dir / "accenture_cookies_be.log",
        ),
    )

    append_cmd(
        "seguridad_backend",
        run_cmd(
            [
                sys.executable,
                "-m",
                "pytest",
                "backend/app/tests/test_security.py",
                "-q",
                "--tb=line",
            ],
            cwd=REPO,
            log_path=out_dir / "accenture_security_be.log",
        ),
    )

    areas.append(static_security_scan(out_dir))
    areas.append(pwa_web_surface_check())

    # Combined unit log (gating suite outputs only)
    unit_log = out_dir / "accenture_unit.log"
    chunks: list[str] = []
    for a in areas:
        logp = a.get("log") or a.get("evidence")
        if not logp:
            continue
        abs_log = REPO / logp if not Path(str(logp)).is_absolute() else Path(str(logp))
        if abs_log.is_file() and abs_log.suffix == ".log":
            chunks.append(f"===== {a.get('area')} =====\n")
            chunks.append(abs_log.read_text(encoding="utf-8", errors="replace"))
            chunks.append("\n")
    unit_log.write_text("".join(chunks), encoding="utf-8")

    # E2e: only gating when actually run; skip is honest SKIPPED (pass=null)
    if args.with_e2e:
        e2e = run_cmd(
            ["npx", "playwright", "test", "e2e/identify-blocked.spec.ts", "--reporter=line"],
            cwd=REPO / "frontend",
            log_path=out_dir / "accenture_e2e.log",
        )
        areas.append(
            area_result(
                "e2e_identify_blocked",
                passed=e2e["pass"],
                evidence=e2e["log"],
                gating=True,
                log=e2e["log"],
                tail=e2e.get("tail", "")[-500:],
            )
        )
    else:
        areas.append(
            area_result(
                "e2e_browser",
                passed=None,
                evidence="eval/reports/accenture_audit/ (e2e not run; use --with-e2e)",
                gating=False,
                status="SKIPPED",
                note="Playwright not executed by default — not a test PASS",
            )
        )

    # Master run log
    master = out_dir / "accenture_audit_run.log"
    master_lines = []
    for a in areas:
        st = a.get("status") or (
            "PASS" if a.get("pass") is True else "FAIL" if a.get("pass") is False else "SKIPPED"
        )
        master_lines.append(
            f"{a.get('area')}: {st} gating={a.get('gating')} evidence={a.get('evidence')}"
        )
    master.write_text("\n".join(master_lines) + "\n", encoding="utf-8")

    gating_results = [
        a for a in areas if a.get("gating", a.get("area") in GATING_AREAS) is True
    ]
    overall = all(a.get("pass") is True for a in gating_results)
    report_path = write_report(out_dir, areas, overall)

    # Optional extra copy for goal scratch (does not replace durable primary)
    extra = args.extra_copy or args.scratch
    if extra:
        extra = Path(extra)
        extra.mkdir(parents=True, exist_ok=True)
        for p in out_dir.iterdir():
            if p.is_file():
                shutil.copy2(p, extra / p.name)

    print(f"overall={'PASS' if overall else 'FAIL'}")
    print(f"report={rel_repo(report_path)}")
    print(f"out_dir={rel_repo(out_dir)}")
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
