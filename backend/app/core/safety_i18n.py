"""Multilingual safety strings (PR-09 / D7 / D16)."""

from __future__ import annotations

from app.core.safety import (
    EXPERT_RECOMMENDATION,
    FINAL_WARNING,
    ORIENTATION_ONLY_STATUS,
    PRIMARY_MESSAGE,
    UNSAFE_TO_CONSUME,
)

SUPPORTED = ("es", "ca", "eu", "en")

# Identify / classify surfaces — never consumption confirmation language.
SAFETY_MESSAGES: dict[str, dict[str, str]] = {
    "es": {
        "status": ORIENTATION_ONLY_STATUS,
        "safety_level": UNSAFE_TO_CONSUME,
        "message": "Identificación orientativa. No consumir basándose en esta app.",
        "final_warning": "No consumas ninguna seta identificada únicamente mediante una app.",
        "expert": "Consulta a un experto local o asociación micológica antes de cualquier decisión.",
        "banner_title": "ADVERTENCIA DE SEGURIDAD",
        "banner_body": (
            "Esta identificación es orientativa y puede ser incorrecta. "
            "NUNCA consumas una seta basándote solo en este resultado. "
            "Consulta siempre con un micólogo experto antes de consumir."
        ),
        "encyclopedia_disclaimer": (
            "Información educativa. VisionSetil no recomienda el consumo de setas silvestres. "
            "La edibilidad mostrada es de referencia micológica, no una autorización de consumo."
        ),
    },
    "ca": {
        "status": ORIENTATION_ONLY_STATUS,
        "safety_level": UNSAFE_TO_CONSUME,
        "message": "Identificació orientativa. No consumiu basant-vos només en aquesta app.",
        "final_warning": "No consumiu cap bolet identificat únicament amb una app.",
        "expert": "Consulteu un expert local o una associació micològica abans de qualsevol decisió.",
        "banner_title": "ADVERTÈNCIA DE SEGURETAT",
        "banner_body": (
            "Aquesta identificació és orientativa i pot ser incorrecta. "
            "MAI no consumiu un bolet basant-vos només en aquest resultat. "
            "Consulteu sempre un micòleg expert."
        ),
        "encyclopedia_disclaimer": (
            "Informació educativa. VisionSetil no recomana el consum de bolets silvestres. "
            "La comestibilitat mostrada és de referència micològica, no una autorització de consum."
        ),
    },
    "eu": {
        "status": ORIENTATION_ONLY_STATUS,
        "safety_level": UNSAFE_TO_CONSUME,
        "message": "Identifikazio orientagarria. Ez jan app honetan soilik oinarrituta.",
        "final_warning": "Ez jan app bidez bakarrik identifikatutako perretxikorik.",
        "expert": "Erabaki bat hartu aurretik, kontsultatu tokiko aditu edo mikologia elkarte bati.",
        "banner_title": "SEGURTASUN OHARRA",
        "banner_body": (
            "Identifikazio hau orientagarria da eta okerra izan daiteke. "
            "INOIZ ez jan perretxikorik emaitza honetan soilik oinarrituta. "
            "Kontsultatu beti mikologo aditu bati."
        ),
        "encyclopedia_disclaimer": (
            "Informazio hezigarria. VisionSetil-ek ez du basoko perretxikoak jatea gomendatzen. "
            "Erakutsitako jangarritasuna erreferentzia mikologikoa da, ez kontsumorako baimena."
        ),
    },
    "en": {
        "status": ORIENTATION_ONLY_STATUS,
        "safety_level": UNSAFE_TO_CONSUME,
        "message": "Orientation-only identification. Do not consume based on this app.",
        "final_warning": "Do not eat any mushroom identified solely by an app.",
        "expert": "Consult a local expert or mycological society before any decision.",
        "banner_title": "SAFETY WARNING",
        "banner_body": (
            "This identification is orientation-only and may be wrong. "
            "NEVER eat a mushroom based only on this result. "
            "Always consult an expert mycologist before consumption."
        ),
        "encyclopedia_disclaimer": (
            "Educational information. VisionSetil does not recommend eating wild mushrooms. "
            "Edibility labels are mycological reference only, not permission to consume."
        ),
    },
}

# Encyclopedia educational edibility labels — no "safe to eat" wording.
EDIBILITY_EDUCATIONAL: dict[str, dict[str, str]] = {
    "es": {
        "excelente": "Interés culinario alto (solo referencia educativa)",
        "buen_comestible": "Interés culinario (referencia educativa)",
        "comestible_con_cautela": "Tradicionalmente citado con cautela (educativo)",
        "no_recomendado": "No recomendado (referencia)",
        "toxico": "Tóxico",
        "mortifero": "Mortal",
        "desconocido": "Desconocido",
    },
    "ca": {
        "excelente": "Interès culinari alt (només referència educativa)",
        "buen_comestible": "Interès culinari (referència educativa)",
        "comestible_con_cautela": "Citat amb cautela (educatiu)",
        "no_recomendado": "No recomanat (referència)",
        "toxico": "Tòxic",
        "mortifero": "Mortal",
        "desconocido": "Desconegut",
    },
    "eu": {
        "excelente": "Sukaldaritzako interes handia (hezkuntza-erreferentzia soilik)",
        "buen_comestible": "Sukaldaritzako interesa (hezkuntza-erreferentzia)",
        "comestible_con_cautela": "Kontuz aipatua (hezitzailea)",
        "no_recomendado": "Ez gomendatua (erreferentzia)",
        "toxico": "Toxikoa",
        "mortifero": "Hilgarria",
        "desconocido": "Ezezaguna",
    },
    "en": {
        "excelente": "High culinary interest (educational only)",
        "buen_comestible": "Culinary interest (educational reference)",
        "comestible_con_cautela": "Traditionally cited with caution (educational)",
        "no_recomendado": "Not recommended (reference)",
        "toxico": "Toxic",
        "mortifero": "Deadly",
        "desconocido": "Unknown",
    },
}

# Risk-oriented labels for Identify / Result (never "excellent edible").
IDENTIFY_RISK_LABELS: dict[str, dict[str, str]] = {
    "es": {
        "deadly": "Mortal",
        "high": "Alto riesgo / tóxica",
        "medium": "Riesgo moderado",
        "low": "Riesgo desconocido — no consumir",
        "unknown": "Desconocido — no consumir",
        "risky_lookalikes": "Confusiones peligrosas posibles",
        "toxic": "Tóxica",
        "dangerous_or_unknown": "Peligrosa o desconocida",
    },
    "ca": {
        "deadly": "Mortal",
        "high": "Risc alt / tòxica",
        "medium": "Risc moderat",
        "low": "Risc desconegut — no consumir",
        "unknown": "Desconegut — no consumir",
        "risky_lookalikes": "Possibles confusions perilloses",
        "toxic": "Tòxica",
        "dangerous_or_unknown": "Perillosa o desconeguda",
    },
    "eu": {
        "deadly": "Hilgarria",
        "high": "Arrisku handia / toxikoa",
        "medium": "Arrisku ertaina",
        "low": "Arrisku ezezaguna — ez jan",
        "unknown": "Ezezaguna — ez jan",
        "risky_lookalikes": "Nahasketa arriskutsuak posible",
        "toxic": "Toxikoa",
        "dangerous_or_unknown": "Arriskutsua edo ezezaguna",
    },
    "en": {
        "deadly": "Deadly",
        "high": "High risk / toxic",
        "medium": "Moderate risk",
        "low": "Unknown risk — do not consume",
        "unknown": "Unknown — do not consume",
        "risky_lookalikes": "Dangerous lookalikes possible",
        "toxic": "Toxic",
        "dangerous_or_unknown": "Dangerous or unknown",
    },
}

# Blacklist for classify payloads / identify UI (multi-locale).
CONSUMPTION_BLACKLIST: dict[str, list[str]] = {
    "es": [
        "seguro comer",
        "segura para comer",
        "seguro para consumir",
        "apto para consumo",
        "excelente comestible",
        "buen comestible",
        "se puede comer",
        "es comestible",
        "safe to eat",
    ],
    "ca": [
        "es pot menjar",
        "segur menjar",
        "segur per consumir",
        "apte per al consum",
        "bon comestible",
        "excel·lent comestible",
    ],
    "eu": [
        "jan daiteke",
        "jangarria da",
        "segurua da jateko",
        "kontsumitzeko segurua",
    ],
    "en": [
        "safe to eat",
        "safe for consumption",
        "good to eat",
        "edible and safe",
        "perfectly edible",
        "you can eat",
    ],
}


def normalize_locale(locale: str | None) -> str:
    if not locale:
        return "es"
    loc = locale.strip().lower().split("-")[0]
    return loc if loc in SUPPORTED else "es"


def get_safety_bundle(locale: str | None = None) -> dict[str, str]:
    loc = normalize_locale(locale)
    return dict(SAFETY_MESSAGES.get(loc, SAFETY_MESSAGES["es"]))


def dangerous_language_guard_i18n(locale: str | None = None) -> dict[str, str]:
    bundle = get_safety_bundle(locale)
    return {
        "status": bundle["status"],
        "safety_level": bundle["safety_level"],
        "message": bundle["message"],
        "final_warning": bundle["final_warning"],
        "expert": bundle.get("expert", EXPERT_RECOMMENDATION),
    }


def educational_edibility_label(code: str, locale: str | None = None) -> str:
    loc = normalize_locale(locale)
    table = EDIBILITY_EDUCATIONAL.get(loc, EDIBILITY_EDUCATIONAL["es"])
    return table.get(code, table.get("desconocido", code))


def identify_risk_label(key: str, locale: str | None = None) -> str:
    loc = normalize_locale(locale)
    table = IDENTIFY_RISK_LABELS.get(loc, IDENTIFY_RISK_LABELS["es"])
    return table.get(key, table.get("unknown", key))


def contains_consumption_language(text: str, locale: str | None = None) -> list[str]:
    """Return blacklist hits found in text (casefold)."""
    if not text:
        return []
    low = text.casefold()
    locs = [normalize_locale(locale)] if locale else list(SUPPORTED)
    hits: list[str] = []
    for loc in locs:
        for phrase in CONSUMPTION_BLACKLIST.get(loc, []):
            if phrase.casefold() in low:
                hits.append(phrase)
    return hits


# Back-compat aliases matching core.safety defaults
def primary_message(locale: str | None = None) -> str:
    return get_safety_bundle(locale)["message"]


def final_warning(locale: str | None = None) -> str:
    return get_safety_bundle(locale)["final_warning"]
