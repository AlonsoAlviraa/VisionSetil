export default function ResultScreen({ result }) {
  if (!result) {
    return (
      <section className="screen">
        <h2>Resultado</h2>
        <p className="muted">Todavia no hay clasificacion generada.</p>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="section-header">
        <p className="eyebrow">Resultado</p>
        <h2>Identificacion orientativa</h2>
      </div>
      <div className="warning-box">{result.final_warning}</div>
      <p>{result.message}</p>
      <div className="card-list">
        {result.candidates.map((candidate) => (
          <article key={candidate.taxon} className="card">
            <h3>{candidate.taxon}</h3>
            <p>Rango: {candidate.rank}</p>
            <p>Confianza: {Math.round(candidate.confidence * 100)}%</p>
            <p>Lookalikes: {candidate.lookalikes.join(", ")}</p>
          </article>
        ))}
      </div>
      <div className="card">
        <h3>Evidencias faltantes</h3>
        <ul>
          {result.missing_evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
