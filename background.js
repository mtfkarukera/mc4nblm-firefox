// ============================================================
// Magic Clipper for Google Drive — background.js
// Gère l'authentification OAuth2 et l'upload vers Google Drive
// ============================================================

const CLIENT_ID = "270035285728-p7ssnc4jqitu5d12j5kuouinirf7vfnf.apps.googleusercontent.com"; // ← À remplacer
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "Imports PDF";

// ----------------------------------------------------------
// AUTHENTIFICATION
// ----------------------------------------------------------

async function getAccessToken(interactive = true) {
  const redirectURL = browser.identity.getRedirectURL();
  const authURL =
    "https://accounts.google.com/o/oauth2/auth" +
    "?client_id=" + encodeURIComponent(CLIENT_ID) +
    "&redirect_uri=" + encodeURIComponent(redirectURL) +
    "&response_type=token" +
    "&scope=" + encodeURIComponent(SCOPES);

  try {
    const responseURL = await browser.identity.launchWebAuthFlow({
      url: authURL,
      interactive: interactive
    });
    const params = new URLSearchParams(new URL(responseURL).hash.slice(1));
    const token = params.get("access_token");
    const expiresIn = parseInt(params.get("expires_in") || "3600");
    const expiresAt = Date.now() + expiresIn * 1000;

    await browser.storage.local.set({ accessToken: token, expiresAt });
    return token;
  } catch (e) {
    if (!interactive) return null;
    throw e;
  }
}

async function getValidToken() {
  const { accessToken, expiresAt } = await browser.storage.local.get(["accessToken", "expiresAt"]);

  // Token encore valide (avec 2 min de marge)
  if (accessToken && expiresAt && Date.now() < expiresAt - 120000) {
    return accessToken;
  }

  // Tentative de renouvellement silencieux
  const silentToken = await getAccessToken(false);
  if (silentToken) return silentToken;

  // Renouvellement interactif si nécessaire
  return getAccessToken(true);
}

// ----------------------------------------------------------
// GESTION DU DOSSIER "Imports PDF"
// ----------------------------------------------------------

async function getOrCreateFolder(token) {
  const { folderId } = await browser.storage.local.get("folderId");
  if (folderId) return folderId;

  // Recherche du dossier existant
  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { files } = await searchRes.json();

  if (files && files.length > 0) {
    await browser.storage.local.set({ folderId: files[0].id });
    return files[0].id;
  }

  // Création du dossier
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder"
    })
  });
  const folder = await createRes.json();
  await browser.storage.local.set({ folderId: folder.id });
  return folder.id;
}

// ----------------------------------------------------------
// UPLOAD DU PDF
// ----------------------------------------------------------

async function uploadPdf(url, fileName, token, folderId) {
  // Téléchargement du fichier
  const fileResponse = await fetch(url);
  if (!fileResponse.ok) throw new Error(`Impossible de télécharger le fichier (HTTP ${fileResponse.status})`);
  const fileBlob = await fileResponse.blob();

  // Préparation de la requête multipart
  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
    parents: [folderId]
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", fileBlob);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json();
    throw new Error(err.error?.message || "Erreur lors de l'upload");
  }

  return uploadRes.json();
}

// ----------------------------------------------------------
// DÉCONNEXION
// ----------------------------------------------------------

async function disconnect() {
  const { accessToken } = await browser.storage.local.get("accessToken");
  if (accessToken) {
    // Révocation du token côté Google
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${accessToken}`).catch(() => {});
  }
  await browser.storage.local.remove(["accessToken", "expiresAt", "folderId"]);
}

// ----------------------------------------------------------
// GESTIONNAIRE DE MESSAGES (depuis popup.js)
// ----------------------------------------------------------

browser.runtime.onMessage.addListener(async (message) => {
  switch (message.action) {

    case "getRedirectURL":
      return { url: browser.identity.getRedirectURL() };

    case "uploadCurrentPdf": {
      try {
        // Récupère l'onglet actif
        const tabs = await browser.tabs.query({ currentWindow: true, active: true });
        const tab = tabs[0];
        const url = tab.url;
        const title = tab.title;

        // Vérifie que c'est bien un PDF
        // Blocage fichiers locaux
        if (url.startsWith("file://")) {
          return { success: false, error: "Les fichiers locaux ne sont pas pris en charge. Ouvrez le PDF depuis une URL en ligne." };
        }

        // Vérification PDF
        const isPdf = url.toLowerCase().includes(".pdf") ||
                      title.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          return { success: false, error: "L'onglet actif ne semble pas être un PDF." };
        }

        // Nom du fichier
        const rawName = decodeURIComponent(url.split("/").pop().split("?")[0]);
        const fileName = rawName.endsWith(".pdf") ? rawName : (rawName || "document.pdf") + ".pdf";

        // Auth + dossier + upload
        const token = await getValidToken();
        const folderId = await getOrCreateFolder(token);
        const result = await uploadPdf(url, fileName, token, folderId);

        return { success: true, fileName: result.name, link: result.webViewLink };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case "disconnect":
      await disconnect();
      return { success: true };

    default:
      return { success: false, error: "Action inconnue" };
  }
});
