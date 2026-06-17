ORIENTATION_ONLY_STATUS = "orientation_only"
UNSAFE_TO_CONSUME = "unsafe_to_consume"
FINAL_WARNING = "No consumas ninguna seta identificada unicamente mediante una app."
PRIMARY_MESSAGE = "Identificacion orientativa. No consumir basandose en esta app."
EXPERT_RECOMMENDATION = "Consulta a un experto local o asociacion micologica antes de cualquier decision."
ALLOWED_RISK_STATES = {
    "needs_more_evidence",
    "needs_expert_review",
    "high_risk_lookalikes",
    "unknown_or_out_of_distribution",
}


def dangerous_language_guard() -> dict[str, str]:
    return {
        "status": ORIENTATION_ONLY_STATUS,
        "safety_level": UNSAFE_TO_CONSUME,
        "message": PRIMARY_MESSAGE,
        "final_warning": FINAL_WARNING,
    }
