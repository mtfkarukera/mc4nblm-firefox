// background.js : Event Page MV3, Routeur central Asynchrone
import { getPersonalAuthCookies, fetchCSRFToken } from './api/auth_personal.js';
import { createPersonalNotebook, uploadPersonalSource, addTextSource, addUrlSource, addYouTubeSource, addDriveSource, RpcApiChangedError } from './api/rpc_client.js';
import { INJECTION_PIPELINE, INJECTION_SENTINELS, InjectionError, isScriptInjected, injectScriptsSequentially } from './injection.js';
import { BINARY_MIME_PREFIXES, DIRECT_IMPORT_TYPES, guessMimeFromTitle, detectFileType } from './detection.js';
import { isCapturing, setCapturing, saveCapture, getCapture, clearCapture } from './capture_store.js';
import { uploadFileBlob, extractFirstStringFromResult } from './upload.js';
import { getActiveAuthuser, base64ToUint8Array, buildNotebookUrl } from '../shared/utils.js';

/**
 * Construit une réponse d'erreur normalisée pour sendResponse().
 * @param {string} i18nKey  - Clé i18n du message d'erreur.
 * @param {string} [code]   - Code machine optionnel.
 * @param {string} [detail] - Détail technique (logé mais jamais exposé).
 * @returns {{ status: 'error', i18nKey: string, code?: string }}
 */
function errorResponse(i18nKey, code, detail) {
    if (detail) console.error('[MC] Error:', sanitizeErrorMessage(String(detail)));
    return { status: 'error', i18nKey, ...(code ? { code } : {}) };
}

/**
 * Taille Max de PDF imposée par Google : 200 MB
 * Un octet Base64 pèse plus lourd (ratio ~1.37), cette limite mathématique garantit le quota réel.
 */
const MAX_BASE64_SIZE_BYTES = 200 * 1024 * 1024 * 1.37;

/**
 * Modèles RegEx pour détecter et masquer les données sensibles
 * (cookies de session Google et jeton CSRF) dans les logs d'erreurs.
 */
const SENSITIVE_PATTERNS = [
    /SID=[^;]+/gi,
    /HSID=[^;]+/gi,
    /SSID=[^;]+/gi,
    /SAPISID=[^;]+/gi,
    /__Secure-1PSID=[^;]+/gi,
    /__Secure-3PSID=[^;]+/gi,
    /SNlM0e[^"]+/gi,
    /at=[^&]+/gi        // Token CSRF encodé dans les payloads
];

/**
 * Purge un message d'erreur de toute donnée d'authentification sensible.
 * Applique une liste de patterns RegEx sur le message brut et remplace
 * les occurrences par "[REDACTED]" avant tout logging.
 *
 * @param  {string|any} message - Le message d'erreur brut (converti en string si nécessaire).
 * @returns {string}             - Le message d'erreur assaini, sans token ni cookie.
 */
function sanitizeErrorMessage(message) {
    if (typeof message !== "string") {
        message = String(message);
    }

    return SENSITIVE_PATTERNS.reduce(
        (msg, pattern) => msg.replace(pattern, "[REDACTED]"),
        message
    );
}

// ═══ Menu Contextuel : Capture de sélection ═══
browser.runtime.onInstalled.addListener(async () => {
    browser.storage.local.remove('nwc_pending_selection');

    try {
        await browser.contextMenus.removeAll();
        browser.contextMenus.create({
            id: "nwc-clip-selection",
            title: browser.i18n.getMessage("notifSelectionTitle"),
            contexts: ["selection"]
        });
    } catch (e) {
        console.warn('[MC] contextMenus non disponible:', e.message);
    }
});

if (browser.contextMenus?.onClicked) {
    browser.contextMenus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId === "nwc-clip-selection" && info.selectionText) {
            let selectionHtml = null;
            try {
                const response = await browser.tabs.sendMessage(tab.id, {
                    action: "GET_SELECTION_HTML"
                });
                if (response?.html) {
                    selectionHtml = response.html;
                }
            } catch (e) {
                console.warn('[MC] Content script inaccessible pour GET_SELECTION_HTML — fallback texte brut.');
            }

            await browser.storage.local.set({
                nwc_pending_selection: {
                    text: info.selectionText,
                    html: selectionHtml,
                    pageUrl: info.pageUrl || tab.url,
                    pageTitle: tab.title,
                    timestamp: Date.now()
                }
            });

            try {
                await browser.action.openPopup();
            } catch (e) {
                console.warn('[MC] openPopup() indisponible — notification de repli émise:', e.message);
                browser.notifications.create("nwc-selection-ready", {
                    type: "basic",
                    iconUrl: browser.runtime.getURL("icons/icon.svg"),
                    title: browser.i18n.getMessage("notifSelectionCaptured"),
                    message: browser.i18n.getMessage("notifSelectionMsg")
                });
            }
        }
    });
}

/**
 * Routeur central des messages inter-scripts (popup → background → content).
 * Tous les handlers retournent `true` pour signaler une réponse asynchrone.
 *
 * Handlers disponibles :
 * - GET_AUTH_STATUS     : vérifie la présence de cookies NotebookLM (connexion personnelle).
 * - GET_ACCOUNTS        : liste les comptes Google détectés + index actif.
 * - SET_ACCOUNT         : définit le compte actif (index authuser).
 * - GET_NOTEBOOKS       : liste les carnets du compte actif via RPC.
 * - CREATE_NOTEBOOK     : crée un nouveau carnet vide et retourne son ID.
 * - FETCH_IMAGE         : proxy CORS — télécharge une image et retourne un data URI Base64.
 * - DOWNLOAD_CAPTURE    : génère un Blob local depuis lastCaptureData et lance le téléchargement.
 * - DETECT_FILE_TYPE    : HEAD request pour détecter si une URL pointe vers un fichier importable.
 * - DETECT_MIME         : HEAD request minimale — retourne {isBinary, mime} pour la popup.
 * - START_CAPTURE       : point d'entrée principal — déclenche l'un des 7 pipelines d'import.
 *
 * @param  {Object}   message    - Message reçu (doit contenir message.action).
 * @param  {Object}   sender     - Metadata de l'expéditeur (tab, frameId, etc.).
 * @param  {Function} sendResponse - Callback Firefox pour la réponse synchrone.
 * @returns {true}               - Indique systématiquement une réponse asynchrone.
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Sécurité : valider que le message provient bien de cette extension
    if (sender.id && sender.id !== browser.runtime.id) return false;

    if (message.action === "GET_AUTH_STATUS") {
        browser.cookies.getAll({ url: "https://notebook.google.com/" }).then(cookies => {
            if (cookies && cookies.length > 0) {
                sendResponse({ status: "CONNECTE", type: "PERSONAL" });
            } else {
                sendResponse({ status: "DECONNECTE", type: null });
            }
        }).catch(() => {
            sendResponse({ status: "DECONNECTE", type: null });
        });
        return true;
    }

    if (message.action === "GET_ACCOUNTS") {
        (async () => {
            try {
                const { getPersonalAuthCookies, detectGoogleAccounts } = await import('./api/auth_personal.js');
                const cookieString = await getPersonalAuthCookies();
                const accounts = await detectGoogleAccounts(cookieString);

                const activeIndex = await getActiveAuthuser();

                sendResponse({ accounts, activeIndex });
            } catch (err) {
                console.error('[MC] GET_ACCOUNTS:', sanitizeErrorMessage(err.message));
                // Sanitiser err.message avant de l'exposer au popup (peut contenir des tokens)
                sendResponse({ error: sanitizeErrorMessage(err.message), accounts: [] });
            }
        })();
        return true;
    }

    if (message.action === "SET_ACCOUNT") {
        browser.storage.local.set({ nblm_active_authuser: message.index }).then(() => {
            sendResponse({ ok: true });
        });
        return true;
    }

    if (message.action === "GET_NOTEBOOKS") {
        (async () => {
            try {
                const { getPersonalAuthCookies, fetchCSRFToken } = await import('./api/auth_personal.js');
                const cookieString = await getPersonalAuthCookies();

                const activeIndex = await getActiveAuthuser();

                await fetchCSRFToken(cookieString, activeIndex);
                const { listPersonalNotebooks } = await import('./api/rpc_client.js');
                const notebooks = await listPersonalNotebooks(activeIndex);

                sendResponse({ notebooks });
            } catch (err) {
                sendResponse(errorResponse("errGetNotebooks", "UNKNOWN", err.message));
            }
        })();
        return true;
    }

    // Création de carnet à la volée
    if (message.action === "CREATE_NOTEBOOK") {
        (async () => {
            try {
                const cookieString = await getPersonalAuthCookies();
                const activeIndex = await getActiveAuthuser();

                await fetchCSRFToken(cookieString, activeIndex);

                const notebookId = await createPersonalNotebook(message.title, activeIndex);
                sendResponse({ notebookId });
            } catch (err) {
                sendResponse(errorResponse("errCreateNotebook", "UNKNOWN", err.message));
            }
        })();
        return true;
    }

    // Proxy CORS pour télécharger les images sans bloquer jsPDF
    if (message.action === "FETCH_IMAGE") {
        (async () => {
            const { url } = message;
            // Sécurité : rejeter les schémas non-HTTP pour prévenir les abus SSRF
            if (!url || !(/^https?:\/\//.test(url))) {
                sendResponse({ error: 'URL invalide ou schéma non supporté.' });
                return;
            }
            try {
                // Sécurité (SEC-1) : credentials omit pour ne pas envoyer les cookies vers des serveurs tiers
                const resp = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10_000) });
                if (!resp.ok) { sendResponse({ error: `HTTP ${resp.status}` }); return; }
                const blob = await resp.blob();
                const reader = new FileReader();
                reader.onloadend = () => sendResponse({ data: reader.result });
                reader.onerror = () => sendResponse({ error: 'FileReader failed' });
                reader.readAsDataURL(blob);
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }

    // Téléchargement local de la dernière capture (PDF ou Markdown)
    if (message.action === "DOWNLOAD_CAPTURE") {
        (async () => {
            const capture = await getCapture();
            if (!capture) {
                sendResponse({ error: browser.i18n.getMessage('errNoCapture') });
                return;
            }
            try {
                let blobUrl;
                let ext;

                if (capture.format === "md") {
                    const blob = new Blob([capture.data], { type: 'text/markdown; charset=utf-8' });
                    blobUrl = URL.createObjectURL(blob);
                    ext = '.md';
                } else {
                    const base64 = capture.data.split(',')[1];
                    const byteArr = await base64ToUint8Array(base64);
                    const blob = new Blob([byteArr], { type: 'application/pdf' });
                    blobUrl = URL.createObjectURL(blob);
                    ext = '.pdf';
                }

                const platformInfo = await browser.runtime.getPlatformInfo();
                const isMobile = platformInfo.os === 'android';

                const downloadId = await browser.downloads.download({
                    url: blobUrl,
                    filename: (capture.filename || 'capture') + ext,
                    saveAs: !isMobile
                });

                // Révoquer l'URL dès que le téléchargement est terminé (ou échoue)
                const onChanged = (delta) => {
                    if (delta.id !== downloadId) return;
                    if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
                        URL.revokeObjectURL(blobUrl);
                        browser.downloads.onChanged.removeListener(onChanged);
                    }
                };
                browser.downloads.onChanged.addListener(onChanged);
                // ROB-3 : pas de setTimeout — le listener onChanged gère le nettoyage

                sendResponse({ ok: true });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }

    // Détection du type de fichier pour l'Import Direct
    if (message.action === "DETECT_FILE_TYPE") {
        detectFileType(message.url).then(result => {
            sendResponse(result);
        }).catch(() => {
            sendResponse({ directImport: false });
        });
        return true;
    }

    if (message.action === "DETECT_MIME") {
        (async () => {
            const { url } = message;
            try {
                const resp = await fetch(url, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(5000)
                });
                if (!resp.ok) {
                    sendResponse({ isBinary: false, mime: '' });
                    return;
                }
                const mime = resp.headers.get('content-type') ?? '';
                const isBinary = BINARY_MIME_PREFIXES.some(p => mime.startsWith(p));
                sendResponse({ isBinary, mime });
            } catch (e) {
                console.warn('[MC] DETECT_MIME — requête échouée:', e?.message);
                sendResponse({ isBinary: false, mime: '' });
            }
        })();
        return true;
    }

    if (message.action === "START_CAPTURE") {
        // Verrou anti-capture concurrente
        if (isCapturing()) {
            sendResponse({ status: "error", code: "CAPTURE_IN_PROGRESS", i18nKey: "errCaptureInProgress" });
            return true;
        }
        // Import de sélection : pipeline simplifié (texte → addTextSource)
        if (message.format === 'selection' && message.selectionData) {
            setCapturing(true);
            (async () => {
                try {
                    const sel = message.selectionData;
                    const cookieString = await getPersonalAuthCookies();
                    const activeIndex = await getActiveAuthuser();
                    await fetchCSRFToken(cookieString, activeIndex);

                    let finalNotebookId = message.notebookId;
                    if (finalNotebookId === "CREATE_NEW") {
                        notifyUI("STATUS_UPDATE", { i18nKey: "statusCreatingNb", status: "info" });
                        const title = browser.i18n.getMessage('autoNotebookTitle').replace('{date}', new Date().toLocaleDateString());
                        finalNotebookId = await createPersonalNotebook(title, activeIndex);
                    }
                    if (!finalNotebookId) throw new Error("Échec de la récupération de l'ID du carnet.");

                    notifyUI("STATUS_UPDATE", { i18nKey: "statusUploadSelection", status: "info" });

                    const cleanTitle = (sel.pageTitle || browser.i18n.getMessage('selectionFallbackTitle'))
                        .replace(/[<>:"/\\|?*]/g, '').trim().substring(0, 80);
                    const sourceTitle = `📋 ${cleanTitle}`;

                    const content = [
                        `${browser.i18n.getMessage('labelSource')} ${sel.pageUrl}`,
                        `${browser.i18n.getMessage('labelTitle')} ${sel.pageTitle}`,
                        `${browser.i18n.getMessage('labelCaptureDate')} ${new Date().toLocaleString()}`,
                        '',
                        '---',
                        '',
                        sel.text
                    ].join('\n');

                    await addTextSource(finalNotebookId, sourceTitle, content, activeIndex);

                    // Persister la capture en session pour téléchargement local
                    const mdContent = [
                      `${browser.i18n.getMessage('labelSource')} ${sel.pageUrl}`,
                      `${browser.i18n.getMessage('labelTitle')} ${sel.pageTitle}`,
                      `${browser.i18n.getMessage('labelCaptureDate')} ${new Date().toLocaleString()}`,
                      '',
                      '---',
                      '',
                      sel.text
                    ].join('\n');

                    await saveCapture(mdContent, cleanTitle, 'md');

                    const notebookUrl = buildNotebookUrl(finalNotebookId);
                    notifyUI("STATUS_UPDATE", {
                        i18nKey: "statusImportedSelection",
                        status: "success",
                        linkUrl: notebookUrl,
                        showDownload: true
                    });

                    browser.notifications.create({
                        type: "basic",
                        iconUrl: browser.runtime.getURL("icons/icon.svg"),
                        title: browser.i18n.getMessage("extensionName"),
                        message: browser.i18n.getMessage("notifSuccessMsg").replace("{title}", cleanTitle).replace("{format}", browser.i18n.getMessage('selectionFallbackTitle'))
                    });
                } catch (err) {
                    console.error('[MC] Pipeline SELECTION:', sanitizeErrorMessage(err.message));
                    notifyUI("STATUS_UPDATE", {
                        status: "error",
                        i18nKey: "errSelectionFailed",
                        code: "UNKNOWN"
                    });
                } finally {
                    setCapturing(false);
                }
            })();
        } else {
            // Formats classiques : PDF, MD, URL, Screenshot, Direct
            setCapturing(true);
            (async () => {
                const format = message.format || "pdf";
                const scripts = INJECTION_PIPELINE[format] ?? [];

                if (scripts.length > 0) {
                    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                    if (tabs.length > 0) {
                        try {
                            await injectScriptsSequentially(tabs[0].id, scripts);
                        } catch (err) {
                            if (err instanceof InjectionError) {
                                setCapturing(false);
                                sendResponse({
                                    status: "error",
                                    code: "INJECTION_FAILED",
                                    i18nKey: "errInjectionFailed"
                                });
                                return;
                            }
                            setCapturing(false);
                            throw err;
                        }
                    }
                }

                executeCaptureAndUploadWorkflow(message.notebookId, format, message.intentNote)
                    .catch(err => {
                        console.error('[MC] Pipeline WORKFLOW:', sanitizeErrorMessage(err.message));
                        notifyUI("STATUS_UPDATE", {
                            status: "error",
                            i18nKey: "errWorkflowFailed",
                            code: "UNKNOWN"
                        });
                    })
                    .finally(() => {
                        setCapturing(false);
                    });
            })().catch(err => {
                setCapturing(false);
                console.error('[MC] START_CAPTURE IIFE:', sanitizeErrorMessage(err.message));
                notifyUI("STATUS_UPDATE", { status: "error", i18nKey: "errWorkflowFailed", code: "UNKNOWN" });
            });
        }
    }

    return true;
});

/**
 * Émet un message vers la popup (si elle est encore ouverte) pour mettre à jour l'UI.
 * Les erreurs de livraison sont silencieusement ignorées : la popup peut être fermée.
 *
 * @param  {string} action  - Type du message (ex: "STATUS_UPDATE").
 * @param  {Object} payload - Corps du message (i18nKey, status, linkUrl, etc.).
 * @returns {void}
 */
function notifyUI(action, payload) {
    browser.runtime.sendMessage({ type: action, ...payload }).catch(() => {
        // La popup est sûrement fermée, on ignore l'erreur
    });
}

/**
 * Listener de connexion Port : maintient l'Event Page actif pendant les captures longues.
 * La popup ouvre un Port nommé "popup-keepalive" avant chaque START_CAPTURE et
 * le ferme dès que la réponse est reçue ou que l'opération échoue.
 */
browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'popup-keepalive') return;
    // Pas besoin d'écouter de messages — la connexion ouverte suffit à maintenir le SW actif
    port.onDisconnect.addListener(() => {
        // La popup a fermé le port (capture terminée, erreur, ou popup fermée)
        // Aucune action nécessaire ici
    });
});


/**
 * Prépare le contexte commun à tous les handlers de capture.
 * Interroge l'onglet actif, nettoie le titre et crée le carnet à la volée si besoin.
 *
 * @param {string}      targetNotebookId - ID du carnet cible, ou "CREATE_NEW".
 * @param {string|null} intentNote       - Annotation d'intention optionnelle.
 * @param {number}      activeIndex      - Index du compte Google actif.
 * @param {string}      cookieString     - Cookie de session personnel.
 * @returns {Promise<Object>} ctx - Contexte prêt à consommer par les handlers.
 */
async function buildCaptureContext(targetNotebookId, intentNote, activeIndex, cookieString) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) throw new Error("Aucun onglet actif trouvé.");
    const activeTab = tabs[0];
    const pageTitle = activeTab.title || "Capture";
    const pageUrl = activeTab.url;
    const cleanTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().substring(0, 100);
    let finalNotebookId = targetNotebookId;
    if (finalNotebookId === "CREATE_NEW") {
        notifyUI("STATUS_UPDATE", { i18nKey: "statusCreatingNb", status: "info" });
        const title = browser.i18n.getMessage('autoNotebookTitle').replace('{date}', new Date().toLocaleDateString());
        finalNotebookId = await createPersonalNotebook(title, activeIndex);
    }
    if (!finalNotebookId) throw new Error("Échec de la récupération de l'ID du carnet.");
    return { cookieString, activeIndex, activeTab, pageTitle, pageUrl, cleanTitle, finalNotebookId, intentNote };
}

/**
 * Émet la notification système de succès commune à tous les handlers.
 * @param {string} cleanTitle   - Titre de la capture (affiché dans la notif).
 * @param {string} format       - Format d'import (clé dans formatLabels).
 */
function notifySuccess(cleanTitle, format) {
    const formatLabels = {
        pdf: "PDF",
        md: "Markdown",
        url: "URL",
        screenshot: "Screenshot",
        direct: browser.i18n.getMessage('formatLabelDirect')
    };
    browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon.svg"),
        title: browser.i18n.getMessage("extensionName"),
        message: browser.i18n.getMessage("notifSuccessMsg")
            .replace("{title}", cleanTitle)
            .replace("{format}", formatLabels[format] || format)
    });
}

// ─── Handlers individuels ────────────────────────────────────────────────────

/**
 * Handler format "screenshot" : capture PNG de l'onglet actif et upload.
 * @param {Object} ctx - Contexte buildCaptureContext().
 */
async function handleScreenshot(ctx) {
    const { finalNotebookId, cleanTitle, activeIndex } = ctx;
    notifyUI("STATUS_UPDATE", { i18nKey: "statusScreenshot", status: "info" });

    const dataUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });
    const base64 = dataUrl.split(',')[1];
    const bytes = await base64ToUint8Array(base64);
    const pngBlob = new Blob([bytes], { type: 'image/png' });
    const screenshotFilename = `${cleanTitle}.png`;

    notifyUI("STATUS_UPDATE", { i18nKey: "statusUploadScreenshot", status: "info" });
    await uploadFileBlob(finalNotebookId, pngBlob, screenshotFilename, activeIndex);

    const notebookUrl = buildNotebookUrl(finalNotebookId);
    notifyUI("STATUS_UPDATE", {
        i18nKey: "statusImportedScreenshot",
        status: "success",
        linkUrl: notebookUrl,
        showDownload: false
    });
    notifySuccess(cleanTitle, "screenshot");
}

/**
 * Handler format "direct" : téléchargement du fichier depuis l'URL courante et upload.
 * @param {Object} ctx - Contexte buildCaptureContext().
 */
async function handleDirect(ctx) {
    const { finalNotebookId, cleanTitle, pageUrl, activeIndex } = ctx;
    notifyUI("STATUS_UPDATE", { i18nKey: "statusDownloadFile", status: "info" });

    // Vérification préalable de la taille via Content-Length (avant téléchargement)
    let headResponse;
    try {
        headResponse = await fetch(pageUrl, {
            method: 'HEAD',
            credentials: 'include',
            signal: AbortSignal.timeout(10_000)
        });
    } catch {
        // HEAD non supporté — on continue sans vérification préalable
    }
    if (headResponse?.ok) {
        const contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
        if (contentLength > 200 * 1024 * 1024) {
            throw new Error("Upload refusé : Le fichier dépasse la limite de 200 MB.");
        }
    }

    let fileResponse;
    try {
        fileResponse = await fetch(pageUrl, {
            credentials: 'include',
            signal: AbortSignal.timeout(120_000)
        });
    } catch {
        throw new Error("Impossible de récupérer le fichier. Le serveur bloque le téléchargement.");
    }
    if (!fileResponse.ok) throw new Error(`Échec téléchargement: HTTP ${fileResponse.status}`);

    const fileBlob = await fileResponse.blob();
    const mimeType = fileBlob.type || 'application/octet-stream';
    const typeInfo = DIRECT_IMPORT_TYPES[mimeType];
    const ext = typeInfo ? typeInfo.ext : '';
    const directFilename = `${cleanTitle}${ext}`;

    if (fileBlob.size > 200 * 1024 * 1024) {
        throw new Error("Upload refusé : Le fichier dépasse la limite de 200 MB.");
    }

    notifyUI("STATUS_UPDATE", { i18nKey: "statusUploadFile", i18nSubs: { ext: ext.replace('.', '').toUpperCase() || 'fichier' }, status: "info" });
    await uploadFileBlob(finalNotebookId, fileBlob, directFilename, activeIndex);

    const notebookUrl = buildNotebookUrl(finalNotebookId);
    notifyUI("STATUS_UPDATE", {
        i18nKey: "statusImportedFile",
        status: "success",
        linkUrl: notebookUrl,
        showDownload: false
    });
    notifySuccess(cleanTitle, "direct");
}

/**
 * Handler format "drive" : ajout d'un fichier Google Drive / Workspace.
 * @param {Object} ctx - Contexte buildCaptureContext().
 */
async function handleDrive(ctx) {
    const { finalNotebookId, cleanTitle, pageUrl, pageTitle, activeIndex } = ctx;
    notifyUI("STATUS_UPDATE", { i18nKey: "statusDrive", status: "info" });

    let fileId, mimeType = '';

    const workspaceMatch = pageUrl.match(/\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9-_]+)/);
    if (workspaceMatch) {
        fileId = workspaceMatch[2];
        const typeStr = workspaceMatch[1];
        if (typeStr === 'document')      mimeType = 'application/vnd.google-apps.document';
        else if (typeStr === 'spreadsheets') mimeType = 'application/vnd.google-apps.spreadsheet';
        else if (typeStr === 'presentation') mimeType = 'application/vnd.google-apps.presentation';
    }

    if (!fileId) {
        const driveMatch = pageUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/);
        if (driveMatch) {
            fileId = driveMatch[1];
            mimeType = guessMimeFromTitle(pageTitle);
        }
    }

    if (!fileId) throw new Error("URL Google Drive non reconnue ou invalide.");

    const driveTitle = pageTitle.replace(/ - Google (Docs|Sheets|Slides|Drive)$/i, '').trim();
    await addDriveSource(finalNotebookId, fileId, mimeType, driveTitle, activeIndex);

    const notebookUrl = buildNotebookUrl(finalNotebookId);
    notifyUI("STATUS_UPDATE", {
        i18nKey: "statusImportedDrive",
        status: "success",
        linkUrl: notebookUrl,
        showDownload: false
    });
    notifySuccess(cleanTitle, "drive");
}

/**
 * Handler format "url" : import d'une URL web ou YouTube.
 * @param {Object} ctx - Contexte buildCaptureContext().
 */
async function handleUrl(ctx) {
    const { finalNotebookId, cleanTitle, pageUrl, activeIndex } = ctx;
    const isYouTube = /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(pageUrl);

    if (isYouTube) {
        notifyUI("STATUS_UPDATE", { i18nKey: "statusYoutube", status: "info" });
        await addYouTubeSource(finalNotebookId, pageUrl, activeIndex);
    } else {
        notifyUI("STATUS_UPDATE", { i18nKey: "statusSendUrl", status: "info" });
        await addUrlSource(finalNotebookId, pageUrl, activeIndex);
    }

    const notebookUrl = buildNotebookUrl(finalNotebookId);
    notifyUI("STATUS_UPDATE", {
        i18nKey: isYouTube ? "statusImportedYoutube" : "statusImportedUrl",
        status: "success",
        linkUrl: notebookUrl,
        showDownload: false
    });
    notifySuccess(cleanTitle, "url");
}

/**
 * Handler formats PDF et Markdown : capture via content script et upload.
 * @param {Object} ctx    - Contexte buildCaptureContext().
 * @param {string} format - "pdf" ou "md".
 */
async function handleContent(ctx, format) {
    const { finalNotebookId, cleanTitle, activeTab, intentNote, activeIndex } = ctx;

    // ═══ Pipelines PDF / Markdown : content script requis ═══
    notifyUI("STATUS_UPDATE", { i18nKey: "statusDomCapture", status: "info" });

    // CAPTURE_CONTENT : action distincte de START_CAPTURE (popup→background)
    // pour lever l'ambiguïté sur les deux flux de messagerie.
    const response = await browser.tabs.sendMessage(activeTab.id, {
        action: "CAPTURE_CONTENT",
        format: format,
        intentNote: intentNote ?? null,
        i18nLabels: {
            untitledDocument: browser.i18n.getMessage('metaUntitledDocument'),
            captureHeader:    browser.i18n.getMessage('metaCaptureHeader'),
            authorPrefix:     browser.i18n.getMessage('metaAuthorPrefix'),
            sitePrefix:       browser.i18n.getMessage('metaSitePrefix'),
            datePrefix:       browser.i18n.getMessage('metaDatePrefix'),
            intentHeader:     browser.i18n.getMessage('intentHeader')
        }
    });
    if (response?.status !== "SUCCESS") throw new Error("Erreur Content Script : " + response?.error);

    const capturedData = response.payload;
    const capturedFormat = response.format || format;

    await saveCapture(capturedData, cleanTitle, capturedFormat);

    if (capturedFormat === "md") {
        notifyUI("STATUS_UPDATE", { i18nKey: "statusSendMarkdown", status: "info" });
        await addTextSource(finalNotebookId, cleanTitle, capturedData, activeIndex);

        const notebookUrl = buildNotebookUrl(finalNotebookId);
        notifyUI("STATUS_UPDATE", {
            i18nKey: "statusImportedMarkdown",
            status: "success",
            linkUrl: notebookUrl,
            showDownload: true
        });
        notifySuccess(cleanTitle, "md");

    } else {
        notifyUI("STATUS_UPDATE", { i18nKey: "statusCheckQuota", status: "info" });

        if (capturedData.length > MAX_BASE64_SIZE_BYTES) {
            throw new Error("Upload refusé : Le fichier PDF dépasse la limite de 200 MB.");
        }

        notifyUI("STATUS_UPDATE", { i18nKey: "statusSendPdf", status: "info" });
        await uploadPersonalSource(finalNotebookId, capturedData, cleanTitle, activeIndex);

        const notebookUrl = buildNotebookUrl(finalNotebookId);
        notifyUI("STATUS_UPDATE", {
            i18nKey: "statusImportedPdf",
            status: "success",
            linkUrl: notebookUrl,
            showDownload: true
        });
        notifySuccess(cleanTitle, "pdf");
    }
}

// ─── Orchestrateur ────────────────────────────────────────────────────────────

/**
 * Orchestre le workflow complet de capture et d'upload pour les formats
 * PDF, Markdown, URL, Screenshot, Import Direct et Google Drive.
 * Gère la création à la volée d'un carnet si notebookId === "CREATE_NEW".
 * Émet des STATUS_UPDATE vers la popup à chaque étape du pipeline.
 *
 * @param  {string}      targetNotebookId - ID du carnet cible, ou "CREATE_NEW".
 * @param  {string}      format           - Format d'import : "pdf" | "md" | "url" | "screenshot" | "direct" | "drive".
 * @param  {string|null} [intentNote]     - Annotation d'intention optionnelle (§8 AGENTS.md).
 * @returns {Promise<void>}
 * @throws  {Error} - Si l'onglet actif est absent, le carnet introuvable, ou l'upload échoue.
 */
async function executeCaptureAndUploadWorkflow(targetNotebookId, format, intentNote = null) {
    notifyUI("STATUS_UPDATE", { i18nKey: "statusFetchSession", status: "info" });
    const cookieString = await getPersonalAuthCookies();
    const activeIndex = await getActiveAuthuser();
    await fetchCSRFToken(cookieString, activeIndex);
    const ctx = await buildCaptureContext(targetNotebookId, intentNote, activeIndex, cookieString);

    const PIPELINE = {
        screenshot: () => handleScreenshot(ctx),
        direct:     () => handleDirect(ctx),
        drive:      () => handleDrive(ctx),
        url:        () => handleUrl(ctx),
    };
    if (PIPELINE[format]) {
        await PIPELINE[format]();
    } else {
        await handleContent(ctx, format); // pdf ou md
    }
}