// utils.js : Fonctions utilitaires partagées

let _customMessages = null;

/**
 * Charge les messages de traduction d'une locale depuis _locales/{locale}/messages.json.
 *
 * @param  {string} locale - Code locale (ex: "gcf", "fr", "en").
 * @returns {Promise<Object>} - Dictionnaire clé→{message} ou objet vide en cas d'échec.
 */
async function loadLocaleMessages(locale) {
  try {
    const url = browser.runtime.getURL(`_locales/${locale}/messages.json`);
    const res = await fetch(url);
    if (!res.ok) return {};
    return await res.json();
  } catch (e) {
    return {};
  }
}

/**
 * Définit la locale personnalisée active (actuellement seul "gcf" est supporté).
 * Toute autre valeur réinitialise le mode natif browser.i18n.
 *
 * @param {string} locale - Code locale à activer ("gcf") ou chaîne vide pour le mode natif.
 */
export async function setCustomLocale(locale) {
  if (locale === 'gcf') {
    _customMessages = await loadLocaleMessages('gcf');
  } else {
    _customMessages = null;
  }
}

/**
 * Résout une clé i18n en chaîne traduite. Utilise les messages personnalisés (gcf)
 * si actifs, sinon délègue à browser.i18n.getMessage().
 * Ne JAMAIS appeler browser.i18n.getMessage() directement dans popup.js — passer par t().
 *
 * @param  {string}              key            - Clé de traduction (ex: "statusConnected").
 * @param  {Object|Array|string} [substitutions={}] - Substitutions positionnelles.
 * @returns {string} - Chaîne traduite, ou la clé elle-même si introuvable.
 */
export function t(key, substitutions = {}) {
  let msg = "";

  if (_customMessages !== null && _customMessages[key]) {
    msg = _customMessages[key].message || "";
    // Gérer les substitutions manuellement pour le mode _customMessages
    if (substitutions) {
      const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
      if (_customMessages[key].placeholders) {
        let i = 0;
        for (const phName of Object.keys(_customMessages[key].placeholders)) {
          if (subs[i] !== undefined) {
            msg = msg.replace(`$${phName}$`, subs[i]);
          }
          i++;
        }
      } else {
        subs.forEach((val, i) => {
          msg = msg.replace(`$${i + 1}`, val);
        });
      }
    }
  } else {
    msg = browser.i18n.getMessage(key, substitutions);
  }

  if (!msg) {
    console.warn('[MC] Clé i18n manquante:', key);
    return key;
  }
  return msg;
}



/**
 * Détecte si l'URL correspond à une application Google Workspace supportée
 * ou à un fichier hébergé sur Google Drive, et extrait son ID et type MIME.
 *
 * Cas supportés :
 *   1. docs.google.com/document/d/ID   → Google Docs
 *   2. docs.google.com/spreadsheets/d/ID → Google Sheets
 *   3. docs.google.com/presentation/d/ID → Google Slides
 *   4. drive.google.com/file/d/ID/view  → Fichier Drive (PDF, image, etc.)
 *
 * @param  {string} url - URL de l'onglet actif.
 * @returns {{ fileId: string, mimeType: string, typeStr: string } | null}
 */
function parseDriveUrl(url) {
  try {
      const urlObj = new URL(url);

      // Cas 1-3 : Google Docs/Sheets/Slides (docs.google.com)
      if (urlObj.hostname.endsWith('docs.google.com')) {
          const match = urlObj.pathname.match(/\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9-_]+)/);
          if (match) {
              const typeStr = match[1];
              const fileId = match[2];
              let mimeType = '';
              if (typeStr === 'document') mimeType = 'application/vnd.google-apps.document';
              else if (typeStr === 'spreadsheets') mimeType = 'application/vnd.google-apps.spreadsheet';
              else if (typeStr === 'presentation') mimeType = 'application/vnd.google-apps.presentation';
              return { fileId, mimeType, typeStr };
          }
      }

      // Cas 4 : Fichier hébergé sur Drive (drive.google.com/file/d/ID/...)
      if (urlObj.hostname === 'drive.google.com') {
          const match = urlObj.pathname.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
          if (match) {
              return { fileId: match[1], mimeType: '', typeStr: 'file' };
          }
      }

      return null;
  } catch (e) {
      return null;
  }
}

/**
 * Retourne l'index du compte Google actif depuis browser.storage.local.
 * Remplace le pattern répété 6× dans background.js.
 * @returns {Promise<number>}
 */
export async function getActiveAuthuser() {
  const data = await browser.storage.local.get('nblm_active_authuser');
  return data.nblm_active_authuser !== undefined ? data.nblm_active_authuser : 0;
}

/**
 * Convertit une chaîne Base64 brute (sans préfixe data URI) en Uint8Array.
 * Remplace le pattern atob/charCodeAt répété 3× dans le projet.
 * @param  {string} base64 - Chaîne Base64 pure.
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Construit l'URL publique d'un carnet NotebookLM.
 * Remplace 7+ constructions inline.
 * @param  {string} notebookId
 * @returns {string}
 */
export function buildNotebookUrl(notebookId) {
  return `https://notebooklm.google.com/notebook/${notebookId}`;
}

// Export pour le contexte du Content Script (accès via window.ClipperUtils)
window.ClipperUtils = {
  parseDriveUrl,
};
