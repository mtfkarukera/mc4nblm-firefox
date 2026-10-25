import { t, setCustomLocale } from '../shared/utils.js';

// popup.js : Logique UI et communication asynchrone

// Constantes DOM
const btnCapture = document.getElementById('btn-capture');
const uiSearchInput = document.getElementById('notebook-search');
const uiNotebookList = document.getElementById('notebook-list');
const uiStatusMessage = document.getElementById('status-message');
const uiAuthStatus = document.getElementById('auth-status');
const btnCustomSpinner = document.getElementById('btn-spinner');
const btnCreateNotebook = document.getElementById('btn-create-notebook');
const uiFormatToggle = document.getElementById('format-toggle');
const uiDirectImportSection = document.getElementById('direct-import-section');
const btnDirectImport = document.getElementById('btn-direct-import');
const uiDirectLabel = document.getElementById('direct-label');
const uiSelectionBanner = document.getElementById('selection-banner');
const uiSelectionPreview = document.getElementById('selection-text-preview');
const btnClearSelection = document.getElementById('btn-clear-selection');
const intentInput = document.getElementById('intent-input');
const intentCounter = document.getElementById('intent-counter');
const btnSettings = document.getElementById('btn-settings');
const btnSettingsBack = document.getElementById('btn-settings-back');
const uiSettingsPanel = document.getElementById('settings-panel');
const uiMainView = document.getElementById('main-view');
const uiSettingsModesList = document.getElementById('settings-modes-list');
const uiSettingsModesCounter = document.getElementById('settings-modes-counter');
const uiToggleCreole = document.getElementById('toggle-creole');

// Définition des 8 modes personnalisables dans les paramètres (2 à 4 actifs, 'url' obligatoire)
const ALL_MODES = [
  { id: 'pdf',             iconClass: 'icon-pdf',             nameKey: 'modePdfName',            descKey: 'modePdfDesc',            locked: false },
  { id: 'pdf_rich',        iconClass: 'icon-pdf-rich',        nameKey: 'modePdfRichName',        descKey: 'modePdfRichDesc',        locked: false },
  { id: 'pdf_images',      iconClass: 'icon-pdf-images',      nameKey: 'modePdfImagesName',      descKey: 'modePdfImagesDesc',      locked: false },
  { id: 'md',              iconClass: 'icon-md',              nameKey: 'modeMdName',             descKey: 'modeMdDesc',             locked: false },
  { id: 'md_rich',         iconClass: 'icon-md-rich',         nameKey: 'modeMdRichName',         descKey: 'modeMdRichDesc',         locked: false },
  { id: 'url',             iconClass: 'icon-url',             nameKey: 'modeUrlName',            descKey: 'modeUrlDesc',            locked: true  },
  { id: 'screenshot',      iconClass: 'icon-screenshot',      nameKey: 'modeScreenshotName',     descKey: 'modeScreenshotDesc',     locked: false },
  { id: 'screenshot_full', iconClass: 'icon-screenshot-full', nameKey: 'modeScreenshotFullName', descKey: 'modeScreenshotFullDesc', locked: false }
];

const DEFAULT_ACTIVE_MODES = ['pdf_rich', 'md', 'url', 'screenshot'];
const PDF_MODES = ['pdf', 'pdf_rich', 'pdf_images'];
const MD_MODES = ['md', 'md_rich'];
const SCREENSHOT_MODES = ['screenshot', 'screenshot_full'];
const INTENT_SUPPORTED_MODES = new Set(['pdf', 'pdf_rich', 'pdf_images', 'md', 'md_rich']);

let activeUserModes = [...DEFAULT_ACTIVE_MODES];

const BINARY_EXTENSIONS = new Set([
  'pdf','mp3','mp4','wav','ogg','aac','m4a','flac','opus','amr','wma',
  'png','jpg','jpeg','gif','bmp','webp','avif','tiff','ico','heic','heif',
  'avi','mov','mkv','3gp','3g2','mpeg','docx','xlsx','pptx','epub','csv'
]);

/** Retourne true si l'URL correspond à une page YouTube (watch, shorts, youtu.be). */
function isYouTubeWatch(url) {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(url);
}

/** Retourne true si l'URL se termine par une extension binaire connue (pdf, mp3, png, etc.). */
function hasBinaryExtension(url) {
  try {
    const path = new URL(url).pathname;
    const ext = path.split('.').pop().toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

// Variables d'état
let currentSelectedNotebookId = null;
let allNotebooksCache = [];
let currentFormat = "pdf_rich";
let detectedFileInfo = null;
let pendingSelection = null; // Sélection en attente (capturée via le menu contextuel)
let keepAlivePort = null;   // Port runtime maintenant l'Event Page active pendant les captures
let safetyResetTimer = null; // Timeout de sécurité UI (120s)
let isDriveExclusiveMode = false; // Indique si la page courante est un fichier Google Drive

/**
 * Ouvre un Port vers le background pour empêcher Firefox de décharger l'Event Page.
 * Doit être appelé avant tout START_CAPTURE et fermé après réponse ou erreur.
 */
function openKeepAlivePort() {
  if (keepAlivePort) return; // Déjà ouvert
  try {
    keepAlivePort = browser.runtime.connect({ name: 'popup-keepalive' });
    keepAlivePort.onDisconnect.addListener(() => { keepAlivePort = null; });
  } catch (e) {
    keepAlivePort = null;
  }
}

/** Ferme le Port keepAlive. */
function closeKeepAlivePort() {
  if (keepAlivePort) {
    try { keepAlivePort.disconnect(); } catch {}
    keepAlivePort = null;
  }
}

/** Remplace le contenu d'un container par un placeholder textuel (zéro innerHTML). */
function setPlaceholder(container, text, className) {
  const div = document.createElement('div');
  div.className = className ? `placeholder-text ${className}` : 'placeholder-text';
  div.textContent = text;
  container.replaceChildren(div);
}

/** Affiche un skeleton loader de 3 barres pulsantes dans le container. */
function showSkeleton(container) {
  // A11Y-2 : signaler le chargement aux technologies d'assistance
  container.setAttribute('aria-busy', 'true');
  container.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const bar = document.createElement('div');
    bar.className = 'skeleton-item';
    container.appendChild(bar);
  }
}

/** Adds 'btn-disabled' class and syncs aria-disabled for accessibility. */
function setFormatBtnDisabled(btn) {
  btn.classList.add('btn-disabled');
  btn.setAttribute('aria-disabled', 'true');
}

/** Removes 'btn-disabled' class and syncs aria-disabled for accessibility. */
function removeFormatBtnDisabled(btn) {
  btn.classList.remove('btn-disabled');
  btn.removeAttribute('aria-disabled');
}

/** Applique les traductions i18n sur tous les éléments DOM portant data-i18n*. */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });

  // Update document language attribute
  const isCreole = uiToggleCreole && uiToggleCreole.checked;
  const resolvedLocale = isCreole ? 'gcf' : (navigator.language || 'en').split('-')[0];
  document.documentElement.lang = resolvedLocale;
}

/**
 * Normalise et valide la liste des modes actifs de l'utilisateur (2 à 4 modes, 'url' obligatoire).
 * @param {string[]} modes - Tableau d'IDs de modes.
 * @returns {string[]} Liste validée dans l'ordre canonique de ALL_MODES.
 */
function sanitizeActiveModes(modes) {
  if (!Array.isArray(modes)) return [...DEFAULT_ACTIVE_MODES];
  const validIds = new Set(ALL_MODES.map(m => m.id));
  const unique = Array.from(new Set(modes.filter(id => validIds.has(id))));
  if (!unique.includes('url')) unique.push('url');
  if (unique.length < 2 || unique.length > 4) {
    return [...DEFAULT_ACTIVE_MODES];
  }
  return ALL_MODES.map(m => m.id).filter(id => unique.includes(id));
}

/**
 * Applique la visibilité des boutons de la barre d'outils selon activeUserModes.
 * Si le mode actif n'est plus dans activeUserModes, sélectionne le 1er mode disponible.
 */
function applyUserModePreferences() {
  if (isDriveExclusiveMode) return;

  const allFormatBtns = Array.from(uiFormatToggle.querySelectorAll('.format-btn[data-format]'));
  allFormatBtns.forEach(btn => {
    const fmt = btn.dataset.format;
    if (fmt === 'drive') return;
    if (activeUserModes.includes(fmt)) {
      btn.classList.remove('hidden');
      btn.style.display = '';
    } else {
      btn.classList.add('hidden');
      btn.style.display = 'none';
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  // Vérifier que currentFormat est toujours visible et non grisé
  if (currentFormat !== 'direct' && currentFormat !== 'drive' && currentFormat !== 'selection') {
    const activeBtn = uiFormatToggle.querySelector(`.format-btn[data-format="${currentFormat}"]`);
    if (!activeBtn || activeBtn.classList.contains('hidden') || activeBtn.classList.contains('btn-disabled')) {
      const firstAvailable = allFormatBtns.find(
        b => b.dataset.format !== 'drive' &&
             !b.classList.contains('hidden') &&
             !b.classList.contains('btn-disabled')
      );
      allFormatBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      if (firstAvailable) {
        firstAvailable.classList.add('active');
        firstAvailable.setAttribute('aria-pressed', 'true');
        currentFormat = firstAvailable.dataset.format;
      }
      updateCaptureButtonLabel();
    }
  }
}

/**
 * Construit dynamiquement la liste des 8 modes dans le panneau Paramètres (zéro innerHTML).
 */
function renderSettingsModesList() {
  if (!uiSettingsModesList) return;
  uiSettingsModesList.replaceChildren();

  if (uiSettingsModesCounter) {
    uiSettingsModesCounter.textContent = `${activeUserModes.length} / 4`;
  }

  const count = activeUserModes.length;

  ALL_MODES.forEach(mode => {
    const isChecked = activeUserModes.includes(mode.id);
    const isDisableUncheck = isChecked && (mode.locked || count <= 2);
    const isDisableCheck = !isChecked && count >= 4;
    const isInputDisabled = isDisableUncheck || isDisableCheck;

    const labelRow = document.createElement('label');
    labelRow.className = 'settings-mode-row' + (isInputDisabled ? ' mode-row-disabled' : '');

    const infoDiv = document.createElement('div');
    infoDiv.className = 'settings-mode-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'settings-mode-name';

    const modeIcon = document.createElement('span');
    modeIcon.className = `ui-icon ${mode.iconClass}`;
    modeIcon.setAttribute('aria-hidden', 'true');
    nameSpan.appendChild(modeIcon);

    const nameText = document.createElement('span');
    nameText.textContent = t(mode.nameKey);
    nameSpan.appendChild(nameText);

    if (mode.locked) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'ui-icon icon-lock';
      lockIcon.setAttribute('aria-hidden', 'true');
      nameSpan.appendChild(lockIcon);
    }

    const descSpan = document.createElement('span');
    descSpan.className = 'settings-mode-desc';
    descSpan.textContent = t(mode.descKey);

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(descSpan);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'settings-checkbox';
    checkbox.checked = isChecked;
    checkbox.disabled = isInputDisabled;

    checkbox.addEventListener('change', async () => {
      if (mode.locked) {
        checkbox.checked = true;
        return;
      }
      let nextModes;
      if (checkbox.checked) {
        if (activeUserModes.length >= 4) {
          checkbox.checked = false;
          return;
        }
        nextModes = sanitizeActiveModes([...activeUserModes, mode.id]);
      } else {
        if (activeUserModes.length <= 2) {
          checkbox.checked = true;
          return;
        }
        nextModes = sanitizeActiveModes(activeUserModes.filter(id => id !== mode.id));
      }
      activeUserModes = nextModes;
      await browser.storage.local.set({ nwc_active_modes: activeUserModes });
      applyUserModePreferences();
      renderSettingsModesList();
    });

    labelRow.appendChild(infoDiv);
    labelRow.appendChild(checkbox);
    uiSettingsModesList.appendChild(labelRow);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await browser.storage.local.get(['locale', 'nwc_active_modes']);
  const locale = stored.locale;
  activeUserModes = sanitizeActiveModes(stored.nwc_active_modes);

  if (uiToggleCreole) {
    uiToggleCreole.checked = (locale === 'gcf');
    uiToggleCreole.addEventListener('change', async (e) => {
      const nextLocale = e.target.checked ? 'gcf' : 'auto';
      await browser.storage.local.set({ locale: nextLocale });
      await setCustomLocale(nextLocale);
      applyI18n();
      renderSettingsModesList();
      updateCaptureButtonLabel();
    });
  }

  await setCustomLocale(locale ?? '');
  applyI18n();
  applyUserModePreferences();
  renderSettingsModesList();

  if (btnSettings && uiSettingsPanel && uiMainView) {
    btnSettings.addEventListener('click', () => {
      const isSettingsOpen = !uiSettingsPanel.classList.contains('hidden');
      if (isSettingsOpen) {
        uiSettingsPanel.classList.add('hidden');
        uiMainView.classList.remove('hidden');
      } else {
        renderSettingsModesList();
        uiMainView.classList.add('hidden');
        uiSettingsPanel.classList.remove('hidden');
      }
    });
  }

  if (btnSettingsBack && uiSettingsPanel && uiMainView) {
    btnSettingsBack.addEventListener('click', () => {
      uiSettingsPanel.classList.add('hidden');
      uiMainView.classList.remove('hidden');
    });
  }

  // Connexion au background pour obtenir l'état et les carnets
  browser.runtime.sendMessage({ action: "GET_AUTH_STATUS" }).then((response) => {
     if(response && response.status === "CONNECTE") {
         updateAuthStatus(t('statusConnected').replace('{type}', response.type), "status-success");
         
         if (response.type === "PERSONAL") {
             browser.runtime.sendMessage({ action: "GET_ACCOUNTS" }).then(res => {
                 if (res && res.accounts && res.accounts.length > 1) {
                     const selectBox = document.getElementById("account-switcher");
                     if(selectBox) {
                         selectBox.replaceChildren();
                         res.accounts.forEach(acc => {
                             const opt = document.createElement("option");
                             opt.value = acc.index;
                             opt.textContent = acc.email;
                             if (acc.index === res.activeIndex) opt.selected = true;
                             selectBox.appendChild(opt);
                         });
                         selectBox.classList.remove("hidden");
                         selectBox.addEventListener("change", (e) => {
                             const newIndex = parseInt(e.target.value, 10);
                             browser.runtime.sendMessage({ action: "SET_ACCOUNT", index: newIndex }).then(() => {
                                 loadNotebooks(); // Recharger les carnets
                             });
                         });
                     }
                 }
                 loadNotebooks();
             }).catch(() => loadNotebooks());
         } else {
             loadNotebooks();
         }
     } else {
         updateAuthStatus(t('statusDisconnected'), "status-error");
         setPlaceholder(uiNotebookList, t('errAuth'));
     }
  }).catch(e => {
     updateAuthStatus(t('statusDisconnected'), "status-error");
     setPlaceholder(uiNotebookList, t('errAuth'));
   });
   
   uiSearchInput.addEventListener('input', debounce((e) => {
     filterNotebooks(e.target.value);
   }, 300));

   uiSearchInput.addEventListener('keydown', (e) => {
     if (e.key === 'ArrowDown') {
       e.preventDefault();
       const firstItem = uiNotebookList.querySelector('[role="option"]');
       if (firstItem) firstItem.focus();
     }
   });
   
   btnCapture.addEventListener('click', startCaptureProcess);
   
   // Bouton "+" : Crée un carnet avec le texte du champ de recherche
   btnCreateNotebook.addEventListener('click', createNewNotebook);

   // Toggle format PDF / Markdown / URL / Screenshot
   uiFormatToggle.addEventListener('click', (e) => {
     const btn = e.target.closest('.format-btn');
     if (!btn || btn.classList.contains('active') || btn.classList.contains('btn-disabled')) return;

     // Si une sélection est en attente, la cleariser quand l'utilisateur change de format
     if (pendingSelection) {
       browser.storage.local.remove('nwc_pending_selection');
       pendingSelection = null;
       uiSelectionBanner.classList.add('hidden');
       // Réactiver les boutons qui étaient grisés par la sélection
       uiFormatToggle.querySelectorAll('.format-btn').forEach(b => removeFormatBtnDisabled(b));
     }

     // Désélectionner tous les boutons (format toggle + direct)
     uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
       b.classList.remove('active');
       b.setAttribute('aria-pressed', 'false');
     });
     if (btnDirectImport) {
       btnDirectImport.classList.remove('active');
       btnDirectImport.setAttribute('aria-pressed', 'false');
     }
     
     btn.classList.add('active');
     btn.setAttribute('aria-pressed', 'true');
     currentFormat = btn.dataset.format;
     updateCaptureButtonLabel();
   });

   // Bouton Import Direct (séparé du toggle principal)
   if (btnDirectImport) {
     btnDirectImport.addEventListener('click', () => {
       if (btnDirectImport.classList.contains('active')) return;
       
       // Désélectionner les boutons du toggle principal
       uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
         b.classList.remove('active');
         b.setAttribute('aria-pressed', 'false');
       });
       btnDirectImport.classList.add('active');
       btnDirectImport.setAttribute('aria-pressed', 'true');
       currentFormat = 'direct';
       updateCaptureButtonLabel();
     });
   }

   // Bouton Annuler la sélection
   if (btnClearSelection) {
     btnClearSelection.addEventListener('click', async () => {
       await browser.storage.local.remove('nwc_pending_selection');
       pendingSelection = null;
       uiSelectionBanner.classList.add('hidden');
       // Réactiver les boutons qui étaient grisés par la sélection
       uiFormatToggle.querySelectorAll('.format-btn').forEach(b => removeFormatBtnDisabled(b));
       // Restaurer le premier format actif disponible
       if (currentFormat === 'selection') {
         currentFormat = activeUserModes[0] || 'pdf_rich';
         applyUserModePreferences();
         const defaultBtn = uiFormatToggle.querySelector(`[data-format="${currentFormat}"]`);
         if (defaultBtn) {
           defaultBtn.classList.add('active');
           defaultBtn.setAttribute('aria-pressed', 'true');
         }
         updateCaptureButtonLabel();
       }
     });
   }

   // Détection du type de fichier pour l'Import Direct
   detectActiveTabFileType();

   // Vérifier s'il y a une sélection en attente (capturée via le menu contextuel)
   checkPendingSelection();

   // Compteur d'intention
   if (intentInput && intentCounter) {
     intentInput.addEventListener('input', () => {
       intentCounter.textContent = `${intentInput.value.length} / 300`;
     });
   }
});

/** Charge la liste des carnets depuis le background et met à jour l'affichage. */
function loadNotebooks() {
    showSkeleton(uiNotebookList);
    browser.runtime.sendMessage({ action: "GET_NOTEBOOKS" }).then((res) => {
         uiSearchInput.disabled = false;
         if(res && res.notebooks) {
            allNotebooksCache = res.notebooks;
            renderNotebooks(allNotebooksCache);
         } else if (res && res.status === "error") {
            const msg = res.i18nKey ? t(res.i18nKey) : t('errLoadNotebooks');
            setPlaceholder(uiNotebookList, msg, 'placeholder-error');
         } else {
            setPlaceholder(uiNotebookList, t('noNotebookFound'));
         }
    }).catch(err => {
         setPlaceholder(uiNotebookList, t('errGeneric').replace('{msg}', err.message), 'placeholder-error');
         uiSearchInput.disabled = true;
    });
}

/** Construit la liste visuelle des carnets dans le DOM à partir d'un tableau filtré. */
function renderNotebooks(list) {
    // A11Y-2 : fin du chargement pour les technologies d'assistance
    uiNotebookList.setAttribute('aria-busy', 'false');
    uiNotebookList.replaceChildren();
    if(list.length === 0) {
        setPlaceholder(uiNotebookList, t('notebookNotFound'));
        return;
    }
    const hasSelected = list.some(nb => nb.id === currentSelectedNotebookId);
    list.forEach((nb, index) => {
        const isSelected = (currentSelectedNotebookId === nb.id);
        const isRovingActive = isSelected || (!hasSelected && index === 0);
        const div = document.createElement('div');
        div.className = 'notebook-item';
        div.setAttribute('role', 'option');
        div.setAttribute('tabindex', isRovingActive ? '0' : '-1');
        div.setAttribute('aria-selected', 'false');
        if (currentSelectedNotebookId === nb.id) {
           div.classList.add('selected');
           div.setAttribute('aria-selected', 'true');
        }
        div.textContent = nb.title;
        div.onclick = () => {
            document.querySelectorAll('.notebook-item').forEach(el => {
              el.classList.remove('selected');
              el.setAttribute('aria-selected', 'false');
              el.setAttribute('tabindex', '-1');
            });
            div.classList.add('selected');
            div.setAttribute('aria-selected', 'true');
            div.setAttribute('tabindex', '0');
            currentSelectedNotebookId = nb.id;
            btnCapture.disabled = false;
        };
        div.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            div.click();
          }
          if (e.key === 'ArrowDown' && div.nextElementSibling) {
            e.preventDefault();
            div.setAttribute('tabindex', '-1');
            div.nextElementSibling.setAttribute('tabindex', '0');
            div.nextElementSibling.focus();
          }
          if (e.key === 'ArrowUp' && div.previousElementSibling) {
            e.preventDefault();
            div.setAttribute('tabindex', '-1');
            div.previousElementSibling.setAttribute('tabindex', '0');
            div.previousElementSibling.focus();
          }
        });
        uiNotebookList.appendChild(div);
    });
}

/** Retarde l'exécution d'une fonction jusqu'à ce qu'un délai d'inactivité soit écoulé. */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/** Filtre les carnets en cache par titre et rafraîchit l'affichage. */
function filterNotebooks(query) {
  const filtered = allNotebooksCache.filter(nb => nb.title.toLowerCase().includes(query.toLowerCase()));
  renderNotebooks(filtered);
}

/**
 * Création d'un nouveau carnet : utilise le contenu du champ de recherche comme nom
 */
async function createNewNotebook() {
  const title = uiSearchInput.value.trim();
  if (!title) {
    updateStatus(t('errNoSearchTerm'), "error");
    return;
  }
  
  btnCreateNotebook.disabled = true;
  updateStatus(t('creatingNotebook').replace('{title}', title), "info");
  
  try {
    const response = await browser.runtime.sendMessage({ 
      action: "CREATE_NOTEBOOK", 
      title: title 
    });
    
    if (response && response.notebookId) {
      // Sélectionner automatiquement le nouveau carnet
      currentSelectedNotebookId = response.notebookId;
      btnCapture.disabled = false;
      
      // Ajouter au cache et rafraîchir l'affichage
      allNotebooksCache.unshift({ id: response.notebookId, title: title });
      uiSearchInput.value = '';
      renderNotebooks(allNotebooksCache);
      
      const notebookUrl = `https://notebook.google.com/notebook/${response.notebookId}`;
      updateStatus(t('notebookCreated').replace('{title}', title), "success", notebookUrl);
    } else {
      const msg = response?.i18nKey ? t(response.i18nKey) : t('errCreateNotebook');
      updateStatus(msg, "error");
    }
  } catch (err) {
    updateStatus(t('errGeneric').replace('{msg}', err.message), "error");
  } finally {
    btnCreateNotebook.disabled = false;
  }
}

/** Déclenche le processus de capture en envoyant START_CAPTURE au background. */
function startCaptureProcess() {
   if (!currentSelectedNotebookId) {
     updateStatus(t('errNoNotebook'), "error");
     return;
   }

   // Mode sélection : envoyer le texte capturé
   if (currentFormat === 'selection' && pendingSelection) {
     btnCapture.disabled = true;
     uiSearchInput.disabled = true;
     btnCustomSpinner.classList.remove('hidden');
     updateStatus(t('importingSelection'), "info");
     
     openKeepAlivePort();
     // Timeout de sécurité UI : si le background ne répond pas en 120s, réinitialiser
     safetyResetTimer = setTimeout(() => { closeKeepAlivePort(); resetUI(); }, 120_000);
     
     browser.runtime.sendMessage({
       action: "START_CAPTURE",
       notebookId: currentSelectedNotebookId,
       format: 'selection',
       selectionData: pendingSelection,
       intentNote: intentInput.value.trim() || null
     }).then(res => {
       if (res?.status === 'error' && res.i18nKey) {
         clearTimeout(safetyResetTimer); safetyResetTimer = null;
         closeKeepAlivePort();
         updateStatus(t(res.i18nKey), 'error');
         resetUI();
       }
     }).catch(() => { closeKeepAlivePort(); resetUI(); });
     
     // Nettoyer la sélection en attente
     browser.storage.local.remove('nwc_pending_selection');
     pendingSelection = null;
     return;
   }

   btnCapture.disabled = true;
   uiSearchInput.disabled = true;
   btnCustomSpinner.classList.remove('hidden');

   const formatLabels = {
     pdf: 'PDF',
     pdf_rich: 'PDF+',
     pdf_images: 'PDF Images',
     md: 'Markdown',
     md_rich: 'Markdown+',
     url: 'URL',
     screenshot: t('btnScreenshot') || 'Screenshot',
     screenshot_full: t('btnScreenshotFull') || 'Screenshot Page',
     direct: t('formatLabelDirect') || 'Direct Import',
     drive: 'Google Drive'
   };
   const label = formatLabels[currentFormat] || currentFormat;
   updateStatus(t('importingFormat').replace('{label}', label), "info");

   openKeepAlivePort();
   // Timeout de sécurité UI : si le background ne répond pas en 120s, réinitialiser
   safetyResetTimer = setTimeout(() => { closeKeepAlivePort(); resetUI(); }, 120_000);

   browser.runtime.sendMessage({ 
     action: "START_CAPTURE", 
     notebookId: currentSelectedNotebookId,
     format: currentFormat,
     intentNote: intentInput.value.trim() || null
   }).then(res => {
     if (res?.status === 'error' && res.i18nKey) {
       clearTimeout(safetyResetTimer); safetyResetTimer = null;
       closeKeepAlivePort();
       updateStatus(t(res.i18nKey), 'error');
       resetUI();
     }
   }).catch(() => { closeKeepAlivePort(); resetUI(); });
}

/**
 * Met à jour le libellé du bouton principal selon le format sélectionné.
 */
function updateCaptureButtonLabel() {
   const btnText = btnCapture.querySelector('.btn-text');
   btnText.textContent = t('popupTitleCapture');

   // Affichage conditionnel du champ d'intention (tous les modes PDF et Markdown)
   const intentWrapper = document.getElementById('intent-wrapper');
   if (intentWrapper) {
     if (INTENT_SUPPORTED_MODES.has(currentFormat)) {
       intentWrapper.classList.remove('hidden');
     } else {
       intentWrapper.classList.add('hidden');
       if (intentInput) intentInput.value = "";
       if (intentCounter) intentCounter.textContent = "0 / 300";
     }
   }
}

/**
 * Désactive un groupe de boutons de format par liste d'IDs.
 * @param {string[]} formatIds - IDs de formats à griser.
 */
function disableFormatGroup(formatIds) {
  formatIds.forEach(fmt => {
    const btn = uiFormatToggle.querySelector(`[data-format="${fmt}"]`);
    if (btn) setFormatBtnDisabled(btn);
  });
}

/**
 * Détecte si l'onglet actif affiche un fichier directement importable.
 * Active/désactive les boutons en conséquence.
 */
async function detectActiveTabFileType() {
   try {
     const tabs = await browser.tabs.query({ active: true, currentWindow: true });
     if (tabs.length === 0) return;

     const url = tabs[0].url;
     const urlBtn = uiFormatToggle.querySelector('[data-format="url"]');

     if (isYouTubeWatch(url)) {
       disableFormatGroup([...PDF_MODES, ...MD_MODES, ...SCREENSHOT_MODES]);
       if (btnDirectImport) {
         setFormatBtnDisabled(btnDirectImport);
       }

       if (currentFormat !== 'url') {
         uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
          });
          if (btnDirectImport) {
            btnDirectImport.classList.remove('active');
            btnDirectImport.setAttribute('aria-pressed', 'false');
          }
          if (urlBtn) {
            urlBtn.classList.add('active');
            urlBtn.setAttribute('aria-pressed', 'true');
          }
         currentFormat = 'url';
         updateCaptureButtonLabel();
       }
       return;
     }

     if (hasBinaryExtension(url)) {
        disableFormatGroup([...PDF_MODES, ...MD_MODES, ...SCREENSHOT_MODES]);

       const ext = new URL(url).pathname.split('.').pop().toLowerCase();
       const label = ext.toUpperCase();
       if (uiDirectLabel) {
         uiDirectLabel.textContent = `${t('btnDirect')} (${label})`;
       }
       if (uiDirectImportSection) {
         uiDirectImportSection.classList.remove('hidden');
       }

       if (btnDirectImport) {
         removeFormatBtnDisabled(btnDirectImport);
          btnDirectImport.classList.add('active');
          btnDirectImport.setAttribute('aria-pressed', 'true');
       }

       uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
         b.classList.remove('active');
         b.setAttribute('aria-pressed', 'false');
       });

       currentFormat = 'direct';
       updateCaptureButtonLabel();
       return;
     }

     // F2 étape 2 : URL sans extension connue → HEAD request MIME via background
     try {
       const { isBinary, mime } = await browser.runtime.sendMessage({
         action: 'DETECT_MIME',
         url
       });
        if (isBinary) {
          disableFormatGroup([...PDF_MODES, ...MD_MODES, ...SCREENSHOT_MODES]);

         // Extraire un label lisible depuis le MIME (ex: "audio/mpeg" → "AUDIO")
         const mimeLabel = mime.split('/')[0].toUpperCase();
         if (uiDirectLabel) {
           uiDirectLabel.textContent = `${t('btnDirect')} (${mimeLabel})`;
         }
         if (uiDirectImportSection) {
           uiDirectImportSection.classList.remove('hidden');
         }
         if (btnDirectImport) {
           removeFormatBtnDisabled(btnDirectImport);
            btnDirectImport.classList.add('active');
            btnDirectImport.setAttribute('aria-pressed', 'true');
         }
          uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
          });
         currentFormat = 'direct';
         updateCaptureButtonLabel();
         return;
       }
     } catch (e) {
        console.warn('[MC] DETECT_MIME — requête échouée:', e?.message);
       // Skip silencieux : comportement page web ordinaire
     }

     // 1. Détection prioritaire Google Drive
     if (window.ClipperUtils && window.ClipperUtils.parseDriveUrl) {
         const driveInfo = window.ClipperUtils.parseDriveUrl(url);
         if (driveInfo) {
             const driveBtn = document.getElementById('btn-drive-import');
             if (driveBtn) {
                 isDriveExclusiveMode = true;
                 driveBtn.style.display = 'flex';
                 driveBtn.classList.remove('hidden');

                 if (driveInfo.typeStr === 'file') {
                     // Fichier hébergé sur Drive → Drive + Screenshot
                     uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
                          b.classList.remove('active');
                          b.setAttribute('aria-pressed', 'false');
                          if ([...PDF_MODES, ...MD_MODES, 'url'].includes(b.dataset.format)) {
                              b.style.display = 'none';
                          }
                      });
                 } else {
                     // Google Workspace (Docs/Sheets/Slides) → Drive exclusif
                     uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
                          b.classList.remove('active');
                          b.setAttribute('aria-pressed', 'false');
                          if ([...PDF_MODES, ...MD_MODES, 'url', ...SCREENSHOT_MODES].includes(b.dataset.format)) {
                              b.style.display = 'none';
                          }
                      });
                 }

                  driveBtn.classList.add("active");
                  driveBtn.setAttribute('aria-pressed', 'true');
                 currentFormat = "drive";
                 updateCaptureButtonLabel();
                 return;
             }
         }
     }

     // 2. Fallback pour fichiers réguliers via background script
     const result = await browser.runtime.sendMessage({ action: "DETECT_FILE_TYPE", url });
     detectedFileInfo = result;

     if (result && result.directImport) {
       // Afficher le bouton Import Direct avec le label du type détecté
       uiDirectLabel.textContent = `${t('btnDirect')} (${result.label})`;
       uiDirectImportSection.classList.remove('hidden');

      if (result.isLocal) {
         // === Fichier local : tout griser + message informatif ===
          uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
            setFormatBtnDisabled(b);
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
          });
          setFormatBtnDisabled(btnDirectImport);
         currentFormat = 'direct';
         updateStatus(t('warnLocalFile'), "info");
         updateCaptureButtonLabel();
       } else {
         // === Fichier distant : bouton Import Direct normal ===
         applyButtonVisibility(result);
       }
     }
   } catch (e) {
      console.warn('[MC] Détection fichier échouée:', e.message);
   }
}

/**
 * Applique la matrice de visibilité des boutons selon le type de fichier détecté.
 * 
 * Règles :
 * - Image/Audio/Video : PDF et MD grisés (n'ont pas de sens)
 * - Audio/Video : Screenshot grisé aussi
 * - Fichier local (file://) : URL grisé 
 */
function applyButtonVisibility(fileInfo) {
   const urlBtn = uiFormatToggle.querySelector('[data-format="url"]');

   // Images : PDF/MD n'ont pas de sens (Readability sur un viewer d'image = garbled)
   if (fileInfo.category === 'image') {
      disableFormatGroup([...PDF_MODES, ...MD_MODES]);
    }

   // Audio/Vidéo : PDF/MD/Screenshot n'ont aucun sens
   if (fileInfo.category === 'audio' || fileInfo.category === 'video') {
      disableFormatGroup([...PDF_MODES, ...MD_MODES, ...SCREENSHOT_MODES]);
    }

   // Fichier local : URL grisé (Google ne peut pas scraper file://)
   if (fileInfo.isLocal && urlBtn) {
      setFormatBtnDisabled(urlBtn);
    }

   // Si le format actif est maintenant désactivé, basculer sur Import Direct
   const activeBtn = uiFormatToggle.querySelector('.format-btn.active');
   if (activeBtn && activeBtn.classList.contains('btn-disabled')) {
      activeBtn.classList.remove('active');
      activeBtn.setAttribute('aria-pressed', 'false');
      btnDirectImport.classList.add('active');
      btnDirectImport.setAttribute('aria-pressed', 'true');
      currentFormat = 'direct';
      updateCaptureButtonLabel();
    }
}

/**
 * Vérifie s'il y a une sélection de texte en attente (capturée via le menu contextuel).
 * Si oui, affiche le bandeau et bascule sur le format "selection".
 */
async function checkPendingSelection() {
   try {
     const data = await browser.storage.local.get('nwc_pending_selection');
     const sel = data.nwc_pending_selection;
     
     if (!sel || !sel.text) return;
     
     // Ignorer les sélections trop anciennes (> 2 min)
     if (Date.now() - sel.timestamp > 2 * 60 * 1000) {
       await browser.storage.local.remove('nwc_pending_selection');
       return;
     }
     
     pendingSelection = sel;
     
     // Afficher le bandeau avec aperçu
     const wordCount = sel.text.split(/\s+/).filter(w => w.length > 0).length;
     const preview = sel.text.substring(0, 60) + (sel.text.length > 60 ? '…' : '');
     uiSelectionPreview.textContent = `"${preview}" (${wordCount})`;
     uiSelectionBanner.classList.remove('hidden');
     
     // Basculer sur le format "selection" et griser TOUS les boutons de format
     // (la sélection ne supporte qu'un seul mode : texte source)
      uiFormatToggle.querySelectorAll('.format-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
        setFormatBtnDisabled(b);
      });
      // Griser aussi le bouton Import Direct s'il est visible
      if (btnDirectImport) setFormatBtnDisabled(btnDirectImport);
     
     currentFormat = 'selection';
     updateCaptureButtonLabel();
     
     // Activer le bouton si un carnet est déjà sélectionné
     if (currentSelectedNotebookId) {
       btnCapture.disabled = false;
     }
     
     // Marquer la sélection comme vue (elle sera supprimée au prochain checkPendingSelection)
     await browser.storage.local.remove('nwc_pending_selection');
   } catch (e) {
      console.warn('[MC] Erreur vérification sélection:', e.message);
   }
}

/** Restaure l'état initial de l'UI après une capture réussie ou échouée. */
function resetUI() {
  btnCapture.disabled = false;
  uiSearchInput.disabled = false;
  btnCustomSpinner.classList.add('hidden');
  // Nettoyer le keepAlive et le timer de sécurité
  closeKeepAlivePort();
  if (safetyResetTimer) { clearTimeout(safetyResetTimer); safetyResetTimer = null; }
}

/** Met à jour le message de statut, avec lien optionnel vers le carnet et bouton de téléchargement. */
function updateStatus(message, type, linkUrl, showDownload) {
  // Construction DOM sécurisée (pas de innerHTML)
  uiStatusMessage.replaceChildren();
  const displayMessage = (type === 'error') ? `⚠️ ${message}` : message;
  uiStatusMessage.appendChild(document.createTextNode(displayMessage));
  
  if (linkUrl) {
    const link = document.createElement('a');
    link.href = linkUrl;
    link.target = '_blank';
    link.textContent = ' ' + t('linkOpenNotebook');
    link.className = 'status-link';
    uiStatusMessage.appendChild(link);
  }
  
  if (showDownload) {
    const ext = MD_MODES.includes(currentFormat) ? ".md" : ".pdf";
    const dlLink = document.createElement('a');
    dlLink.href = '#';
    dlLink.textContent = ' ' + t('linkDownloadFile').replace('{ext}', ext);
    dlLink.className = 'download-link';
    dlLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dlLink.textContent = ' ' + t('linkDownloading');
      browser.runtime.sendMessage({ action: "DOWNLOAD_CAPTURE" }).then(res => {
        if (res && res.ok) {
          dlLink.textContent = ' ' + t('linkDownloaded');
        } else {
          dlLink.textContent = ' ' + t('errDownload');
        }
      }).catch(() => {
        dlLink.textContent = ' ' + t('errDownload');
      });
    });
    uiStatusMessage.appendChild(dlLink);
  }
  
  if(type === "error") uiStatusMessage.style.color = "var(--status-error)";
  else if (type === "success") uiStatusMessage.style.color = "var(--status-success)";
  else uiStatusMessage.style.color = "var(--text-muted)";
}

/** Met à jour le badge d'état de connexion (texte + classe CSS). */
function updateAuthStatus(text, cssClass) {
  uiAuthStatus.textContent = text;
  uiAuthStatus.className = `status-badge ${cssClass}`;
}

// Bouton Fermer (en bas de la popup, autonome pour mobile et desktop)
document.getElementById('btn-close').addEventListener('click', () => {
  window.close();
});

browser.runtime.onMessage.addListener(message => {
  if (message.type === "STATUS_UPDATE") {
    let displayText;
    if (message.i18nKey) {
        let subs = message.i18nSubs;
        // background.js envoie parfois un objet {ext: "PDF"}, on le convertit en tableau pour t()
        if (subs && typeof subs === 'object' && !Array.isArray(subs)) {
            subs = Object.values(subs);
        }
        displayText = t(message.i18nKey, subs);
    } else {
        displayText = message.status === "error"
            ? (message.text || message.userMessage || t('errGenericOccurred'))
            : (message.text || message.userMessage || "");
    }
    updateStatus(displayText, message.status, message.linkUrl, message.showDownload);
    if(message.status === "error" || message.status === "success") {
      resetUI();
      if (message.status === "success") {
        if (intentInput) intentInput.value = "";
        if (intentCounter) intentCounter.textContent = "0 / 300";
      }
    }
  }
});

// Intercepter les clics sur les liens dans la zone de statut
// (les <a href> dans une popup d'extension ne s'ouvrent pas naturellement)
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (link && link.href && !link.href.startsWith('#') && link.href !== '#') {
    e.preventDefault();
    browser.tabs.create({ url: link.href });
  }
});
