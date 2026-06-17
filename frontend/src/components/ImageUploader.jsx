import { useState } from "react";

export default function ImageUploader({ observationId, onUpload, loading }) {
  const [files, setFiles] = useState([]);

  return (
    <section className="screen">
      <div className="section-header">
        <p className="eyebrow">Subida guiada</p>
        <h2>Imagenes de la observacion</h2>
      </div>
      <input
        multiple
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        type="file"
        onChange={(event) => setFiles(event.target.files)}
      />
      <p className="muted">
        Renombra las fotos si puedes: `cap-top`, `gills`, `stem`, `base`, `cut`.
      </p>
      <button
        className="primary-button"
        disabled={!observationId || !files.length || loading}
        onClick={() => onUpload(files)}
      >
        {loading ? "Subiendo..." : "Subir imagenes"}
      </button>
    </section>
  );
}
