# 🏗️ Architecture Technique — Magic Clipper for Gemini Notebook

> **Extension Firefox (Manifest V3)**  
> **Auteur & Conception** : MTF Karukera  
> **Version de référence** : v6.2.4 (Octobre 2026)

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
  - Résout l'onglet cible `targetTab` de manière déterministe dès l'initiation de la capture (suppression de race condition).
  - Cloisonne strictement les messages d'administration : seules les requêtes provenant de la popup (`!sender.tab`) peuvent exécuter les actions privilégiées.
  - Injecte les scripts de génération à la demande (Lazy Loading).
  - Proxy les requêtes HTTP d'images (`FETCH_IMAGE`) avec protection SSRF (blocage des IPs privées/loopback et validation `Content-Type: image/*`) et `credentials: 'omit'` (conforme SEC-1).
  - Gère les menus contextuels universels ("Clip selection").

- **`api/auth_personal.js`** :
  - Interroge le cookie jar Firefox (`https://notebook.google.com/`) pour récupérer la session active (SID, HSID, SSID, etc.).
  - Extrait le token CSRF dynamique (`SNlM0e`) depuis la page d'accueil de NotebookLM.
  - Enregistre les cookies maîtres et jetons CSRF exclusivement en mémoire vive volatile (`browser.storage.session`) sans jamais les écrire sur disque (`storage.local`).

- **`api/rpc_client.js`** :
  - Client RPC batchexecute envoyant les requêtes vers `https://notebook.google.com/_/LabsTailwindUi/data/batchexecute`.
  - Intègre des timeouts stricts (`AbortSignal.timeout`) de 30s à 180s pour prévenir les requêtes suspendues.
  - Intègre une conversion native Data URI ➔ Blob en C++ sans allocation massive synchrone.

- **`capture_store.js`** :
  - Gère la mise en cache de la dernière capture en `browser.storage.session` avec protection contre les dépassements de quota (`try/catch`).
  - Gère le verrou anti-concurrent `captureInProgress` avec auto-reset de sécurité (TTL 3 minutes).
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
  - Accessibilité WCAG 2.1 AA intégrée : navigation au clavier par Roving Tabindex sur `#notebook-list`, indicateurs `:focus-visible` nets, et bouton Fermer secondaire neutre certifié haute lisibilité (> 5.2:1 en clair, > 6.4:1 en sombre).

---

## 3. Sécurité & Conformité CSP

- **Zéro `innerHTML`** : La manipulation du DOM s'effectue exclusivement via `createElement`, `textContent` et `replaceChildren`.
- **Conformité CSP MV3** : `script-src 'self'; object-src 'none'`. Aucun `eval()` ou `new Function()`.
- **Isolation Réseau** : Tous les échanges avec l'API Google Gemini Notebook transitent exclusivement par le background script (exempt CORS). Les content scripts n'effectuent aucun appel réseau direct.
- **Protection des identifiants** : Les cookies maîtres Google et jetons CSRF sont manipulés en mémoire vive volatile WebExtension (`browser.storage.session`) et ne sont jamais journalisés en console ni persistés sur disque (`storage.local`).
- **Protection SSRF & Émetteurs** : Le proxy d'images filtre les adresses locales/privées et vérifie le header `Content-Type: image/*`. Le routeur de messages bloque les appels de gestion provenant d'onglets (`sender.tab`).

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