import { useEffect, useState } from "react";

import HistoryScreen from "../components/HistoryScreen.jsx";
import HomeScreen from "../components/HomeScreen.jsx";
import ImageUploader from "../components/ImageUploader.jsx";
import ObservationForm from "../components/ObservationForm.jsx";
import ResultScreen from "../components/ResultScreen.jsx";
import {
  classifyObservation,
  createObservation,
  fetchHealth,
  listObservations,
  poisonousSpecies,
  uploadImages,
} from "../lib/api.js";

const safetyBanner =
  "Identificacion orientativa. No consumir basandose en esta app. Consulta a un experto local.";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [health, setHealth] = useState(null);
  const [observations, setObservations] = useState([]);
  const [poisonous, setPoisonous] = useState([]);
  const [activeObservation, setActiveObservation] = useState(null);
  const [classification, setClassification] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchHealth().then(setHealth);
    listObservations().then(setObservations);
    poisonousSpecies().then(setPoisonous);
  }, []);

  async function handleCreateObservation(payload) {
    setSaving(true);
    const created = await createObservation(payload);
    setSaving(false);
    setActiveObservation(created);
    setObservations((current) => [created, ...current]);
    setScreen("images");
  }

  async function handleUpload(files) {
    if (!activeObservation) return;
    setUploading(true);
    await uploadImages(activeObservation.id, files);
    const result = await classifyObservation(activeObservation.id);
    setClassification(result);
    setUploading(false);
    setScreen("result");
    listObservations().then(setObservations);
  }

  return (
    <main className="app-shell">
      <nav className="nav-bar">
        <button onClick={() => setScreen("home")}>Inicio</button>
        <button onClick={() => setScreen("new")}>Nueva observacion</button>
        <button onClick={() => setScreen("history")}>Historial</button>
      </nav>
      {health && <p className="service-pill">{health.service}</p>}
      {screen === "home" && <HomeScreen onNewObservation={() => setScreen("new")} safetyBanner={safetyBanner} />}
      {screen === "new" && <ObservationForm onSubmit={handleCreateObservation} loading={saving} />}
      {screen === "images" && (
        <ImageUploader observationId={activeObservation?.id} onUpload={handleUpload} loading={uploading} />
      )}
      {screen === "result" && <ResultScreen result={classification} />}
      {screen === "history" && <HistoryScreen observations={observations} poisonous={poisonous} />}
    </main>
  );
}
