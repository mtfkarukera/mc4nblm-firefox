// upload.js : Upload générique de fichiers binaires vers NotebookLM
import { uploadBlob } from './api/rpc_client.js';

/**
 * Upload générique d'un Blob (fichier binaire) vers NotebookLM.
 * Délègue à uploadBlob() de rpc_client.js qui implémente le protocole resumable 3 étapes :
 * enregistrement RPC (o4cbdc) → initialisation de session upload → upload + finalisation.
 * Utilisé pour les formats Screenshot (PNG) et Import Direct (tous types binaires).
 *
 * @param  {string} notebookId        - ID du carnet cible.
 * @param  {Blob}   blob              - Blob binaire du fichier à uploader.
 * @param  {string} filename          - Nom du fichier avec extension (ex: "capture.png").
 * @param  {number} [authuserIndex=0] - Index du compte Google actif.
 * @returns {Promise<true>}           - Résout à true si l'upload est terminé avec succès.
 * @throws  {Error}                   - Si l'authentification est absente, SOURCE_ID manquant,
 *                                      x-goog-upload-url absent, ou HTTP 4xx/5xx.
 */
export async function uploadFileBlob(notebookId, blob, filename, authuserIndex = 0) {
    return uploadBlob(notebookId, blob, filename, authuserIndex);
}

/**
 * Extraie récursivement la première string d'une structure imbriquée de tableaux.
 * Utilisé pour parser le SOURCE_ID depuis les réponses RPC [[[[id]]]] ou [[[id]]].
 *
 * @param  {any} data - Structure imbriquée (string, Array, ou autre).
 * @returns {string|null} - Première string trouvée, ou null si aucune.
 */
export function extractFirstStringFromResult(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data) && data.length > 0) {
        return extractFirstStringFromResult(data[0]);
    }
    return null;
}
