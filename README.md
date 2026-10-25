# 📎 Magic Clipper for Gemini Notebook — Extension Firefox MV3

![Release](https://img.shields.io/badge/release-v6.3.1-blue.svg)
![License](https://img.shields.io/badge/license-MPL--2.0-green.svg)

Capturez le contenu de n'importe quelle page web et importez-le directement dans un carnet **Google Gemini Notebook** (anciennement NotebookLM) — avec **8 modes personnalisables** (**PDF**, **PDF Riche**, **PDF Images pleine page**, **Markdown**, **Markdown Riche**, **URL / YouTube / Drive**, **Capture écran visible**, **Capture page entière**), **Import Direct** ou **Sélection de texte**. Compatible **Firefox Desktop et Android**. Optimisé pour l'analyse par Gemini (grounding IA intégré).

---

## ✨ Fonctionnalités Principales & Barre Personnalisable (⚙️)

Personnalisez votre barre d'outils via le bouton **⚙️ Paramètres** en affichant de **2 à 4 modes** parmi les 8 disponibles :

| Mode d'import | Description & Usage |
| --- | --- |
| **📄 PDF (Simple)** | Extraction Readability.js + fallback DOM et tableaux aplatis, sans images (ultra-rapide). |
| **📑 PDF Riche (PDF+)** | Extraction complète avec images intégrées, tableaux bordés, citations et blocs de code stylisés. |
| **🖼️ PDF Images** | Capture visuelle de la page entière découpée en pages PDF A4 (contourne le filtre *Vision Safety* Google sur les images autonomes). |
| **📝 Markdown (Simple)** | Export en Markdown pur avec tables *pipe-delimited* parfaitement formatées. |
| **✨ Markdown Riche (MD+)** | Export Markdown conservant le gras, l'italique, le code inline, les liens hypertextes, les images et les tables. |
| **🔗 URL / YouTube / Drive** | Mode essentiel (toujours actif) : Gemini Notebook scrape la page ou la vidéo YouTube, avec bascule automatique vers **☁️ Google Drive** ou **⚡ Import Direct**. |
| **📸 Capture écran visible** | Capture uniquement la zone visible de l'onglet en PNG haute résolution. |
| **📜 Capture page entière** | Capture l'intégralité de la page défilante en PNG via l'API native Firefox `captureVisibleTab(rect)`. |
| **⚡ Import Direct** | Détection automatique de ~50 formats de fichiers (PDF, DOCX, PPTX, images, audio, vidéo) avec téléversement sans conversion. |
| **📋 Sélection** | Clic droit sur du texte sélectionné ➔ « 📎 Clipper la sélection dans Gemini Notebook ». |

---

## 🏛️ Architecture & Documentation Technique

Pour une description approfondie de la structure interne, du modèle de **Lazy Loading**, de la sécurité CSP et du passage de messages, consultez la documentation dédiée :

👉 **[Voir ARCHITECTURE.md](ARCHITECTURE.md)**

---

## 🚀 Installation & Prise en Main

### ⚠️ Prérequis

Avant d'utiliser l'extension, **chaque compte Google** que vous souhaitez utiliser doit s'être connecté à Gemini Notebook au moins une fois :

1. Rendez-vous sur [notebooklm.google.com](https://notebooklm.google.com/) dans un onglet.
2. Assurez-vous que la liste de vos carnets s'affiche.
3. L'extension détecte automatiquement vos comptes connectés et propose un sélecteur multi-comptes dans la popup.

### Options d'installation

- **Fichier XPI signé** : Téléchargez la dernière version compilée dans le dossier `dist/` ou sur les [Releases GitHub](https://github.com/mtfkarukera/mc4nblm-firefox/releases), puis glissez le fichier `.xpi` dans `about:addons`.
- **Développement local** : Ouvrez `about:debugging` ➔ **Ce Firefox** ➔ **Charger un module complémentaire temporaire...** ➔ choisissez `manifest.json`.

### 🛡️ Restriction Serveur Google : Message « Ce contenu d'image n'est pas accepté »

Lors de l'utilisation du mode **📸 Screenshot** ou de l'**⚡ Import Direct d'image** (`PNG`, `JPEG`), il peut arriver qu'une source apparaisse en rouge dans votre carnet Gemini Notebook avec l'infobulle :
> **« Ce contenu d'image n'est pas accepté. »** *(« This image content is not supported / accepted »)*

**Ce blocage ne provient pas d'un bug de Magic Clipper**, mais du filtre de modération visuelle automatisé (*Vision Safety Filter*) des serveurs de Google Gemini Notebook :
- Google applique une politique de filtrage très stricte sur les fichiers **images autonomes** (`image/png`, `image/jpeg`) et rejette fréquemment les captures d'écran contenant des **visages humains** (photos, avatars ou personnages dessinés par IA) ainsi que certains aperçus d'interfaces de messagerie (courriels avec champs `De` / `À`).
- **Solutions de contournement immédiates :**
  1. **Utiliser le mode 📄 PDF (Recommandé)** : Le parseur PDF de Gemini Notebook n'applique pas cette restriction aux illustrations intégrées dans un document. Vos images et schémas y seront importés sans blocage.
  2. **Faire défiler la page (Scroll)** : Si vous souhaitez uniquement une capture d'écran PNG, faites défiler la page pour que le portrait ou l'illustration concernée ne soit plus visible à l'écran avant de lancer la capture.

---

## 📜 Historique des Versions (Changelog)

L'historique complet des versions et corrections est disponible dans le fichier journal :

👉 **[Consulter CHANGELOG.md](CHANGELOG.md)**

### Dernières versions :
- **v6.3.1** : Intégration de la localisation portugaise complète (PT, 7 langues supportées au total), barre d'outils sur-mesure (2 à 4 modes parmi 8 via ⚙️), trio PDF (Simple, PDF+, PDF Images A4), Markdown+ riche, captures pleine page PNG et 14 icônes vectorielles SVG Jour/Nuit.
- **v6.2.6** : Correctif critique du pipeline d'upload Scotty pour les captures d'écran (restauration du domaine `notebook.google.com/upload/_/` pour préserver les cookies `OSID`, restauration du header `Content-Type: application/x-www-form-urlencoded;charset=utf-8` à la finalisation, alignement `source-path=/notebook/{id}` et table de secours MIME).
- **v6.2.5** : Correctif critique d'ingestion multimodale Scotty (déclaration explicite du header `x-goog-upload-header-content-type`, modernisation du template RPC `o4cbdc` Gemini 3.5, conversion C++ native directe des captures d'écran).
- **v6.2.4** : Correctif sécurité & robustesse (confinement RAM volatile des cookies maîtres, cloisonnement des messages, élimination de la race condition d'onglet, timeouts RPC, Roving Tabindex WAI-ARIA et refonte accessible du bouton Fermer).
- **v6.2.3** : Migration critique vers le nouveau domaine officiel `notebook.google.com`.
- **v6.2.2** : Correctif critique de la clé CSRF multi-comptes (`ROB-2`), rétablissant la récupération instantanée des carnets.
- **v6.2.1** : Adoption officielle du nom **Google Gemini Notebook** (anciennement NotebookLM) avec support de 6 locales (FR, EN, GCF, ES, DE, VI).
- **v6.2.0** : Audit complet sécurité (SSRF image proxy), robustesse (base64 async, timeout HEAD), accessibilité (`aria-busy`, touch targets 44px) et polish CSS Glassmorphism.

---

## 📝 Crédits et Références

- **[notebooklm-py](https://github.com/teng-lin/notebooklm-py)** — Rétro-ingénierie API RPC NotebookLM
- **[jsPDF](https://github.com/parallaxis/jsPDF)** — Génération PDF côté client
- **[Readability.js](https://github.com/mozilla/readability)** — Extraction de contenu principal par Mozilla
- **Mozilla WebExtensions** — [Documentation MV3 Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

---

*Développé par **MTF Karukera**. Découvre toutes les solutions logicielles et outils de productivité de la suite **magic-softs** sur [magic-clipper.mtfk.fr](https://magic-clipper.mtfk.fr/).*
