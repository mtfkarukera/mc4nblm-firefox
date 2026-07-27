# 🏗️ Architecture Technique — Magic Clipper for Gemini Notebook

> **Extension Firefox (Manifest V3)**  
> **Auteur & Conception** : MTF Karukera  
> **Version de référence** : v6.2.2 (Juillet 2026)

---

## 1. Vue d'Ensemble

**Magic Clipper for Gemini Notebook** est une extension WebExtension Manifest V3 pour Mozilla Firefox (compatible Desktop & Android 142.0+). Elle permet d'extraire le contenu de n'importe quelle page web et de l'importer de manière structurée dans Google Gemini Notebook (anciennement NotebookLM).

```
   ┌─────────────────────────────────────────────────────────┐
   │                      POPUP UI                           │
   │  (popup.html / popup.js / popup.css / 6 locales)         │
   └───────────────────────────┬─────────────────────────────┘
                               │ (browser.runtime.sendMessage)
                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │                  BACKGROUND SCRIPT                      │
   │  (background.js — MV3 Event Page, non permanent)        │
   │  ├── auth_personal.js (Cookies SID/HSID + CSRF SNlM0e)  │
   │  └── rpc_client.js    (batchexecute LabsTailwindUi)      │
   └──────────────┬──────────────────────────┬───────────────┘
                  │                          │
 (browser.scripting.executeScript)      (fetch / CORS-exempt)
                  │                          │
                  ▼                          ▼
   ┌─────────────────────────────┐   ┌───────────────────────┐
   │    ACTIVE TAB CONTENT       │   │ GOOGLE GEMINI NOTEBOOK│
   │  orchestrator.js            │   │ notebooklm.google.com │
   │  ├── Readability.js         │   └───────────────────────┘
   │  ├── jspdf.umd.min.js       │
   │  ├── serializer.js          │
   │  ├── pdf_generator.js       │
   │  └── md_generator.js        │
   └─────────────────────────────┘
```

---

## 2. Composants Principaux

### 2.1 Background Script (`src/background/`)

- **`background.js`** : Routeur central et chef d'orchestre des 7 pipelines d'import.
  - Déclare les scripts en tant qu'Event Page MV3 (`background.scripts` avec `"type": "module"`).
  - Reçoit les messages `START_CAPTURE`, `GET_NOTEBOOKS`, `CLIP_SELECTION`, etc.
  - Injecte les scripts de génération à la demande (Lazy Loading).
  - Proxy les requêtes HTTP d'images cross-origin (`FETCH_IMAGE`) avec `credentials: 'omit'` (conforme SEC-1).
  - Gère les menus contextuels universels ("Clip selection").

- **`api/auth_personal.js`** :
  - Interroge le cookie jar Firefox (`https://notebooklm.google.com/`) pour récupérer la session active (SID, HSID, SSID, etc.).
  - Extrait le token CSRF dynamique (`SNlM0e`) depuis la page d'accueil de NotebookLM.
  - Enregistre le token sous la clé indexée `nblm_csrf_${authuserIndex}` et sous la clé globale `nblm_csrf` pour assurer l'isolement multi-comptes sans régression.

- **`api/rpc_client.js`** :
  - Client RPC batchexecute envoyant les requêtes vers `https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute`.
  - RPC IDs pris en charge :
    - `wXbhsf` : Listing des carnets
    - `CCqFvf` : Création de carnet
    - `izAoDd` : Import Texte / URL / Google Drive
    - `o4cbdc` : Register upload resumable (fichiers binaires & PNG)

- **`detection.js`** :
  - Détecte dynamiquement le type de contenu de l'onglet actif (Page web, PDF, Image, Média, Google Docs/Sheets/Slides, Fichier Drive hébergé).
  - Utilise des requêtes HEAD avec timeout (`AbortSignal.timeout(5000)`) pour identifier le Content-Type.

---

### 2.2 Content Scripts & Lazy Loading (`src/content/`)

Afin d'optimiser l'empreinte mémoire et respecter les directives de performance Firefox MV3, les content scripts fonctionnent selon un modèle de **Lazy Loading séquentiel** :

1. **Statique** : Seul `orchestrator.js` est injecté au chargement des pages via `manifest.json`.
2. **À la demande** : Lors du clic sur "Capturer" dans la popup, `background.js` injecte dynamiquement les modules nécessaires via `browser.scripting.executeScript()` :
   - Pipeline PDF : `lib/Readability.js` ➔ `lib/jspdf.umd.min.js` ➔ `serializer.js` ➔ `pdf_generator.js`
   - Pipeline Markdown : `lib/Readability.js` ➔ `serializer.js` ➔ `md_generator.js`
3. **Sentinelles** : Chaque module enregistre une sentinelle sur `window` (ex: `window.nwcserializer`) pour éviter toute réinjection multiple sans utiliser `eval()`.

---

### 2.3 Interface Utilisateur (`src/popup/`)

- **`popup.html` / `popup.js` / `popup.css`** :
  - Design Glassmorphism modernisé (`backdrop-filter: blur(12px) saturate(180%)`).
  - Support natif du mode sombre (`prefers-color-scheme`).
  - Matrice de visibilité adaptative masquant ou débloquant les boutons d'import selon le type de page.
  - Champ d'annotation d'intention (*Intent Note*) injecté en en-tête des documents PDF/MD.
  - Internationalisation complète via `t()` et `applyI18n()` (support des locales natifs et de la locale hybride créole `gcf`).

---

## 3. Sécurité & Conformité CSP

- **Zéro `innerHTML`** : La manipulation du DOM s'effectue exclusivement via `createElement`, `textContent` et `replaceChildren`.
- **Conformité CSP MV3** : `script-src 'self'; object-src 'none'`. Aucun `eval()` ou `new Function()`.
- **Isolation Réseau** : Tous les échanges avec l'API Google Gemini Notebook transitent exclusivement par le background script (exempt CORS). Les content scripts n'effectuent aucun appel réseau direct.
- **Protection des identifiants** : Les cookies et jetons CSRF sont manipulés en mémoire isolée WebExtension (`browser.storage.local`) et ne sont jamais journalisés en console.

---

## 4. Internationalisation (i18n)

L'extension supporte 6 langues :
- 🇬🇧 Anglais (`en` — locale par défaut)
- 🇫🇷 Français (`fr`)
- 🇩🇪 Allemand (`de`)
- 🇪🇸 Espagnol (`es`)
- 🇻🇳 Vietnamien (`vi`)
- 🇬🇵 Créole guadeloupéen (`gcf` — locale hybride avec moteur de chargement custom dans `utils.js`)

---

## 5. Licences & Dépendances Tierces

- **jsPDF 2.5.2** (`lib/jspdf.umd.min.js`) — Licence MIT (génération PDF côté client).
- **Readability.js** (`lib/Readability.js`) — Licence Apache 2.0 (Mozilla article extractor).

---

*Documentation technique maintenue par **MTF Karukera**.*