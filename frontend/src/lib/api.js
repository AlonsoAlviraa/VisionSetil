const API_BASE = "http://127.0.0.1:8000";

export async function fetchHealth() {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}

export async function listObservations() {
  const response = await fetch(`${API_BASE}/observations`);
  return response.json();
}

export async function createObservation(payload) {
  const response = await fetch(`${API_BASE}/observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function uploadImages(observationId, files) {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("images", file));
  const response = await fetch(`${API_BASE}/observations/${observationId}/images`, {
    method: "POST",
    body: formData,
  });
  return response.json();
}

export async function classifyObservation(observationId) {
  const response = await fetch(`${API_BASE}/observations/${observationId}/classify`, {
    method: "POST",
  });
  return response.json();
}

export async function poisonousSpecies() {
  const response = await fetch(`${API_BASE}/species/poisonous`);
  return response.json();
}
