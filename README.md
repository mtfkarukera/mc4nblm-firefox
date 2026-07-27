# 📎 Magic Clipper for Gemini Notebook — Extension Firefox MV3

Capturez le contenu de n'importe quelle page web et importez-le directement dans un carnet **Google Gemini Notebook** (anciennement NotebookLM) — en **PDF**, **Markdown**, **URL directe**, **Screenshot**, **Import Direct**, **Sélection de texte** ou **☁️ Google Drive natif**. Compatible **Firefox Desktop et Android**. Optimisé pour l'analyse par Gemini (grounding IA intégré).

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
| --- | --- |
| **7 modes d'import** | 📄 PDF, 📝 Markdown, 🔗 URL, 📸 Screenshot, ⚡ Import Direct, 📋 Sélection, ☁️ Google Drive |
| **Internationalisation** | Support 100% en 6 langues (EN, FR, GCF, ES, DE, VI) avec basculement dynamique |
| **📸 Screenshot** | Capture le viewport visible en PNG via `captureVisibleTab()` |
| **⚡ Import Direct** | Détecte et importe ~50 types de fichiers (PDF, images, audio, vidéo, documents) |
| **📋 Clip de sélection** | Clic droit → « 📎 Clipper la sélection » → import du texte sélectionné |
| **Extraction Readability** | Contenu principal uniquement via [Readability.js](https://github.com/mozilla/readability) |
| **Images haute fidélité** | Data URIs + proxy CORS intégrés au PDF via `addImage()` |
| **Tables pipe-delimited** | En mode Markdown, tables parfaitement structurées pour Gemini |
| **Import URL natif** | Gemini Notebook scrape la page lui-même — zéro traitement client |
| **Grounding IA** | Titre, auteur, site, URL et date injectés dans les métadonnées |
| **Upload resumable** | Protocole Google 3 étapes (register → start → finalize) |
| **Téléchargement local** | Bouton "Télécharger ↓" après import (.pdf ou .md) |
| **Création de carnets** | Créez un nouveau carnet directement depuis l'extension |
| **Fast Research** | Barre de recherche avec debounce (300ms) |
| **Matrice de visibilité** | Boutons grisés automatiquement selon le type de fichier détecté |
| **Multi-comptes** | Sélecteur de compte Google intégré dans la popup |
| **Notification OS** | Notification système si la popup est fermée pendant l'import |
| **Résilience API** | Gestion d'erreurs robuste : validation structurelle des réponses RPC, 5 cas d'erreur couverts (API modifiée, session expirée, upload échoué, timeout, erreur inconnue), messages explicites à l'utilisateur, logs sanitisés (zéro fuite de tokens) |
| **Compatible Mobile** | Firefox Android : popup responsive, touch targets 48dp, détection plateforme |
| **☁️ Google Drive natif** | Import synchronisable de Google Docs, Sheets, Slides + fichiers hébergés (PDF, images...) |

### Comparaison des 7 modes

| Critère | 📄 PDF | 📝 Markdown | 🔗 URL | 📸 Screenshot | ⚡ Direct | 📋 Sélection | ☁️ Drive |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Vitesse** | ~3-5s | ~0.5s | **~0.1s** | ~1s | ~1-3s | ~0.5s | **~0.1s** |
| **Synchronisable** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Tables** | ✅ flattenTable | ✅ Pipe-delimited | ✅ Scraping | ❌ Image | ❌ | ✅ Texte brut | ✅ Natif |
| **Images** | ✅ Data URI | ❌ | ✅ Scraping | ✅ Viewport | ✅ Original | ❌ | ✅ Natif |
| **Pages protégées** | ✅ | ✅ | ❌ Paywall | ✅ | ✅ | ✅ | ✅ |
| **Téléchargement** | ✅ .pdf | ✅ .md | ❌ | ❌ | ❌ | ✅ .md | ❌ |
| **Fichiers binaires** | ❌ | ❌ | ❌ | ❌ | ✅ ~50 formats | ❌ | ❌ |

### ⚡ Formats supportés par l'Import Direct

L'Import Direct détecte automatiquement le type de fichier (via l'extension URL + `HEAD` request) et l'importe tel quel dans Gemini Notebook :

| Catégorie | Formats |
| --- | --- |
| **Documents** | PDF, TXT, MD, DOCX, CSV, PPTX, EPUB |
| **Images** | PNG, JPEG, GIF, BMP, WebP, AVIF, TIFF, ICO, JP2, HEIC, HEIF |
| **Audio** | MP3, WAV, OGG, AAC, M4A, AIFF, MIDI, OPUS, AMR, WMA, RA, AU |
| **Vidéo** | MP4, MPEG, AVI, 3GP, 3G2 |

### 📋 Clip de sélection (menu contextuel)

Sélectionnez du texte sur n'importe quelle page, faites un clic droit → **« 📎 Clipper la sélection dans Gemini Notebook »**. Le texte est capturé avec son formatage HTML, et la popup s'ouvre pour choisir le carnet cible. Les métadonnées de grounding (URL source, titre, date) sont automatiquement injectées.

---

## 🏗️ Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Popup (UI)    │────▶│  Background.js   │────▶│  Gemini Notebook API│
│  popup.html/js  │     │  (Event Page)    │     │  /batchexecute      │
│  7 modes import │     │  Routeur central │     │  /upload/_/         │
│  Sélecteur i18n │     │  CORS proxy img  │     │                     │
│  Sélection clip │     │  Context menu    │     │                     │
└─────────────────┘     └──────┬───────────┘     └─────────────────────┘
                               │ (Lazy Loading via executeScript)
                        ┌──────▼───────────┐
                        │  Content Script  │
                        │  orchestrator.js   │  ← Route PDF/MD + GET_SELECTION_HTML
                        │  serializer.js     │  ← Readability + data URIs (injecté à la demande)
                        │  pdf_generator.js  │  ← jsPDF + addImage (injecté à la demande)
                        │  md_generator.js   │  ← Markdown pipe-delimited (injecté à la demande)
                        └────────────────────┘
```

### 7 pipelines d'import

| Mode | Pipeline | RPC |
| --- | --- | --- |
| **📄 PDF** | Content Script → Serializer → jsPDF → Upload resumable 3 étapes | `o4cbdc` + upload |
| **📝 Markdown** | Content Script → Serializer → MD Generator → RPC texte direct | `izAoDd` (Text) |
| **🔗 URL** | Zéro content script → URL de l'onglet envoyée directement | `izAoDd` (URL) |
| **📸 Screenshot** | `captureVisibleTab()` → PNG Blob → Upload resumable | upload |
| **⚡ Direct** | Détection MIME → `fetch()` binaire → Upload resumable | upload |
| **📋 Sélection** | Menu contextuel → `GET_SELECTION_HTML` → `addTextSource` | `izAoDd` (Text) |
| **☁️ Drive** | Extraction File ID → `addDriveSource` → lien natif synchronisable | `izAoDd` (Drive) |

### Matrice de visibilité dynamique

Quand un fichier est détecté (ex: image, audio), les boutons non pertinents sont automatiquement grisés :

| Type détecté | PDF | MD | URL | 📸 | ⚡ Direct | ☁️ Drive |
| --- | --- | --- | --- | --- | --- | --- |
| **Page web** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Document (PDF, DOCX...)** | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Image** | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Audio / Vidéo** | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Google Docs / Sheets / Slides** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Fichier Drive hébergé** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Fichier local (file://)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Note** : Sur un fichier hébergé sur Google Drive (`drive.google.com/file/d/...`), la synchronisation Drive ne fonctionne que pour les documents textuels (PDF, DOCX, XLSX, PPTX...). Pour les images et médias, utilisez le mode 📸 Screenshot.

### Double authentification

| Type de compte | Méthode | Module |
| --- | --- | --- |
| **Personnel** | Extraction cookies (`SID`, `HSID`, `SSID`) + CSRF | `auth_personal.js` + `rpc_client.js` |
| **Workspace** | OAuth 2.0 + API Discovery Engine (STUB Sprint 7) | `auth_workspace.js` |

> 🔒 **Sécurité** : Cookies/jetons jamais exposés. `browser.storage.local` purgé automatiquement en cas d'erreur 401/403. DOM 100% sécurisé (zéro `innerHTML`).

---

## 🚀 Installation

### ⚠️ Prérequis

Avant d'utiliser l'extension, **chaque compte Google** que vous souhaitez utiliser doit avoir été connecté à Gemini Notebook (NotebookLM) au moins une fois :

1. Ouvrez un nouvel onglet et rendez-vous sur [notebooklm.google.com](https://notebooklm.google.com/)
2. Assurez-vous d'être connecté avec le compte Google souhaité
3. Attendez que la page d'accueil de Gemini Notebook se charge (la liste de vos carnets doit s'afficher)

> 💡 **Pourquoi ?** L'extension détecte vos comptes en interrogeant les cookies de session Gemini Notebook (NotebookLM). Si vous ne vous êtes jamais connecté à Gemini Notebook avec un compte, aucun cookie ne sera présent et le compte sera invisible pour l'extension. Se connecter simplement à Google (Gmail, Drive, etc.) ne suffit pas.

> 🔄 **Multi-comptes** : Si vous utilisez plusieurs comptes Google dans le même navigateur, répétez cette opération pour chacun d'eux. L'extension proposera alors un menu déroulant pour choisir le compte cible.

### Méthode 1 : Depuis le fichier XPI signé

1. Télécharger le fichier `.xpi` depuis `dist/`
2. Firefox → `about:addons` → ⚙️ → **"Installer un module depuis un fichier..."**

> ⚠️ XPI non signé : `about:config` → `xpinstall.signatures.required` = `false`

### Méthode 2 : Chargement temporaire

1. Firefox → `about:debugging` → **Ce Firefox**
2. **"Charger un module complémentaire temporaire..."** → sélectionner `manifest.json`

> Après modification : "Recharger" dans `about:debugging` + F5 sur la page cible.

### Méthode 3 : Via `web-ext`

```bash
npm install -g web-ext
cd mc4nblm-firefox
web-ext run
```

---

## 📦 Signature et distribution

```bash
brew install node
npm install -g web-ext
# Clés API : https://addons.mozilla.org/developers/addon/api/key/
./sign.sh VOTRE_JWT_ISSUER VOTRE_JWT_SECRET
```

---

## 📁 Structure du projet

```text
mc4nblm-firefox/
├── manifest.json                   # Manifest V3 Firefox (Event Page)
├── _locales/                       # Traductions i18n natives et hybrides
│   ├── en/, fr/, de/, es/, vi/     # Langues natives
│   └── gcf/                        # Créole guadeloupéen (chargement custom)
├── lib/
│   ├── jspdf.umd.min.js            # jsPDF 2.5.2 standalone (injecté via lazy loading)
│   └── Readability.js              # Mozilla Readability.js (injecté via lazy loading)
├── src/
│   ├── background/
│   │   ├── background.js           # Routeur central + 7 pipelines + menu contextuel + i18n
│   │   └── api/
│   │       ├── auth_personal.js    # Extraction cookies + CSRF
│   │       ├── auth_workspace.js   # STUB Sprint 7 — OAuth 2.0 Workspace
│   │       └── rpc_client.js       # batchexecute + upload + addText + addUrl + addDrive
│   ├── content/
│   │   ├── orchestrator.js         # Point d'entrée (route PDF/MD + GET_SELECTION_HTML)
│   │   ├── serializer.js           # Readability + Reader Mode CSS + data URIs
│   │   ├── pdf_generator.js        # jsPDF (texte + images + tables)
│   │   └── md_generator.js         # Markdown (tables pipe-delimited)
│   ├── popup/
│   │   ├── popup.html              # Interface avec toggle 7 formats + sélecteur i18n
│   │   ├── popup.css               # Design Glassmorphism
│   │   └── popup.js                # Logique UI + sélecteur i18n + appel t() + sélection
│   └── shared/
│       └── utils.js                # Moteur i18n (t(), gcf), blobToBase64, parseDriveUrl
├── tools/                          # Outils Node.js de développement
│   ├── check-i18n.js               # Audit de complétude i18n
│   └── add-new-keys.js             # Injection par lot de clés de traduction
├── dist/                           # XPI empaquetés
├── sign.sh                         # Script de signature AMO
└── .gitignore
```

---

## ⚙️ Décisions techniques clés

| Problème | Solution |
| --- | --- |
| `html2canvas` → `SecurityError` en MV3 | **jsPDF direct** avec rendu manuel |
| Images cross-origin | **Tainted Canvas Protection** : proxy CORS background → data URIs |
| Pages polluées | **Readability.js** extrait le contenu principal |
| Tables mal rendues par NBLM | **Mode Markdown** avec tables pipe-delimited |
| Pages publiques simples | **Mode URL** : Gemini Notebook scrape la page lui-même |
| Pages protégées / intranet | **Mode PDF** (rendu visuel) ou **Mode Markdown** (données structurées) |
| YouTube (watch / shorts) | **Mode URL** : import natif automatique de la transcription |
| Fichiers hébergés / docs | **Mode Direct** (PDF, audio, vidéo...) ou **Mode Drive** (Doc/Sheet/Slide) |
| Morceau de texte spécifique | **Clip de sélection** (clic droit) |
| CORS sur API Gemini Notebook | `fetch()` dans le **background script** (exempt CORS) |
| Firefox ne supporte pas `service_worker` | `background.scripts` + `"type": "module"` |
| Upload PDF ignoré | **Protocole resumable** 3 étapes |
| Popup ferme le file picker | Fichiers locaux (`file://`) non supportés (restriction navigateur) |
| Sites institutionnels à dominante tabulaire | **Fallback DOM automatique** : signal tabulaire dans `_tryReadability()` — ratio tables conservées |

---

## 📋 Changelog récent

### v6.2.1 — Rebranding Gemini Notebook — Juillet 2026

#### 🏷️ Marque & Nommage
- Intégration complète de la dénomination officielle **Gemini Notebook** (anciennement NotebookLM) à travers l'extension (manifest, UI, popup, 6 locales, documentation et kit de soumission AMO)
- Preservation de la mention *(anciennement NotebookLM)* dans les métadonnées et descriptions pour l'indexation SEO / AMO

### v6.2.0 — Audit Sécurité, Robustesse & Design — Juillet 2026

#### 🔐 Sécurité
- Proxy d'images CORS : `credentials: 'omit'` pour prévenir les risques SSRF (SEC-1)

#### 🛡️ Robustesse
- `base64ToUint8Array` : conversion asynchrone via Fetch API, élimine le risque OOM sur fichiers volumineux (ROB-1)
- Cache CSRF indexé par `authuserIndex` pour éviter les collisions multi-comptes (ROB-2)
- Suppression du `setTimeout(30s)` sur `DOWNLOAD_CAPTURE` — nettoyage via `onChanged` uniquement (ROB-3)
- Timeout `AbortSignal.timeout(5000)` sur la requête HEAD de détection MIME (ROB-5)

#### ♿ Accessibilité
- `aria-busy="true"` sur le skeleton loader pendant le chargement des carnets (A11Y-2)
- Touch targets `min-height: 44px` pour `#account-switcher` et `.locale-selector` en mode tactile (A11Y-6)

#### 🎨 Design & UX
- Glassmorphism renforcé : `blur(12px) saturate(180%)` (D1)
- Transitions Material Design : `cubic-bezier(0.4, 0, 0.2, 1)` sur tous les éléments interactifs (D2)
- Contraste amélioré en dark mode : `--text-muted: #bdc1c6` (D3)
- Bordures dark mode plus visibles : `--border-color: rgba(255,255,255,0.15)` (D4)
- Ombre portée au survol du bouton primaire (D5)

### v6.1.0 — Accessibilité, Stabilité, Architecture & Polish — Juin 2026

#### ♿ Accessibilité (WCAG 2.1 AA)
- Labels ARIA, rôles et régions `aria-live` sur tous les éléments interactifs
- Navigation clavier complète sur tous les boutons et listes
- Support `prefers-reduced-motion`
- Toutes les chaînes UI hardcodées migrées vers l'i18n

#### 🛡️ Stabilité & Robustesse
- Persistance de session entre les redémarrages Firefox
- Mécanisme keepAlive du service worker
- Verrous de concurrence pour prévenir les captures en doublon
- Timeouts sur tous les appels RPC asynchrones

#### 🏗️ Architecture
- Refactoring complet en ES Modules (popup + background)
- Table de dispatch remplaçant les chaînes if/else
- Format de réponse d'erreur normalisé sur tous les handlers

#### ✨ Interface & Qualité
- Skeleton loader animé (3 barres pulsantes) pendant le chargement des carnets
- Couleurs inline remplacées par des variables CSS (thème clair/sombre automatique)
- Layout popup réécrit en Flex colonne : hauteur fixe 580px, plus de scrollbar externe
- `PDF_LAYOUT` : constante extraite dans `pdf_generator.js`
- 67 descriptions i18n ajoutées (EN), 7 corrections terminologiques FR (Screenshot→Capture d'écran, Upload→Téléversement)
- `check-i18n.js` renforcé : détection valeurs vides et placeholders non déclarés

#### 🐛 Correctifs
- **Critique** : popup réduite à un bandeau sur toutes les résolutions — `height:100vh` remplacé par `height:580px` (comportement non supporté dans les popups Firefox)
- Liste des carnets : hauteur adaptative via Flex, scrollbar interne fine et discrète

### v6.0.0 — Contrôle & Sanitarisation — Juin 2026

#### Corrections
- `pdf_generator.js` : correction bug `doc.y` → variable locale `y` dans `injectIntentHeader` (8 occurrences)

#### Nettoyage
- Tous les fichiers JS : suppression de tous les `console.log`, révision des `console.warn`/`console.error` (24 logs supprimés, conservés uniquement si alerte fonctionnelle, préfixés `[MC]`)
- Dead code supprimé : `safeRpcCall()`, `decodeResponse()`, `guessMimeFromTitle()` dans utils.js, bloc export CJS dans utils.js
- `auth_workspace.js` : converti en stub documenté Sprint 7

#### Sécurité & Conformité
- `manifest.json` : permission `identity` orpheline supprimée, CSP explicite ajoutée (`script-src 'self'; object-src 'none'`)

#### Documentation
- JSDoc exhaustive sur toutes les fonctions publiques de `rpc_client.js`, `serializer.js`, `background.js`
- JSDoc minimale ajoutée sur `auth_personal.js`, `orchestrator.js`, `md_generator.js`, `popup.js`, `utils.js`, `pdf_generator.js`
- `AGENTS.md` mis à jour v6.0.0 : noms de fichiers réels (underscores), 4 nouveaux pièges, handlers action complets

#### Nommages
- `START_CAPTURE` (flux background→content) renommé `CAPTURE_CONTENT` dans `background.js` et `orchestrator.js`
- `maxAccounts` → `MAX_ACCOUNTS` dans `auth_personal.js`
- Tous les `console.warn`/`console.error` conservés préfixés `[MC]`

#### Qualité
- `web-ext lint` : 0 erreur, 0 notice, 8 warnings tolérés (libs tierces bundlées + icône SVG)

### v5.6.1 — Correctifs Matrice Contextuelle
- **Import Direct** : le bouton URL reste disponible en parallèle sur les fichiers binaires détectés (PDF, images, audio, vidéo)
- **Clip de sélection** : "Télécharger le .md ↓" apparaît désormais dans la zone de statut après import réussi, cohérent avec le comportement de l'import Markdown classique

### v5.6.0 — Matrice Contextuelle
- **YouTube** : forçage automatique du mode URL sur `youtube.com/watch`, `youtu.be/` et `youtube.com/shorts/`
- **Import Direct** : détection binaire en deux étapes — extension URL puis requête HEAD (Content-Type) depuis le background, exempt CORS
- **Clip de sélection** : téléchargement local du `.md` depuis une sélection clippée, disponible après import réussi

### v5.5.1 — Fallback tabulaire automatique
- fix(serializer): 3e signal de rétention dans `_tryReadability()`
  — fallback DOM déclenché automatiquement si Readability supprime
  plus de 50% des tables (originalTables >= 2 && tableRetention < 0.50)
- Signal indépendant des signaux texte+structure (logique ||)
- Zéro hardcoding de domaines — solution générique (sites
  institutionnels, juridiques, conventions collectives...)
- Logs enrichis : métrique tables XX% (N→M) dans les deux cas
  (rejet et validation)
- Fichiers modifiés : `src/content/serializer.js`, `manifest.json`,
  `README.md`. Aucune nouvelle permission demandée.

### v5.5.0 — Tableaux riches (colspan/rowspan)
- `pdfgenerator.js` : aplatissement colspan/rowspan dans le Custom
  Walker jsPDF via algorithme flattenTable (grille 2D)
- `mdgenerator.js` : même algorithme pour le rendu Markdown
  pipe-delimited
- Zéro régression sur les tableaux sans fusion
- Lint : 0 erreur, warnings uniquement sur libs tierces (attendus)

### v5.4.1
- fix(serializer): algorithme de rétention débruité pour bypass
  Readability sur documents structurés (DSFR / Légifrance)
  — double signal texte+structure (logique AND) sur dénominateur
  débruité. Résout la troncation silencieuse des documents
  juridiques longs. (#sprint-5.1)
- fix(serializer): remplacement de `innerHTML` par `DOMParser`
  dans `_tryReadability()` — conformité AMO complète.
- fix(serializer): enrichissement de `_cleanDomFallback()` avec
  les balises sémantiques (`header`, `footer`, `nav`, `aside`)
  et les classes DSFR (`.fr-header`, `.fr-footer`, `.fr-sidemenu`,
  `.fr-nav`).

### v5.4.0 — Mode Sombre Natif (Sprint 5)
- feat(ui) : Support automatique du mode sombre (Dark Mode) en fonction des préférences du système ou du navigateur. Implémentation 100% CSS (prefers-color-scheme) pour garantir zéro impact sur les performances et conserver la fluidité du glassmorphism.

### v5.3.1 — Ajustements i18n
- fix(i18n) : Corrections et affinage de la traduction en Créole guadeloupéen (GCF).

### v5.3.0 — Cohérence i18n complète (Sprint 4)
- feat(i18n) : Support complet et traduction à 100% pour l'allemand (DE), l'espagnol (ES) et le vietnamien (VI).
- refactor(i18n) : Migration de l'architecture de messages background pour le support total de la locale hybride Créole guadeloupéen (GCF).
- refactor(ui) : Éradication totale des chaînes hardcodées dans le HTML et les scripts. L'extension est 100% localisée.

### v5.2.3 — i18n complète : 3 nouvelles clés, 6 locales
- fix(i18n) : Ajout des clés `popupLabelFormat`, `popupStatusReady` et `btnClose` dans les 6 locales (FR, EN, ES, DE, VI, GCF).
- Fichiers modifiés : `_locales/*/messages.json`, `src/popup/popup.html`

### v5.2.2
- fix(i18n) : le sélecteur de langue est désormais pleinement opérationnel pour toutes les locales (updateCaptureButtonLabel migré vers t())

### v5.2.1 — Correctif sélecteur de langue
- Fix : options EN, ES, DE, VI manquantes dans le sélecteur de langue de la popup

### v5.2.0
- i18n : ajout des locales ES (espagnol), DE (allemand), VI (vietnamien)

### v5.1.0
- Internationalisation (i18n) : support EN / FR / Créole guadeloupéen (gcf)
- Sélecteur de langue dans la popup (Auto / Français / Kréyòl)
- Moteur i18n custom pour la locale gcf non reconnue nativement par Firefox

### v5.0.0 — Avril 2026

- **Lazy Loading (Sprint 3)** : Injection à la demande de `Readability.js` et `jsPDF` via `browser.scripting.executeScript`.
- **Déduplication** : Mécanisme de sentinelles globales (`window.nwc*`) pour garantir une injection unique, sans utilisation de `eval()`.
- **Réduction de l'empreinte mémoire** : Les content scripts massifs ne sont injectés que lors de l'utilisation des modes PDF et Markdown.
- **Sécurité AMO** : Refactoring conforme aux standards stricts de sécurité.

### v4.9.0 — Avril 2026

- **Résilience API** : validation structurelle systématique des réponses batchexecute avant consommation (`validateAndExtractRpcResponse`)
- **Deux classes d'erreurs normalisées** : `RpcApiChangedError` et `RpcError`
- **Handler centralisé** `safeRpcCall` couvrant 5 cas d'erreur
- **Sanitisation des logs** : aucun token/cookie ne peut fuiter en console
- **Messages d'erreur explicites** dans la popup (`userMessage`)
- **Purge automatique** du cache d'auth en cas de session expirée (401/403)

### v4.8.0 — Feature Annotation Intent Note

- **Note d'intention (Intent Note)** : Ajout d'un champ texte optionnel dans la popup avant capture.
- **Injection contextuelle** : La note est insérée avec un encart `[INTENTION DE RECHERCHE]` au début des documents PDF et Markdown générés (pour orienter l'IA contextuellement pendant l'ingestion par NotebookLM).
- **Architecture sans régression** : La feature respecte strictement la transmission des messages MV3 vers les content scripts. Le champ demeure 100% optionnel et ne modifie pas le pipeline formaté en son absence.

### v4.7.0 — UX Drive simplifiée + documentation des limitations

- **Fichiers Drive hébergés** : sur `drive.google.com/file/d/`, les boutons ☁️ Drive + 📸 Screenshot sont visibles (PDF, MD, URL masqués)
- **Google Workspace** : sur Docs/Sheets/Slides, seul le bouton ☁️ Drive est affiché (inchangé)
- **Limitation documentée** : la synchronisation Drive ne fonctionne que pour les documents textuels (PDF, DOCX, XLSX, PPTX, Google Docs/Sheets/Slides). Pour les images et médias, utiliser le mode Screenshot.
- **Simplification** : suppression du filtrage MIME par titre d'onglet (approche fragile remplacée par une UX à deux choix)

### v4.6.0 — Fichiers Google Drive

- **☁️ Drive étendu** : import natif des fichiers hébergés sur Google Drive
- **Détection `drive.google.com/file/d/`** : le bouton Drive apparaît sur les fichiers consultés dans le viewer Drive
- **Nettoyage titre** : retrait automatique du suffixe " - Google Drive" pour un grounding propre

### v4.5.1 — Fix payload Google Drive

- **Fix critique** : correction de la structure du payload RPC pour l'import Drive (suppression du wrapper 8-slots hérité de Text/URL, remplacé par le format direct 11-éléments conforme à la cassette VCR `notebooklm-py`)

### v4.5.0 — Import Google Drive natif

- **☁️ Google Drive** : 7ème mode d'import — liaison synchronisable avec Google Docs, Sheets et Slides
- **Détection automatique** : le bouton Drive apparaît exclusivement sur les URLs Google Workspace
- **Zéro sérialisation** : l'extension envoie directement le File ID via RPC, préservant le bouton natif "Cliquer pour synchroniser" dans NotebookLM
- **UX épurée** : sur un Google Doc, seul le bouton Drive est visible (les autres formats sont masqués)

### v4.4.0 — Optimisation & Stabilité

- **Fix critique** : paramètres `title`/`content` inversés dans l'import de sélection
- **Sécurité** : tous les boutons de format grisés quand une sélection est active
- **Stabilité mobile** : `contextMenus.removeAll()` + guard `?.onClicked` (évite le crash Android)
- **Performance** : timeout `AbortController` (10s) sur les fetches d'images
- **Mémoire** : `URL.revokeObjectURL()` après téléchargement local
- **Fix** : `DOWNLOAD_CAPTURE` retournait sans `return true` (fuite de promesse)
- **Logs** : réduction drastique de la verbosité console (conformité AMO)

### v4.3.x — Fonctionnalités

- **📋 Clip de sélection** via menu contextuel → import texte source
- **📸 Screenshot** mode captureVisibleTab → PNG
- **⚡ Import Direct** ~50 formats avec détection MIME + HEAD request
- **Matrice de visibilité** dynamique selon le type de fichier

---

## 📝 Crédits et références

- **[notebooklm-py](https://github.com/teng-lin/notebooklm-py)** — Rétro-ingénierie API RPC NotebookLM (source du payload Google Drive)
- **[jsPDF](https://github.com/parallaxis/jsPDF)** — Génération PDF côté client
- **[Readability.js](https://github.com/mozilla/readability)** — Extraction contenu principal
- **Mozilla WebExtensions** — [Documentation MV3](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

---

*Projet développé selon la méthodologie **Spec-Driven Development (SDD)**.*
*Version 6.1.0 — Juin 2026*
