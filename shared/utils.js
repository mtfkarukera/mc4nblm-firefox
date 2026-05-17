export const FOLDER_NAME = "Imports Magic Clipper";

export const MIME_MAP = {
  "pdf": "application/pdf",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "png": "image/png",
  "gif": "image/gif",
  "webp": "image/webp",
  "svg": "image/svg+xml",
  "avif": "image/avif",
  "bmp": "image/bmp",
  "ico": "image/x-icon",
  "mp3": "audio/mpeg",
  "ogg": "audio/ogg",
  "wav": "audio/wav",
  "flac": "audio/flac",
  "opus": "audio/opus",
  "aac": "audio/aac",
  "mp4": "video/mp4",
  "webm": "video/webm",
  "ogv": "video/ogg",
  "txt": "text/plain",
  "xml": "text/xml",
  "json": "application/json",
  "csv": "text/csv",
  "md": "text/markdown",
  "js": "text/javascript",
  "css": "text/css"
};

let gcfMessages = null;
let useGcf = false;
let fallbackMessages = null;

/**
 * Initialisation asynchrone du moteur i18n.
 * Doit être appelée par popup.js et background.js avant d'utiliser t().
 */
export async function initI18n() {
  const { locale } = await browser.storage.local.get("locale");
  if (locale === "gcf") {
    useGcf = true;
    try {
      const res = await fetch(browser.runtime.getURL("_locales/gcf/messages.json"));
      gcfMessages = await res.json();
    } catch (e) {
      console.warn("Impossible de charger la locale gcf", e);
    }
  }

  // Chargement du fichier 'en' pour assurer un fallback manuel robuste.
  try {
    const res = await fetch(browser.runtime.getURL("_locales/en/messages.json"));
    fallbackMessages = await res.json();
  } catch (e) {
    console.warn("Impossible de charger le fallback anglais", e);
  }
}

/**
 * Fonction de traduction.
 */
export function t(key, substitutions) {
  let text = "";

  // 1. Priorité au créole guadeloupéen si sélectionné
  if (useGcf && gcfMessages && gcfMessages[key] && gcfMessages[key].message) {
    text = gcfMessages[key].message;
  } 
  // 2. Mécanisme natif (qui gère déjà le fallback sur default_locale)
  else {
    text = browser.i18n.getMessage(key);
  }

  // 3. Fallback manuel de sécurité sur la locale 'en' si natif échoue
  if (!text && fallbackMessages && fallbackMessages[key]) {
    text = fallbackMessages[key].message;
  }

  // Si toujours rien, on retourne la clé
  if (!text) {
    console.warn(`Clé i18n manquante : ${key}`);
    return key;
  }

  // Remplacement des placeholders (ex: $FILE_NAME$)
  if (substitutions && typeof substitutions === 'object') {
    for (const [k, v] of Object.entries(substitutions)) {
      text = text.replace(new RegExp(`\$${k}\$`, 'gi'), v);
    }
  }

  return text;
}

/**
 * Extrait et nettoie le nom de fichier.
 */
export function getFileNameFromUrl(url, title = null) {
  try {
    const raw = decodeURIComponent(url.split("/").pop().split("?")[0]);
    const extMatch = raw.split('.').pop().toLowerCase();
    
    if (MIME_MAP[extMatch]) {
      return raw;
    }
  } catch (e) {
    // Ignorer et passer au fallback
  }

  const clean = (title || "document")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .substring(0, 100);
    
  return clean;
}

/**
 * Renvoie l'emoji associé à un type MIME.
 */
export function getIconForMime(mimeType) {
  if (!mimeType) return "📄";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("text/") || mimeType === "application/json") return "📝";
  return "📄"; // pdf, par défaut
}
