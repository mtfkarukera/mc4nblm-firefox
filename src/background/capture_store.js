// capture_store.js : Persistance des captures en browser.storage.session

// Capture en cours (verrou anti-concurrent) avec auto-reset de sécurité (3 min)
let captureInProgress = false;
let captureStartTime = 0;
const CAPTURE_TIMEOUT_MS = 180_000;

export function isCapturing() {
    if (captureInProgress && (Date.now() - captureStartTime > CAPTURE_TIMEOUT_MS)) {
        console.warn('[MC] Verrou de capture auto-réinitialisé après expiration du délai de 3 min.');
        captureInProgress = false;
        captureStartTime = 0;
    }
    return captureInProgress;
}

export function setCapturing(val) {
    captureInProgress = Boolean(val);
    captureStartTime = captureInProgress ? Date.now() : 0;
}

/**
 * Stocke une capture dans browser.storage.session pour survivre aux rechargements
 * de l'Event Page. TTL de 10 minutes pour éviter les fuites mémoire.
 * Protégé contre les erreurs de dépassement de quota (QuotaExceededError).
 *
 * @param {string|null} data     - Données de capture (base64 PDF ou texte MD).
 * @param {string|null} filename - Nom de fichier sans extension.
 * @param {string|null} format   - "pdf" ou "md".
 */
export async function saveCapture(data, filename, format) {
    try {
        await browser.storage.session.set({
            nwc_last_capture: { data, filename, format, ts: Date.now() }
        });
    } catch (err) {
        console.warn('[MC] Impossible de sauvegarder la capture en session (quota possible) :', err.message);
    }
}

/**
 * Récupère la dernière capture depuis browser.storage.session.
 * Retourne null si absente ou expirée (> 10 minutes).
 *
 * @returns {Promise<{data: string, filename: string, format: string}|null>}
 */
export async function getCapture() {
    const { nwc_last_capture } = await browser.storage.session.get('nwc_last_capture');
    if (!nwc_last_capture) return null;
    if (Date.now() - nwc_last_capture.ts > 10 * 60 * 1000) {
        await browser.storage.session.remove('nwc_last_capture');
        return null;
    }
    return nwc_last_capture;
}

/**
 * Efface la capture stockée en session.
 */
export async function clearCapture() {
    await browser.storage.session.remove('nwc_last_capture');
}
