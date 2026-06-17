from app.models import Observation


SAFETY_DISCLAIMER = (
    "Orientacion educativa solamente. VisionSetil nunca confirma que una seta sea comestible o segura. "
    "Consulta a una persona experta antes de cualquier decision."
)


def answer_question(question: str, observation: Observation | None = None) -> str:
    normalized = question.lower()
    if "comer" in normalized or "edible" in normalized or "segura" in normalized:
        return (
            "No puedo ayudarte a decidir consumo. La app esta disenada para bloquear conclusiones de seguridad "
            "alimentaria y derivar siempre a una revision humana especializada."
        )
    if observation is None:
        return (
            "Puedo explicar rasgos observacionales, riesgos generales y que fotos faltan, pero no emitir un veredicto de seguridad. "
            "Si subes una observacion, priorizare advertencias y pasos de verificacion."
        )
    return (
        f"Sobre la observacion '{observation.title}', el nivel de riesgo registrado es {observation.risk_level}. "
        "Revisa la base completa del pie, las laminas y el habitat, compara con el catalogo de especies peligrosas "
        "y pide confirmacion a una asociacion micologica o persona experta local."
    )
