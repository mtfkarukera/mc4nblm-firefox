// orchestrator.js — Point d'entrée du Content Script
// VERSION 5.2 : Pipeline Readability → jsPDF (PDF) ou Markdown (texte)

/**
 * Routeur de messages du content script.
 * Écoute les messages émis par background.js vers l'onglet actif.
 *
 * Handlers :
 * - CAPTURE_CONTENT  : déclenche le pipeline PDF ou Markdown (via handleCapture).
 * - GET_SELECTION_HTML : retourne le HTML de la sélection active (menu contextuel).
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CAPTURE_CONTENT") {

    const format = message.format || "pdf";
    const intentNote = message.intentNote ?? null;
    const i18nLabels = message.i18nLabels || {};

    handleCapture(format, intentNote, i18nLabels)
      .then(result => sendResponse({
        status: "SUCCESS",
        payload: result,
        format: format
      }))
      .catch(error => {
        console.error('[MC] Capture échouée:', error.message || String(error));
        sendResponse({ status: "ERROR", error: error.message || String(error) });
      });

    // return true = on va répondre de manière asynchrone
    return true;
  }

  // Assembler une liste de tranches PNG en PDF paginé (mode pdf_images)
  if (message.action === "GENERATE_PDF_IMAGES") {
    try {
      const base64Pdf = window.ClipperPDFGenerator.generateFromImageSlices(
        message.slices || [],
        message.metadata || {},
        message.intentNote ?? null,
        message.i18nLabels || {}
      );
      sendResponse({
        status: "SUCCESS",
        payload: base64Pdf,
        format: "pdf_images"
      });
    } catch (error) {
      console.error('[MC] Génération PDF Images échouée:', error.message || String(error));
      sendResponse({ status: "ERROR", error: error.message || String(error) });
    }
    return true;
  }

  // Capturer le HTML de la sélection (demandé par le menu contextuel)
  if (message.action === "GET_SELECTION_HTML") {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      const wrapper = document.createElement('div');
      wrapper.appendChild(fragment);
      const serializer = new XMLSerializer();
      sendResponse({ html: serializer.serializeToString(wrapper) });
    } else {
      sendResponse({ html: null });
    }
    return;
  }
});

/**
 * Orchestre le pipeline de capture complet pour un onglet :
 *   1. Vérification des quotas (PDF uniquement — 500 000 mots max)
 *   2. Serializer V9 (readability-content-extractor) → container HTML autonome
 *   3a. PDF Generator V7 (jsPDF) → Base64 PDF        [format=pdf]
 *   3b. Markdown Generator V1 → texte Markdown structuré [format=md]
 *
 * @param  {string}      format     - Format de sortie : "pdf" ou "md".
 * @param  {string|null} intentNote - Annotation d'intention optionnelle (§8 AGENTS.md).
 * @param  {Object}      i18nLabels - Localized labels from background.js for content scripts.
 * @returns {Promise<string>}        - Base64 data URI (PDF) ou texte Markdown brut.
 */
async function handleCapture(format, intentNote = null, i18nLabels = {}) {

  // 1. Quotas (seulement pour PDF / PDF Riche, le Markdown est toujours léger)
  if (format === "pdf" || format === "pdf_rich") {
    window.ClipperPDFGenerator.checkWordCountQuota();
  }

  // 2. Préparer un clone du body (utilisé en fallback par le serializer)
  const wrapperClone = document.createElement('div');
  wrapperClone.appendChild(document.body.cloneNode(true));

  // 3. Configurer les options du Serializer selon le mode choisi :
  // - pdf (Simple)     : pas d'images
  // - pdf_rich (Riche) : images converties en data URIs pour jsPDF
  // - md (Simple)      : pas d'images
  // - md_rich (Riche)  : images conservées avec URL absolue (sans data URI)
  const serializerOptions = {
    includeImages: format === "pdf_rich" || format === "md_rich",
    convertImagesToDataUri: format === "pdf_rich"
  };

  const container = await window.ClipperSerializer.process(
    wrapperClone,
    i18nLabels,
    serializerOptions
  );

  if (format === "md" || format === "md_rich") {
    // 4a. Markdown Generator : texte structuré (simple ou riche)
    const markdown = window.ClipperMarkdownGenerator.generate(
      container,
      intentNote,
      i18nLabels,
      { rich: format === "md_rich" }
    );
    return markdown;
  } else {
    // 4b. PDF Generator : jsPDF sur le container autonome (simple ou riche)
    const base64Pdf = await window.ClipperPDFGenerator.generate(
      container,
      intentNote,
      i18nLabels,
      { rich: format === "pdf_rich" }
    );
    return base64Pdf;
  }
}
