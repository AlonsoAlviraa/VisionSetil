const previewInput = document.getElementById("photos");
const previewStrip = document.getElementById("preview-strip");
const observationForm = document.getElementById("observation-form");
const observationsList = document.getElementById("observations-list");
const observationTemplate = document.getElementById("observation-template");
const chatForm = document.getElementById("chat-form");
const chatResponse = document.getElementById("chat-response");

if (previewInput && previewStrip) {
  previewInput.addEventListener("change", () => {
    previewStrip.innerHTML = "";
    Array.from(previewInput.files || []).slice(0, 6).forEach((file) => {
      const wrapper = document.createElement("div");
      wrapper.className = "preview-card";
      const img = document.createElement("img");
      img.alt = file.name;
      img.src = URL.createObjectURL(file);
      wrapper.appendChild(img);
      previewStrip.appendChild(wrapper);
    });
  });
}

if (observationForm) {
  observationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(observationForm);
    const response = await fetch("/api/observations", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      alert(payload.detail || "No se pudo guardar la observacion.");
      return;
    }
    observationForm.reset();
    previewStrip.innerHTML = "";
    renderObservation(payload);
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(chatForm);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: formData.get("question") }),
    });
    const payload = await response.json();
    chatResponse.innerHTML = `
      <p>${payload.answer}</p>
      <p class="warning-inline">${payload.disclaimer}</p>
    `;
  });
}

function renderObservation(observation) {
  if (!observationsList || !observationTemplate) {
    return;
  }
  const fragment = observationTemplate.content.cloneNode(true);
  fragment.querySelector("[data-title]").textContent = observation.title;
  fragment.querySelector("[data-headline]").textContent = observation.classifier_summary.headline;
  fragment.querySelector("[data-meta]").textContent =
    `Riesgo: ${observation.risk_level} · Confianza: ${Math.round(observation.confidence * 100)}%`;
  fragment.querySelector("[data-disclaimer]").textContent = observation.classifier_summary.disclaimer;
  observationsList.prepend(fragment);
}
