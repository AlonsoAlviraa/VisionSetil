export default function HistoryScreen({ observations, poisonous }) {
  return (
    <section className="screen">
      <div className="section-header">
        <p className="eyebrow">Coleccion personal</p>
        <h2>Historial y especies peligrosas</h2>
      </div>
      <div className="card-list">
        {observations.map((observation) => (
          <article key={observation.id} className="card">
            <h3>{observation.title}</h3>
            <p>{observation.region || observation.country || "Sin region"}</p>
            <p>{observation.observed_at || "Sin fecha"}</p>
          </article>
        ))}
      </div>
      <div className="card">
        <h3>Catalogo de especies peligrosas</h3>
        <ul>
          {poisonous.map((species) => (
            <li key={species.latin_name}>
              {species.latin_name} - {species.risk_level}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
