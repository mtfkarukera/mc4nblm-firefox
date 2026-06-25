// injection.js : Gestion de l'injection dynamique de scripts dans les onglets

/**
 * Pipelines d'injection par format.
 * Chaque pipeline définit la liste ordonnée des scripts à injecter
 * dans l'onglet actif avant d'envoyer le message CAPTURE_CONTENT.
 * Les formats sans pipeline (url, direct, drive, screenshot, selection)
 * n'ont pas besoin de content scripts.
 */
export const INJECTION_PIPELINE = {
    pdf: [
        "lib/Readability.js",
        "lib/jspdf.umd.min.js",
        "src/content/serializer.js",
        "src/content/pdf_generator.js",
    ],
    md: [
        "lib/Readability.js",
        "src/content/serializer.js",
        "src/content/md_generator.js",
    ],
    screenshot: [],
    url: [],
    direct: [],
    drive: [],
    selection: [],
};

/**
 * Sentinelles globales des scripts injectés.
 * Chaque script positionne une variable globale (window.xxx) à son chargement.
 * isScriptInjected() interroge ces sentinelles via executeScript
 * pour éviter les doubles injections — sans jamais utiliser eval().
 */
export const INJECTION_SENTINELS = {
    "lib/Readability.js": "Readability",
    "lib/jspdf.umd.min.js": "jspdf",
    "src/content/serializer.js": "nwcserializer",
    "src/content/pdf_generator.js": "nwcpdfgen",
    "src/content/md_generator.js": "nwcmdgen",
};

/**
 * Erreur levée lorsque browser.scripting.executeScript échoue sur un onglet
 * (page restreinte : about:, chrome:, moz-extension:, etc.).
 *
 * @class
 * @extends {Error}
 * @param {number} tabId  - ID de l'onglet ciblé.
 * @param {string} file   - Fichier dont l'injection a échoué.
 * @param {string} detail - Message d'erreur brut du navigateur.
 */
export class InjectionError extends Error {
    constructor(tabId, file, detail) {
        super(`Injection échouée sur onglet ${tabId} — ${file} : ${detail}`);
        this.name = "InjectionError";
        this.tabId = tabId;
        this.file = file;
    }
}

/**
 * Vérifie si un script est déjà actif dans l'onglet via sa sentinelle globale.
 * Utilise browser.scripting.executeScript avec une fonction pure (zéro eval).
 *
 * @param  {number} tabId      - ID de l'onglet à vérifier.
 * @param  {string} scriptFile - Chemin relatif du script (clé de INJECTION_SENTINELS).
 * @returns {Promise<boolean>}  - true si le script est déjà injecté, false sinon.
 */
export async function isScriptInjected(tabId, scriptFile) {
    const globalVar = INJECTION_SENTINELS[scriptFile];
    if (!globalVar) return false;

    try {
        const [{ result }] = await browser.scripting.executeScript({
            target: { tabId },
            func: (varName) => typeof window[varName] !== "undefined",
            args: [globalVar]
        });
        return result === true;
    } catch {
        return false;
    }
}

/**
 * Injecte une liste de scripts dans l'ordre strict dans un onglet donné.
 * Promise.all est interdit ici : la séquence doit être strictement linéaire
 * (Readability → jsPDF → serializer → pdf_generator).
 * Ignore silencieusement les scripts déjà présents (déduplication par sentinelle).
 *
 * @param  {number}   tabId   - ID de l'onglet cible.
 * @param  {string[]} scripts - Liste ordonnée de chemins de scripts à injecter.
 * @returns {Promise<void>}
 * @throws  {InjectionError}  - Si l'injection d'un script échoue (page restreinte).
 */
export async function injectScriptsSequentially(tabId, scripts) {
    for (const file of scripts) {
        const alreadyInjected = await isScriptInjected(tabId, file);
        if (alreadyInjected) continue;

        try {
            await browser.scripting.executeScript({
                target: { tabId },
                files: [file],
            });
        } catch (err) {
            throw new InjectionError(tabId, file, err.message);
        }
    }
}
