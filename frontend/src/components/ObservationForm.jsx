import { useState } from "react";

const initialState = {
  title: "",
  country: "Espana",
  region: "",
  approx_location: "",
  habitat: "",
  nearby_trees: "",
  substrate: "",
  observed_at: "",
  notes: "",
  smell: "",
  color_change_on_cut: "",
};

export default function ObservationForm({ onSubmit, loading }) {
  const [form, setForm] = useState(initialState);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({
      ...form,
      nearby_trees: form.nearby_trees
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  return (
    <section className="screen">
      <div className="section-header">
        <p className="eyebrow">Flujo guiado</p>
        <h2>Nueva observacion</h2>
      </div>
      <div className="checklist">
        <strong>Checklist de fotos necesarias</strong>
        <ul>
          <li>Sombrero desde arriba</li>
          <li>Laminas o poros</li>
          <li>Pie completo</li>
          <li>Base</li>
          <li>Corte o seccion si existe</li>
        </ul>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <input name="title" placeholder="Titulo" value={form.title} onChange={update} required />
        <input name="country" placeholder="Pais" value={form.country} onChange={update} />
        <input name="region" placeholder="Provincia o region" value={form.region} onChange={update} />
        <input name="approx_location" placeholder="Ubicacion aproximada opcional" value={form.approx_location} onChange={update} />
        <input name="habitat" placeholder="Habitat" value={form.habitat} onChange={update} />
        <input name="nearby_trees" placeholder="Arboles cercanos, separados por comas" value={form.nearby_trees} onChange={update} />
        <input name="substrate" placeholder="Sustrato" value={form.substrate} onChange={update} />
        <input name="observed_at" type="date" value={form.observed_at} onChange={update} />
        <input name="smell" placeholder="Olor" value={form.smell} onChange={update} />
        <input name="color_change_on_cut" placeholder="Cambio de color al corte" value={form.color_change_on_cut} onChange={update} />
        <textarea name="notes" placeholder="Notas libres" rows="4" value={form.notes} onChange={update} />
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? "Guardando..." : "Guardar observacion"}
        </button>
      </form>
    </section>
  );
}
