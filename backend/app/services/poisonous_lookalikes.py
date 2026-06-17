HIGH_RISK_GENERA = {"amanita", "galerina", "cortinarius", "lepiota", "gyromitra"}


def elevate_risk_for_genus(taxon: str, lookalikes: list[str]) -> tuple[str, list[str]]:
    genus = taxon.split()[0].lower()
    warnings = list(lookalikes)
    if genus in HIGH_RISK_GENERA:
        return "high", warnings
    if lookalikes:
        return "risky_lookalikes", warnings
    return "unknown", warnings
