export default function HomeScreen({ onNewObservation, safetyBanner }) {
  return (
    <section className="screen hero">
      <p className="eyebrow">Mini-programa ligero</p>
      <h1>Identificacion orientativa de setas con enfoque de seguridad</h1>
      <p className="lead">
        Sube varias fotos, anade metadatos de campo y recibe candidatos visuales,
        especies toxicas parecidas y una recomendacion explicita de consulta experta.
      </p>
      <div className="warning-box">{safetyBanner}</div>
      <button className="primary-button" onClick={onNewObservation}>
        Nueva observacion
      </button>
    </section>
  );
}
