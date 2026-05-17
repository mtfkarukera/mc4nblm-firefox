// Magic Clipper for Google Drive — popup.js

const uploadBtn      = document.getElementById("upload-btn");
const authStatus     = document.getElementById("auth-status");
const fileInfo       = document.getElementById("file-info");
const fileName       = document.getElementById("file-name");
const driveLinkRow   = document.getElementById("drive-link-row");
const driveLink      = document.getElementById("drive-link");
const disconnectBtn  = document.getElementById("disconnect-btn");
const statusMessage  = document.getElementById("status-message");
const btnSpinner     = document.getElementById("btn-spinner");
const btnText        = uploadBtn.querySelector(".btn-text");

function setStatus(msg) {
  statusMessage.textContent = msg;
}

function setAuthBadge(state, label) {
  authStatus.className = "status-badge status-" + state;
  authStatus.textContent = label;
}

function setLoading(loading) {
  uploadBtn.disabled = loading;
  btnSpinner.classList.toggle("hidden", !loading);
  btnText.textContent = loading ? "Envoi en cours…" : "⬆️ Envoyer vers Google Drive";
}

// Initialisation : détecte l'onglet actif
(async () => {
  setAuthBadge("loading", "Connexion…");
  try {
    const tabs = await browser.tabs.query({ currentWindow: true, active: true });
    const tab = tabs[0];
    const url = tab?.url || "";

    if (url.startsWith("file://")) {
      fileInfo.classList.add("warning");
      fileName.textContent = "Fichiers locaux non pris en charge";
      setStatus("Ouvrez le PDF depuis une URL en ligne.");
      setAuthBadge("error", "Non disponible");
      return;
    }

    if (!url.toLowerCase().includes(".pdf")) {
      fileInfo.classList.add("warning");
      fileName.textContent = "Aucun PDF détecté dans cet onglet";
      setStatus("Naviguez vers un fichier PDF d'abord.");
      setAuthBadge("error", "Non disponible");
      return;
    }

    const raw = decodeURIComponent(url.split("/").pop().split("?")[0]);
    fileName.textContent = raw || "document.pdf";
    setAuthBadge("success", "Prêt");
    setStatus("PDF détecté — cliquez pour envoyer.");
    uploadBtn.disabled = false;

  } catch (e) {
    setStatus("Erreur : " + e.message);
    setAuthBadge("error", "Erreur");
  }
})();

// Upload
uploadBtn.addEventListener("click", async () => {
  setLoading(true);
  driveLinkRow.classList.add("hidden");
  setStatus("Connexion à Google Drive…");

  const response = await browser.runtime.sendMessage({ action: "uploadCurrentPdf" });

  setLoading(false);

  if (response.success) {
    setAuthBadge("success", "Envoyé ✓");
    setStatus(`"${response.fileName}" envoyé avec succès !`);
    if (response.link) {
      driveLink.href = response.link;
      driveLinkRow.classList.remove("hidden");
    }
  } else {
    setAuthBadge("error", "Erreur");
    setStatus(response.error || "Une erreur est survenue.");
    uploadBtn.disabled = false;
  }
});

// Déconnexion
disconnectBtn.addEventListener("click", async () => {
  if (!confirm("Déconnecter votre compte Google de cette extension ?")) return;
  await browser.runtime.sendMessage({ action: "disconnect" });
  setAuthBadge("loading", "Déconnecté");
  setStatus("Déconnecté. Cliquez sur Envoyer pour vous reconnecter.");
  driveLinkRow.classList.add("hidden");
});
