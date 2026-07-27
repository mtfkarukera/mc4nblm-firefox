// detection.js : Détection de types MIME et de fichiers importables

export const BINARY_MIME_PREFIXES = [
  'application/pdf',
  'audio/',
  'video/',
  'image/',
  'application/msword',
  'application/vnd.openxmlformats',
  'application/vnd.ms-',
  'application/epub'
];

/**
 * Types de fichiers supportés pour l'Import Direct.
 * Liste complète des formats acceptés par NotebookLM.
 * Mapping MIME type → { label, extension, category }
 */
export const DIRECT_IMPORT_TYPES = {
    // Documents
    'application/pdf': { label: 'PDF', ext: '.pdf', category: 'document' },
    'text/plain': { label: 'TXT', ext: '.txt', category: 'document' },
    'text/markdown': { label: 'MD', ext: '.md', category: 'document' },
    'text/csv': { label: 'CSV', ext: '.csv', category: 'document' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', ext: '.docx', category: 'document' },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { label: 'PPTX', ext: '.pptx', category: 'document' },
    'application/epub+zip': { label: 'EPUB', ext: '.epub', category: 'document' },
    // Images
    'image/png': { label: 'PNG', ext: '.png', category: 'image' },
    'image/jpeg': { label: 'JPEG', ext: '.jpg', category: 'image' },
    'image/gif': { label: 'GIF', ext: '.gif', category: 'image' },
    'image/bmp': { label: 'BMP', ext: '.bmp', category: 'image' },
    'image/webp': { label: 'WebP', ext: '.webp', category: 'image' },
    'image/avif': { label: 'AVIF', ext: '.avif', category: 'image' },
    'image/tiff': { label: 'TIFF', ext: '.tiff', category: 'image' },
    'image/x-icon': { label: 'ICO', ext: '.ico', category: 'image' },
    'image/jp2': { label: 'JP2', ext: '.jp2', category: 'image' },
    'image/heic': { label: 'HEIC', ext: '.heic', category: 'image' },
    'image/heif': { label: 'HEIF', ext: '.heif', category: 'image' },
    // Audio
    'audio/mpeg': { label: 'MP3', ext: '.mp3', category: 'audio' },
    'audio/wav': { label: 'WAV', ext: '.wav', category: 'audio' },
    'audio/x-wav': { label: 'WAV', ext: '.wav', category: 'audio' },
    'audio/ogg': { label: 'OGG', ext: '.ogg', category: 'audio' },
    'audio/aac': { label: 'AAC', ext: '.aac', category: 'audio' },
    'audio/mp4': { label: 'M4A', ext: '.m4a', category: 'audio' },
    'audio/x-m4a': { label: 'M4A', ext: '.m4a', category: 'audio' },
    'audio/aiff': { label: 'AIFF', ext: '.aiff', category: 'audio' },
    'audio/x-aiff': { label: 'AIFF', ext: '.aiff', category: 'audio' },
    'audio/midi': { label: 'MIDI', ext: '.mid', category: 'audio' },
    'audio/x-midi': { label: 'MIDI', ext: '.mid', category: 'audio' },
    'audio/opus': { label: 'OPUS', ext: '.opus', category: 'audio' },
    'audio/amr': { label: 'AMR', ext: '.amr', category: 'audio' },
    'audio/x-ms-wma': { label: 'WMA', ext: '.wma', category: 'audio' },
    'audio/x-pn-realaudio': { label: 'RA', ext: '.ra', category: 'audio' },
    'audio/basic': { label: 'AU', ext: '.au', category: 'audio' },
    // Vidéo
    'video/mp4': { label: 'MP4', ext: '.mp4', category: 'video' },
    'video/mpeg': { label: 'MPEG', ext: '.mpeg', category: 'video' },
    'video/x-msvideo': { label: 'AVI', ext: '.avi', category: 'video' },
    'video/3gpp': { label: '3GP', ext: '.3gp', category: 'video' },
    'video/3gpp2': { label: '3G2', ext: '.3g2', category: 'video' },
};

/**
 * Devine le MIME type d'un fichier Drive hébergé à partir du titre de l'onglet Firefox.
 * Format attendu du titre : "nomfichier.ext - Google Drive".
 * Fallback à 'application/pdf' si l'extension est inconnue ou absente.
 *
 * @param  {string} title - Titre de l'onglet tel que retourné par tabs.query().
 * @returns {string}       - MIME type détecté (ex: 'image/png') ou 'application/pdf'.
 */
export function guessMimeFromTitle(title) {
    const EXTENSION_MAP = {
        'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown',
        'csv': 'text/csv', 'epub': 'application/epub+zip',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'mp4': 'video/mp4',
    };
    const cleaned = title.replace(/\s*-\s*Google Drive\s*$/i, '').trim();
    const dotIndex = cleaned.lastIndexOf('.');
    if (dotIndex > 0) {
        const ext = cleaned.substring(dotIndex + 1).toLowerCase();
        if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
    }
    return 'application/pdf';
}

/**
 * Mapping extension → MIME type pour la détection par URL (fichiers locaux surtout).
 */
const EXT_TO_MIME = {
    // Documents
    'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown',
    'csv': 'text/csv', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'epub': 'application/epub+zip',
    // Images
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'jpe': 'image/jpeg',
    'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp', 'avif': 'image/avif',
    'tif': 'image/tiff', 'tiff': 'image/tiff', 'ico': 'image/x-icon',
    'jp2': 'image/jp2', 'heic': 'image/heic', 'heif': 'image/heif',
    // Audio
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 'aac': 'audio/aac',
    'm4a': 'audio/mp4', 'aif': 'audio/aiff', 'aifc': 'audio/aiff', 'aiff': 'audio/aiff',
    'mid': 'audio/midi', 'opus': 'audio/opus', 'amr': 'audio/amr', 'wma': 'audio/x-ms-wma',
    'ra': 'audio/x-pn-realaudio', 'ram': 'audio/x-pn-realaudio', 'au': 'audio/basic',
    'snd': 'audio/basic', 'cda': 'audio/mpeg',
    // Vidéo
    'mp4': 'video/mp4', 'mpeg': 'video/mpeg', 'avi': 'video/x-msvideo',
    '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
};

/** Regex d'extensions pour la détection rapide par URL */
const SUPPORTED_EXT_REGEX = /\.(pdf|txt|md|docx|csv|pptx|epub|avif|bmp|gif|ico|jp2|png|webp|tif|tiff|heic|heif|jpe?g|3g2|3gp|aac|aif|aifc|aiff|amr|au|avi|cda|m4a|mid|mp3|mp4|mpeg|ogg|opus|ra|ram|snd|wav|wma)$/i;

/**
 * Détecte si une URL pointe vers un fichier directement importable dans NotebookLM.
 * Combine l'analyse de l'extension URL (heuristique rapide) et une requête HEAD
 * pour confirmer le Content-Type réel. Retourne directImport: false pour toute
 * URL non HTTP(S) ou dont le type est non supporté.
 *
 * @param  {string} url - URL complète à analyser.
 * @returns {Promise<{directImport: boolean, mimeType?: string, label?: string, category?: string, isLocal?: boolean}>}
 */
export async function detectFileType(url) {
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://'))) {
        return { directImport: false };
    }

    const isLocal = url.startsWith('file://');

    // 1. Heuristique rapide : extension URL
    const urlPath = new URL(url).pathname.toLowerCase();
    const extMatch = urlPath.match(SUPPORTED_EXT_REGEX);

    // 2. Pour les URLs HTTP, confirmer via HEAD request
    let detectedMime = null;
    if (!isLocal && url.startsWith('http')) {
        try {
            // ROB-5 : timeout de 5s pour éviter le blocage de l'UI si le serveur est lent
            const headResp = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
            const contentType = headResp.headers.get('content-type') || '';
            detectedMime = contentType.split(';')[0].trim().toLowerCase();
        } catch (e) {
            console.warn('[MC] detectFileType — HEAD request échouée:', e.message);
        }
    }

    // 3. Tenter de résoudre à partir de l'extension si HEAD n'a rien donné
    if (!detectedMime && extMatch) {
        detectedMime = EXT_TO_MIME[extMatch[1].toLowerCase()];
    }

    // 4. Vérifier si le type est supporté
    if (detectedMime && DIRECT_IMPORT_TYPES[detectedMime]) {
        const typeInfo = DIRECT_IMPORT_TYPES[detectedMime];
        return {
            directImport: true,
            mimeType: detectedMime,
            label: typeInfo.label,
            category: typeInfo.category,
            isLocal: isLocal
        };
    }

    return { directImport: false };
}
