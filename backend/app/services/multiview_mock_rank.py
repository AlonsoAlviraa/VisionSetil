"""Multi-view aware scoring helpers for mock classifier (unit-testable, no GPU).

Improvements (ML polish loop):
  - open-set uses top-2 confidence margin
  - relative score normalization for more stable ranks
  - stronger deadly/high-risk prioritization on thin margins
  - evidence coverage helpers for FE transparency
"""

from __future__ import annotations

import math
from typing import Any

VIEW_ALIAS: dict[str, str] = {
    "gills": "gills_or_pores",
    "gills_or_pores": "gills_or_pores",
    "front": "cap_top",
    "cap": "cap_top",
    "cap_top": "cap_top",
    "habitat": "environment",
    "environment": "environment",
    "detail": "base",
    "base": "base",
    "stem": "stem",
}

CRITICAL_VIEWS = frozenset({"gills_or_pores", "cap_top", "base"})
HIGH_RISK = frozenset({"deadly", "poisonous", "toxic", "high", "critical", "mortal"})


def normalize_view(label: str | None) -> str | None:
    if not label:
        return None
    return VIEW_ALIAS.get(label.strip().lower())


def views_present(images: list[Any]) -> set[str]:
    found: set[str] = set()
    for img in images:
        vt = getattr(img, "view_type", None) or ""
        n = normalize_view(vt)
        if n:
            found.add(n)
        name = (getattr(img, "original_name", None) or "").lower()
        if any(t in name for t in ("gill", "lamina", "poro", "himenio")):
            found.add("gills_or_pores")
        if any(t in name for t in ("cap", "top", "sombrero", "front")):
            found.add("cap_top")
        if any(t in name for t in ("base", "volva", "bulbo")):
            found.add("base")
        if any(t in name for t in ("habitat", "entorno", "context", "environment", "suelo")):
            found.add("environment")
        if any(t in name for t in ("stem", "pie", "anillo")):
            found.add("stem")
    return found


def view_coverage_list(images: list[Any]) -> list[str]:
    """Stable sorted list of normalized views for API/FE."""
    return sorted(views_present(images))


def multi_view_bonus(images: list[Any]) -> float:
    present = views_present(images)
    if not images:
        return 0.0
    bonus = min(0.06 * len(images), 0.18)
    bonus += 0.045 * len(present & CRITICAL_VIEWS)
    if "environment" in present:
        bonus += 0.02
    if "stem" in present:
        bonus += 0.015
    # Full critical set is a strong cue
    if CRITICAL_VIEWS.issubset(present):
        bonus += 0.05
    return min(bonus, 0.32)


def multi_view_penalty(images: list[Any]) -> float:
    present = views_present(images)
    penalty = 0.0
    if len(images) < 2:
        penalty += 0.12
    if len(images) < 3:
        penalty += 0.06
    if "gills_or_pores" not in present:
        penalty += 0.09
    if "base" not in present:
        penalty += 0.08
    if "cap_top" not in present:
        penalty += 0.05
    return min(penalty, 0.38)


def risk_priority_boost(candidate: dict[str, Any], haystack: str) -> float:
    risk = str(
        candidate.get("risk_level")
        or candidate.get("risk_label")
        or candidate.get("food_class")
        or ""
    ).lower()
    taxon = str(candidate.get("taxon") or "").lower()
    boost = 0.0
    if risk in HIGH_RISK or "deadly" in risk or "poison" in risk or risk == "mortal":
        boost += 0.07
        if "amanita" in taxon and "amanita" in haystack:
            boost += 0.15
        if any(k in haystack for k in ("volva", "blanco", "laminas blancas", "anillo", "oronja")):
            if "amanita" in taxon or risk in ("deadly", "mortal", "critical"):
                boost += 0.09
        if any(k in haystack for k in ("madera", "tronco", "wood")) and "galerina" in taxon:
            boost += 0.1
    return min(boost, 0.28)


def keyword_overlap_score(candidate: dict[str, Any], haystack: str) -> float:
    """Score from diagnostic features, common names, habitats."""
    score = 0.0
    keywords = list(candidate.get("keywords") or candidate.get("diagnostic_features") or [])
    for cn in candidate.get("common_names") or []:
        keywords.append(cn)
    for habitat in candidate.get("habitats") or []:
        keywords.append(habitat)
    for kw in keywords:
        k = str(kw or "").lower().strip()
        if len(k) < 3:
            continue
        if k in haystack:
            score += 0.09
    taxon = str(candidate.get("taxon") or "")
    parts = taxon.lower().split()
    if len(parts) >= 2 and parts[1] in haystack:
        score += 0.12
    if parts and parts[0] in haystack:
        score += 0.08
    return min(score, 0.45)


def confidence_margin(top1: float, top2: float | None) -> float:
    if top2 is None:
        return float(top1)
    return max(0.0, float(top1) - float(top2))


def should_open_set_reject(
    top_confidence: float,
    images: list[Any],
    *,
    second_confidence: float | None = None,
    min_conf: float = 0.28,
    min_margin: float = 0.06,
) -> tuple[bool, str | None]:
    if not images:
        return True, "Sin imágenes — abstención por seguridad."
    if top_confidence < min_conf:
        return True, "Confianza insuficiente — open-set / abstención orientativa."
    present = views_present(images)
    if len(images) == 1 and top_confidence < 0.45 and "gills_or_pores" not in present:
        return True, "Una sola vista débil — se necesita más evidencia."
    if second_confidence is not None:
        margin = confidence_margin(top_confidence, second_confidence)
        if margin < min_margin and top_confidence < 0.55:
            return (
                True,
                "El modelo duda entre varias especies (margen bajo) — se abstiene.",
            )
    if len(present & CRITICAL_VIEWS) == 0 and top_confidence < 0.5:
        return True, "Sin vistas críticas etiquetadas y confianza moderada — abstención."
    return False, None


def relative_normalize(
    scored: list[tuple[float, dict[str, Any]]],
    *,
    temperature: float = 0.35,
) -> list[tuple[float, dict[str, Any]]]:
    """Softmax-like re-scale so top scores sum closer to a probability mass."""
    if not scored:
        return []
    # Avoid extreme exp overflow
    max_s = max(s for s, _ in scored)
    exps = [math.exp((s - max_s) / max(temperature, 0.05)) for s, _ in scored]
    total = sum(exps) or 1.0
    out: list[tuple[float, dict[str, Any]]] = []
    for (s, cand), e in zip(scored, exps, strict=False):
        # Blend raw and relative so ranking stays informative
        rel = e / total
        blended = 0.55 * s + 0.45 * (0.15 + 0.75 * rel)
        out.append((max(0.05, min(blended, 0.9)), cand))
    out.sort(key=lambda x: x[0], reverse=True)
    return out


def rank_candidates(
    scored: list[tuple[float, dict[str, Any]]],
    *,
    images: list[Any],
    haystack: str,
    normalize: bool = True,
) -> list[tuple[float, dict[str, Any]]]:
    mv_bonus = multi_view_bonus(images)
    mv_pen = multi_view_penalty(images)
    out: list[tuple[float, dict[str, Any]]] = []
    for base, cand in scored:
        score = (
            base
            + mv_bonus
            - mv_pen
            + risk_priority_boost(cand, haystack)
            + keyword_overlap_score(cand, haystack) * 0.35
        )
        score = max(0.05, min(score, 0.9))
        out.append((score, cand))
    out.sort(key=lambda x: x[0], reverse=True)

    if normalize and len(out) >= 2:
        out = relative_normalize(out)

    # Thin margin → prefer higher risk (safety-first R7)
    if len(out) >= 2 and abs(out[0][0] - out[1][0]) < 0.05:

        def risk_rank(c: dict[str, Any]) -> int:
            r = str(c.get("risk_level") or c.get("risk_label") or c.get("food_class") or "").lower()
            if r in ("deadly", "critical", "mortal"):
                return 3
            if r in ("poisonous", "toxic", "high", "toxica"):
                return 2
            return 0

        top_slice = out[:4]
        top_slice.sort(key=lambda x: (risk_rank(x[1]), x[0]), reverse=True)
        out = top_slice + out[4:]
    return out


def build_ml_notes(
    *,
    images: list[Any],
    top_conf: float,
    second_conf: float | None,
    rejected: bool,
) -> list[str]:
    notes: list[str] = []
    present = views_present(images)
    notes.append(f"Vistas detectadas: {', '.join(sorted(present)) or 'ninguna etiquetada'}.")
    if second_conf is not None:
        notes.append(f"Margen top-1 vs top-2: {confidence_margin(top_conf, second_conf):.2f}.")
    if rejected:
        notes.append("Decisión open-set: abstención orientativa (seguridad primero).")
    else:
        notes.append("Decisión: pista tentativa — no es identificación definitiva.")
    missing = sorted(CRITICAL_VIEWS - present)
    if missing:
        notes.append(f"Vistas críticas faltantes: {', '.join(missing)}.")
    return notes
