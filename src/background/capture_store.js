// capture_store.js : Persistance des captures en browser.storage.session

// Capture en cours (verrou anti-concurrent)
let captureInProgress = false;

export function isCapturing() { return captureInProgress; }
export function setCapturing(val) { captureInProgress = val; }

/**
 * Stocke une capture dans browser.storage.session pour survivre aux rechargements
 * de l'Event Page. TTL de 10 minutes pour éviter les fuites mémoire.
 *
 * @param {string|null} data     - Données de capture (base64 PDF ou texte MD).
 * @param {string|null} filename - Nom de fichier sans extension.
 * @param {string|null} format   - "pdf" ou "md".
 */
export async function saveCapture(data, filename, format) {
    await browser.storage.session.set({
        nwc_last_capture: { data, filename, format, ts: Date.now() }
    });
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
