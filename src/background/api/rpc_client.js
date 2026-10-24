// rpc_client.js : Emulateur RPC pour NotebookLM Personal
// Traduit fidèlement la logique de notebooklm-py (encoder.py + decoder.py)

/**
 * Moteur RPC pour construire et envoyer les requêtes formatées "batchexecute"
 * Utilisé lorsqu'aucune API officielle n'est disponible (Comptes personnels).
 */

/**
 * Erreur levée lorsque la structure d'une réponse RPC ne correspond plus
 * au schéma connu — signe probable d'un changement d'API Google.
 *
 * @class
 * @extends {Error}
 * @param {string} rpcId - Identifiant RPC concerné (ex: "izAoDd", "o4cbdc").
 */
export class RpcApiChangedError extends Error {
    constructor(rpcId) {
        super(`L'API NotebookLM a été modifiée (RPC: ${rpcId}). Mise à jour requise.`);
        this.name  = "RpcApiChangedError";
        this.rpcId = rpcId;
    }
}

/**
 * Erreur levée pour toute autre erreur RPC (réponse vide, HTTP 4xx, réseau, etc.).
 *
 * @class
 * @extends {Error}
 * @param {string} rpcId   - Identifiant RPC concerné.
 * @param {string} code    - Code d'erreur normalisé (ex: "EMPTY_RESPONSE", "HTTP_4XX").
 * @param {string} detail  - Description textuelle de l'erreur.
 */
export class RpcError extends Error {
    constructor(rpcId, code, detail) {
        super(`Erreur RPC ${rpcId} [${code}] : ${detail}`);
        this.name  = "RpcError";
        this.rpcId = rpcId;
        this.code  = code;
    }
}

// ============================================
// 1. ENCODEUR (encoder.py)
// ============================================

/**
 * Encode une requête RPC au format batchexecute de Google.
 * Produit la structure triple-imbriquée attendue par l'endpoint LabsTailwindUi.
 *
 * @param  {string} rpcId  - Identifiant de la procédure RPC (ex: "izAoDd").
 * @param  {Array}  params - Paramètres de la requête, sérialisés en JSON compact.
 * @returns {Array}         - Structure [[[rpcId, jsonParams, null, "generic"]]] prête à sérialiser.
 */
function encodeRpcRequest(rpcId, params) {
    // JSON-encode params sans espaces (format compact comme Chrome)
    const paramsJson = JSON.stringify(params);
    // Build inner request: [rpc_id, json_params, null, "generic"]
    const inner = [rpcId, paramsJson, null, "generic"];
    // Triple-nest the request  
    return [[inner]];
}

/**
 * Construit le corps HTTP encodé en URL pour une requête batchexecute.
 *
 * @param  {Array}       rpcRequest - Requête encodée par encodeRpcRequest().
 * @param  {string|null} csrfToken  - Jeton CSRF SNlM0e (null si absent).
 * @returns {string}                 - Body URL-encodé avec trailing &.
 */
function buildRequestBody(rpcRequest, csrfToken) {
    // JSON-encode the request (compact)
    const fReq = JSON.stringify(rpcRequest);
    // Construire le body encodé en URL  
    const parts = [`f.req=${encodeURIComponent(fReq)}`];
    if (csrfToken) {
        parts.push(`at=${encodeURIComponent(csrfToken)}`);
    }
    // Trailing & comme dans notebooklm-py
    return parts.join('&') + '&';
}

/**
 * Construit la query string de l'URL batchexecute.
 *
 * @param  {string} rpcId             - Identifiant de la procédure RPC.
 * @param  {string} [sourcePath='/']  - Chemin source (ex: '/notebook/{id}' pour les opérations sur un carnet).
 * @returns {string}                  - Query string prête à être concaténée à l'URL de l'endpoint.
 */
function buildQueryParams(rpcId, sourcePath = '/') {
    return new URLSearchParams({
        'rpcids': rpcId,
        'source-path': sourcePath,
        'hl': 'en',
        'rt': 'c'   // Chunked response mode
    }).toString();
}

// ============================================
// 2. DECODEUR (decoder.py)
// ============================================

/**
 * Supprime le préfixe anti-XSSI )]}' présent en tête des réponses Google.
 *
 * @warning NE PAS RÉÉCRIRE sans preuve de changement d'API NotebookLM.
 * Cette fonction parse le format propriétaire du batchexecute.
 * Toute modification introduit un risque de régression critique
 * sur tous les pipelines RPC.
 *
 * @param  {string} response - Réponse HTTP brute.
 * @returns {string}          - Réponse sans le préfixe anti-XSSI.
 */
function stripAntiXssi(response) {
    return response.replace(/^\)\]}'[\r\n]+/, '');
}

/**
 * Parse le format de réponse chunké (mode rt=c).
 * Format : lignes alternées de byte_count (entier) + json_payload.
 * C'est la traduction exacte de parse_chunked_response() de decoder.py.
 *
 * @warning NE PAS RÉÉCRIRE sans preuve de changement d'API NotebookLM.
 * Cette fonction parse le format propriétaire du batchexecute.
 * Toute modification introduit un risque de régression critique
 * sur tous les pipelines RPC.
 *
 * @param  {string} response - Réponse HTTP nettoyée (sans préfixe anti-XSSI).
 * @returns {Array}           - Tableau de chunks JSON parsés.
 */
function parseChunkedResponse(response) {
    if (!response || !response.trim()) return [];
    
    const chunks = [];
    const lines = response.trim().split('\n');
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Skip lignes vides
        if (!line) { i++; continue; }
        
        // Essayer de parser comme un byte count (entier)
        if (/^\d+$/.test(line)) {
            i++; // Avancer à la ligne suivante (le payload JSON)
            if (i < lines.length) {
                try {
                    const chunk = JSON.parse(lines[i]);
                    chunks.push(chunk);
                } catch (e) {
                    console.debug('[MC] rpc_client catch:', e?.message);
                    // Chunk malformé, on skip
                }
            }
            i++;
        } else {
            // Pas un byte count, essayer de parser comme JSON directement
            try {
                const chunk = JSON.parse(line);
                chunks.push(chunk);
            } catch (e) {
                console.debug('[MC] rpc_client catch:', e?.message);
                // Skip les lignes non-JSON
            }
            i++;
        }
    }
    return chunks;
}

/**
 * Extrait le résultat d'un RPC ID spécifique depuis les chunks décodés.
 * Traduction de extract_rpc_result() de decoder.py.
 *
 * @warning NE PAS RÉÉCRIRE sans preuve de changement d'API NotebookLM.
 * Cette fonction parse le format propriétaire du batchexecute.
 * Toute modification introduit un risque de régression critique
 * sur tous les pipelines RPC.
 *
 * @param  {Array}  chunks - Tableau de chunks produits par parseChunkedResponse().
 * @param  {string} rpcId  - Identifiant RPC dont on cherche la réponse.
 * @returns {any|null}      - Payload parsé du RPC, ou null si absent.
 * @throws  {Error}         - Si le chunk contient une réponse d'erreur RPC.
 */
function extractRpcResult(chunks, rpcId) {
    for (const chunk of chunks) {
        if (!Array.isArray(chunk)) continue;
        
        // Le chunk peut être [[item1, item2, ...]] ou [item]
        const items = (chunk.length > 0 && Array.isArray(chunk[0])) ? chunk : [chunk];
        
        for (const item of items) {
            if (!Array.isArray(item) || item.length < 3) continue;
            
            // Réponse d'erreur
            if (item[0] === "er" && item[1] === rpcId) {
                throw new Error(`RPC Error pour ${rpcId}: code ${item[2]}`);
            }
            
            // Réponse de succès : ["wrb.fr", "rpcId", "json_stringifié_du_résultat", ...]
            if (item[0] === "wrb.fr" && item[1] === rpcId) {
                const resultData = item[2];
                if (typeof resultData === 'string') {
                    try {
                        return JSON.parse(resultData);
                    } catch (e) {
                        return resultData;
                    }
                }
                return resultData;
            }
        }
    }
    return null;
}

/**
 * Valide et extrait le payload utile d'une réponse batchexecute.
 * Incorpore un filet de sécurité structurel : toute réponse inattendue
 * lève une RpcApiChangedError plutôt que de propager silencieusement un null.
 *
 * @param  {string} rawResponse  - Réponse HTTP brute du batchexecute.
 * @param  {string} rpcId        - Identifiant RPC attendu (ex: "izAoDd", "o4cbdc", "wXbhsf").
 * @returns {any}                 - Payload parsé, prêt à consommer.
 * @throws  {RpcApiChangedError}  - Si la structure de la réponse ne correspond pas au schéma connu.
 * @throws  {RpcError}            - Si la réponse est vide ou de type inattendu.
 */
export function validateAndExtractRpcResponse(rawResponse, rpcId) {
    // Étape 1 — La réponse est-elle valide à la source ?
    if (!rawResponse || typeof rawResponse !== "string") {
        throw new RpcError(rpcId, "EMPTY_RESPONSE", "La réponse batchexecute est vide ou de type inattendu.");
    }

    // Étape 2 — Décoder via le pipeline standardisé existant
    const chunks = parseChunkedResponse(stripAntiXssi(rawResponse));
    const result = extractRpcResult(chunks, rpcId);

    // Étape 3 — La structure contient-elle des données exploitables ?
    if (result === null || result === undefined) {
        // Sécurité (SEC-04) : Pas d'aperçu brut loggué pour éviter d'exposer des données privées
        console.warn(`[MC] Réponse RPC ${rpcId} — structure inattendue ou résultat vide.`);
        throw new RpcApiChangedError(rpcId);
    }

    return result;
}

// ============================================
// 3. TRANSPORT (envoi HTTP)
// ============================================

/**
 * Envoie une requête batchexecute vers l'endpoint LabsTailwindUi de NotebookLM.
 * Récupère les cookies et le jeton CSRF depuis le stockage local MV3,
 * encode la requête et valide la réponse via le pipeline standardisé.
 *
 * @param  {string} rpcId             - Identifiant de la procédure RPC (ex: "izAoDd").
 * @param  {Array}  jsonArgs           - Arguments JSON de la requête RPC.
 * @param  {number} [authuserIndex=0] - Index du compte Google actif (multi-compte).
 * @param  {string} [sourcePath='/']  - Chemin source contextuel (ex: `/notebook/${notebookId}`).
 * @returns {Promise<any>}             - Payload décodé de la réponse batchexecute.
 * @throws  {Error}                    - Si l'authentification est absente ou HTTP 4xx/5xx.
 * @throws  {RpcApiChangedError}       - Si la structure de la réponse est inattendue.
 */
export async function sendBatchExecute(rpcId, jsonArgs, authuserIndex = 0, sourcePath = '/') {
    const csrfKey = `nblm_csrf_${authuserIndex}`;
    // Sécurité (SEC-03) : Lecture en mémoire volatile (storage.session) avec fallback rétro-compatible
    let data = await browser.storage.session.get(['nblm_personal_cookie', csrfKey, 'nblm_csrf']);
    if (!data.nblm_personal_cookie || !(data[csrfKey] || data.nblm_csrf)) {
        const localData = await browser.storage.local.get(['nblm_personal_cookie', csrfKey, 'nblm_csrf']);
        data = { ...localData, ...data };
    }
    const csrfToken = data[csrfKey] || data.nblm_csrf;
    if (!data.nblm_personal_cookie || !csrfToken) {
        throw new Error("Authentification personnelle non finalisée.");
    }

    // Encoder la requête RPC
    const rpcRequest = encodeRpcRequest(rpcId, jsonArgs);
    const body = buildRequestBody(rpcRequest, csrfToken);
    const queryString = buildQueryParams(rpcId, sourcePath);
    const endpoint = `https://notebook.google.com/_/LabsTailwindUi/data/batchexecute?${queryString}&authuser=${authuserIndex}`;

    // MAJ-ROB-2 : Timeout de 30s sur l'appel RPC batchexecute
    const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            'Cookie': data.nblm_personal_cookie
        },
        body: body,
        signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            await Promise.all([
                browser.storage.session.remove(['nblm_personal_cookie', csrfKey, 'nblm_csrf']).catch(() => {}),
                browser.storage.local.remove(['nblm_personal_cookie', csrfKey, 'nblm_csrf']).catch(() => {})
            ]);
            throw new Error("Jeton RPC rejeté (401/403). Veuillez rafraîchir votre session NotebookLM.");
        }
        throw new Error(`Erreur réseau batchexecute: ${response.status}`);
    }

    const responseText = await response.text();
    
    // Valider la structure et extraire avec le pipeline standardisé
    return validateAndExtractRpcResponse(responseText, rpcId);
}

// ============================================
// 4. FACADES MÉTIER
// ============================================

/**
 * Liste tous les carnets NotebookLM du compte personnel actif.
 * Utilise le RPC wXbhsf de notebooklm-py.
 *
 * @param  {number} [authuserIndex=0]  - Index du compte Google actif.
 * @returns {Promise<Array<{id: string, title: string}>>} - Tableau de carnets {id, title}.
 * @throws  {RpcApiChangedError} - Si la structure RPC a changé.
 * @throws  {Error}              - Si l'authentification est absente.
 */
export async function listPersonalNotebooks(authuserIndex = 0) {
    const rpcId = "wXbhsf";
    
    // Paramètres exacts de notebooklm-py : [None, 1, None, [2]]
    const result = await sendBatchExecute(rpcId, [null, 1, null, [2]], authuserIndex);
    
    if (!result || !Array.isArray(result)) {
        console.warn('[MC] Réponse inattendue pour LIST_NOTEBOOKS:', result);
        return [];
    }
    
    // Structure de la réponse (from types.py Notebook.from_api_response) :
    // result = [ [notebook1, notebook2, ...], ... ]
    // Chaque notebook est un array où :
    //   - index 0 = titre (string)
    //   - index 2 = id (string)
    const rawNotebooks = Array.isArray(result[0]) && Array.isArray(result[0][0]) 
        ? result[0]    // [[nb1], [nb2], ...] 
        : result;      // [nb1, nb2, ...]
    
    const notebooks = [];
    for (const nb of rawNotebooks) {
        if (!Array.isArray(nb)) continue;
        
        const title = (nb.length > 0 && typeof nb[0] === 'string') ? nb[0].replace('thought\n', '').trim() : '';
        const id = (nb.length > 2 && typeof nb[2] === 'string') ? nb[2] : '';
        
        if (id && title) {
            notebooks.push({ id, title });
        }
    }
    
    if (notebooks.length === 0) {
       console.warn('[MC] Parsing carnets : aucun carnet valide extrait de la réponse.');
    }
    
    return notebooks;
}

/**
 * Crée un nouveau carnet NotebookLM vide pour le compte personnel actif.
 * Utilise le RPC CCqFvf de notebooklm-py.
 *
 * @param  {string} title             - Titre du carnet à créer.
 * @param  {number} [authuserIndex=0] - Index du compte Google actif.
 * @returns {Promise<string>}          - Identifiant unique du carnet créé.
 * @throws  {Error}                    - Si l'ID du carnet ne peut pas être extrait de la réponse.
 * @throws  {RpcApiChangedError}       - Si la structure RPC a changé.
 */
export async function createPersonalNotebook(title, authuserIndex = 0) {
    // RPC ID: CCqFvf (de notebooklm-py)
    const rpcId = "CCqFvf";
    const result = await sendBatchExecute(rpcId, [title, null], authuserIndex);
    
    // L'ID du nouveau carnet est typiquement à result[2] ou result[0][2]
    if (result && Array.isArray(result)) {
        const nbId = (typeof result[2] === 'string') ? result[2] : 
                     (Array.isArray(result[0]) && typeof result[0][2] === 'string') ? result[0][2] : null;
        if (nbId) return nbId;
    }
    
    throw new Error("Impossible d'extraire l'ID du carnet créé.");
}

/**
 * Ajoute une source texte (Markdown) directement dans un carnet NotebookLM.
 * Utilise le RPC izAoDd (ADD_SOURCE — Text) de notebooklm-py.
 * Pas besoin de protocole resumable : injection directe en une seule requête.
 *
 * @param  {string} notebookId          - ID du carnet cible.
 * @param  {string} title               - Titre de la source (affiché dans NotebookLM).
 * @param  {string} content             - Contenu textuel/Markdown à injecter.
 * @param  {number} [authuserIndex=0]   - Index du compte Google actif.
 * @returns {Promise<true>}              - Résout à true si l'ajout a réussi.
 * @throws  {RpcApiChangedError}         - Si la structure RPC a changé.
 * @throws  {Error}                      - Si l'authentification est absente ou HTTP 4xx/5xx.
 */
export async function addTextSource(notebookId, title, content, authuserIndex = 0) {
    
    const rpcId = "izAoDd";
    // Structure exacte de notebooklm-py : _sources.py::add_text()
    // [title, content] à la position [1] dans un tableau de 8 éléments
    const params = [
        [[null, [title, content], null, null, null, null, null, null]],
        notebookId,
        [2],
        null,
        null,
    ];
    
    await sendBatchExecute(rpcId, params, authuserIndex, `/notebook/${notebookId}`);
    return true;
}

/**
 * Ajoute une source URL directement dans un carnet NotebookLM.
 * NotebookLM scrape et indexe la page lui-même.
 * Utilise le RPC izAoDd (ADD_SOURCE — URL) de notebooklm-py.
 *
 * @param  {string} notebookId          - ID du carnet cible.
 * @param  {string} url                 - URL complète de la page web à importer.
 * @param  {number} [authuserIndex=0]   - Index du compte Google actif.
 * @returns {Promise<true>}              - Résout à true si l'ajout a réussi.
 * @throws  {RpcApiChangedError}         - Si la structure RPC a changé.
 * @throws  {Error}                      - Si l'authentification est absente ou HTTP 4xx/5xx.
 */
export async function addUrlSource(notebookId, url, authuserIndex = 0) {
    
    const rpcId = "izAoDd";
    // Structure exacte de notebooklm-py : _sources.py::_add_url_source()
    // L'URL va à la position [2] dans un tableau de 8 éléments
    const params = [
        [[null, null, [url], null, null, null, null, null]],
        notebookId,
        [2],
        null,
        null,
    ];
    
    await sendBatchExecute(rpcId, params, authuserIndex, `/notebook/${notebookId}`);
    return true;
}

/**
 * Ajoute une source Google Drive (Docs, Sheets, Slides) directement dans NotebookLM.
 * Utilise l'ID du fichier pur pour que NotebookLM crée un lien synchronisable natif.
 * Utilise le RPC izAoDd avec le payload direct 11 éléments (PAS le wrapper 8-slots).
 *
 * @param  {string} notebookId          - ID du carnet cible.
 * @param  {string} fileId              - ID du fichier Google Drive extrait de l'URL.
 * @param  {string} mimeType            - Type MIME (ex: application/vnd.google-apps.document).
 * @param  {string} title               - Titre du document.
 * @param  {number} [authuserIndex=0]   - Index du compte Google actif.
 * @returns {Promise<true>}              - Résout à true si l'ajout a réussi.
 * @throws  {RpcApiChangedError}         - Si la structure RPC a changé.
 * @throws  {Error}                      - Si l'authentification est absente ou HTTP 4xx/5xx.
 */
export async function addDriveSource(notebookId, fileId, mimeType, title, authuserIndex = 0) {
    const rpcId = "izAoDd";
    
    // Structure exacte de notebooklm-py : _sources.py::_add_drive_source()
    // Le bloc Drive est un tableau de 11 éléments (PAS enveloppé dans un wrapper 8-slots
    // comme Text/URL — c'est la différence clé).
    // [0] = [fileId, mimeType, 1, title]
    // [1-9] = null
    // [10] = 1
    const driveBlock = [
        [fileId, mimeType, 1, title],
        null, null, null, null, null, null, null, null, null, 1
    ];

    const params = [
        [driveBlock],
        notebookId,
        [2],
        [1, null, null, null, null, null, null, null, null, null, [1]]
    ];
    
    await sendBatchExecute(rpcId, params, authuserIndex, `/notebook/${notebookId}`);
    return true;
}

/**
 * Ajoute une source YouTube dans un carnet NotebookLM.
 * Contrairement à addUrlSource (URL générique), ce payload spécialisé
 * déclenche le pipeline YouTube natif de Google : extraction du transcript,
 * icône YouTube, lecteur vidéo intégré.
 *
 * Source : notebooklm-py _sources.py::_add_youtube_source()
 * L'URL va à la position [7] dans un tableau de 11 éléments (vs [2] sur 8 pour URL).
 *
 * @param  {string} notebookId          - ID du carnet cible.
 * @param  {string} url                 - URL YouTube complète (youtube.com/watch?v=... ou youtu.be/...).
 * @param  {number} [authuserIndex=0]   - Index du compte Google actif.
 * @returns {Promise<true>}              - Résout à true si l'ajout a réussi.
 * @throws  {RpcApiChangedError}         - Si la structure RPC a changé.
 * @throws  {Error}                      - Si l'authentification est absente ou HTTP 4xx/5xx.
 */
export async function addYouTubeSource(notebookId, url, authuserIndex = 0) {
    
    const rpcId = "izAoDd";
    // Structure exacte de notebooklm-py : _sources.py::_add_youtube_source()
    // L'URL va à la position [7] dans un tableau de 11 éléments
    const params = [
        [[null, null, null, null, null, null, null, [url], null, null, 1]],
        notebookId,
        [2],
        [1, null, null, null, null, null, null, null, null, null, [1]],
    ];
    
    await sendBatchExecute(rpcId, params, authuserIndex, `/notebook/${notebookId}`);
    return true;
}

/**
 * Table de correspondance extension -> MIME type pour fiabiliser le handshake Scotty
 * lorsque blob.type est vide ou générique (aligné sur notebooklm-py _resolve_upload_content_type).
 */
const EXTENSION_MIME_FALLBACKS = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.avif': 'image/avif',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.opus': 'audio/opus',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.epub': 'application/epub+zip'
};

/**
 * Résout le type MIME d'un Blob pour l'en-tête x-goog-upload-header-content-type de Scotty.
 * Privilégie le type MIME natif du Blob (nettoyé d'éventuels paramètres charset) s'il est spécifique,
 * sinon infère le type à partir de l'extension du nom de fichier.
 *
 * @param  {Blob}   blob     - Blob binaire à uploader.
 * @param  {string} filename - Nom du fichier avec extension.
 * @returns {string}         - Type MIME résolu (ex: "image/png", "application/pdf").
 */
function resolveUploadContentType(blob, filename) {
    if (blob && typeof blob.type === 'string') {
        const cleanMime = blob.type.split(';')[0].trim().toLowerCase();
        if (cleanMime && cleanMime !== 'application/octet-stream') {
            return cleanMime;
        }
    }
    if (typeof filename === 'string') {
        const dotIdx = filename.lastIndexOf('.');
        if (dotIdx !== -1) {
            const ext = filename.slice(dotIdx).toLowerCase();
            if (EXTENSION_MIME_FALLBACKS[ext]) {
                return EXTENSION_MIME_FALLBACKS[ext];
            }
        }
    }
    return 'application/octet-stream';
}

/**
 * Upload un Blob binaire vers un carnet NotebookLM via le protocole resumable 3 étapes
 * (register RPC → start upload session → upload + finalize).
 * C'est la primitive de bas niveau partagée par uploadPersonalSource et upload.js.
 *
 * @param  {string} notebookId          - ID du carnet cible.
 * @param  {Blob}   blob                - Blob binaire du fichier à uploader.
 * @param  {string} filename            - Nom du fichier avec extension (ex: "capture.pdf").
 * @param  {number} [authuserIndex=0]  - Index du compte Google actif.
 * @returns {Promise<true>}              - Résout à true si l'upload est terminé.
 * @throws  {Error}                     - Si l'authentification est absente, SOURCE_ID manquant,
 *                                        ou x-goog-upload-url absent de la réponse serveur.
 * @throws  {RpcApiChangedError}        - Si la structure RPC de l'étape d'enregistrement a changé.
 */
export async function uploadBlob(notebookId, blob, filename, authuserIndex = 0) {

    const csrfKey = `nblm_csrf_${authuserIndex}`;
    // Sécurité (SEC-03) : Lecture en mémoire volatile (storage.session) avec fallback rétro-compatible
    let data = await browser.storage.session.get(['nblm_personal_cookie', csrfKey, 'nblm_csrf']);
    if (!data.nblm_personal_cookie || !(data[csrfKey] || data.nblm_csrf)) {
        const localData = await browser.storage.local.get(['nblm_personal_cookie', csrfKey, 'nblm_csrf']);
        data = { ...localData, ...data };
    }
    const csrfToken = data[csrfKey] || data.nblm_csrf;
    if (!data.nblm_personal_cookie || !csrfToken) {
        throw new Error("Authentification personnelle non finalisée.");
    }

    // ╔════════════════════════════════════════════════════════╗
    // ║ ÉTAPE 1 : Enregistrer l'intention de source (RPC)     ║
    // ║ RPC ID: o4cbdc (ADD_SOURCE_FILE)                      ║
    // ║ Template imbriqué unifié Gemini 3.5 / 2026 (#1546)     ║
    // ╚════════════════════════════════════════════════════════╝
    const registerRpcId = "o4cbdc";
    const registerParams = [
        [[filename]],
        notebookId,
        [2, null, null, [1, null, null, null, null, null, null, null, null, null, [1]]]
    ];

    const registerResult = await sendBatchExecute(
        registerRpcId,
        registerParams,
        authuserIndex,
        `/notebook/${notebookId}`
    );

    // Extraire le SOURCE_ID de la réponse (structure imbriquée: [[[[id]]]] ou similaire)
    const sourceId = extractFirstString(registerResult);
    if (!sourceId) {
        throw new Error("Échec enregistrement source: impossible d'obtenir SOURCE_ID.");
    }

    // ╔════════════════════════════════════════════════════════╗
    // ║ ÉTAPE 2 : Démarrer le upload resumable                ║
    // ║ POST https://notebook.google.com/upload/_/            ║
    // ║ Headers: x-goog-upload-command: start                 ║
    // ╚════════════════════════════════════════════════════════╝
    const uploadStartUrl = `https://notebook.google.com/upload/_/?authuser=${authuserIndex}`;
    const contentType = resolveUploadContentType(blob, filename);

    const startBody = JSON.stringify({
        "PROJECT_ID": notebookId,
        "SOURCE_NAME": filename,
        "SOURCE_ID": sourceId
    });

    // MAJ-ROB-2 : Timeout de 30s sur l'initialisation de l'upload resumable
    const startResponse = await fetch(uploadStartUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Accept': '*/*',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'Cookie': data.nblm_personal_cookie,
            'Origin': 'https://notebook.google.com',
            'Referer': 'https://notebook.google.com/',
            'x-goog-authuser': String(authuserIndex),
            'x-goog-upload-command': 'start',
            'x-goog-upload-header-content-length': String(blob.size),
            'x-goog-upload-header-content-type': contentType,
            'x-goog-upload-protocol': 'resumable'
        },
        body: startBody,
        signal: AbortSignal.timeout(30_000)
    });

    if (!startResponse.ok) {
        throw new Error(`Échec démarrage upload: HTTP ${startResponse.status}`);
    }

    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
        throw new Error("Échec: pas de x-goog-upload-url dans la réponse du serveur.");
    }

    // ╔════════════════════════════════════════════════════════╗
    // ║ ÉTAPE 3 : Upload du fichier + finalize                ║
    // ║ POST vers l'upload URL obtenue à l'étape 2            ║
    // ║ Headers: x-goog-upload-command: upload, finalize      ║
    // ╚════════════════════════════════════════════════════════╝
    // MAJ-ROB-2 : Timeout de 180s sur l'upload binaire effectif
    const finalizeResponse = await fetch(uploadUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Accept': '*/*',
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            'Cookie': data.nblm_personal_cookie,
            'Origin': 'https://notebook.google.com',
            'Referer': 'https://notebook.google.com/',
            'x-goog-authuser': String(authuserIndex),
            'x-goog-upload-command': 'upload, finalize',
            'x-goog-upload-offset': '0'
        },
        body: blob,
        signal: AbortSignal.timeout(180_000)
    });

    if (!finalizeResponse.ok) {
        throw new Error(`Échec upload fichier: HTTP ${finalizeResponse.status}`);
    }

    return true;
}

/**
 * Upload un PDF encodé en Base64 Data URI vers un carnet NotebookLM.
 * Convertit le Data URI en Blob puis délègue à uploadBlob().
 *
 * @param  {string}      notebookId          - ID du carnet cible.
 * @param  {string}      pdfDataUri          - PDF encodé en Data URI Base64 (data:application/pdf;base64,...).
 * @param  {string|null} [customTitle=null]  - Titre personnalisé du fichier (sans extension). Fallback : date ISO.
 * @param  {number}      [authuserIndex=0]  - Index du compte Google actif.
 * @returns {Promise<true>}                  - Résout à true si l'upload est terminé.
 * @throws  {Error}                          - Si l'authentification est absente, SOURCE_ID manquant,
 *                                             ou x-goog-upload-url absent de la réponse serveur.
 * @throws  {RpcApiChangedError}             - Si la structure RPC de l'étape d'enregistrement a changé.
 */
export async function uploadPersonalSource(notebookId, pdfDataUri, customTitle = null, authuserIndex = 0) {

    // MAJ-ROB-4 : Conversion Data URI -> Blob native rapide en C++ sans allocation massive atob
    const resp = await fetch(pdfDataUri);
    const pdfBlob = await resp.blob();

    const filename = customTitle
        ? `${customTitle}.pdf`
        : `Capture_${new Date().toISOString().slice(0,10)}.pdf`;

    return uploadBlob(notebookId, pdfBlob, filename, authuserIndex);
}

/**
 * Extraie récursivement la première string non vide d'une structure imbriquée de tableaux.
 * Supporte à la fois les enveloppes directes [[[[id]]]] et préfixées [null, [[[[id]]]]].
 *
 * @param  {any} data - Structure imbriquée (string, Array, ou autre).
 * @returns {string|null} - Première string trouvée, ou null si aucune.
 */
function extractFirstString(data) {
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = extractFirstString(item);
            if (found) return found;
        }
    }
    return null;
}
