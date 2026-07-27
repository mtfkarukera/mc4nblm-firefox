# 📎 Magic Clipper for Gemini Notebook — Extension Firefox MV3

Capturez le contenu de n'importe quelle page web et importez-le directement dans un carnet **Google Gemini Notebook** (anciennement NotebookLM) — en **PDF**, **Markdown**, **URL directe**, **Screenshot**, **Import Direct**, **Sélection de texte** ou **☁️ Google Drive natif**. Compatible **Firefox Desktop et Android**. Optimisé pour l'analyse par Gemini (grounding IA intégré).

---

## ✨ Fonctionnalités Principales

| Mode d'import | Description & Usage |
| --- | --- |
| **📄 PDF** | Extraction du contenu principal via Readability.js, génération PDF locale avec images intégrées, tables et métadonnées IA (grounding). |
| **📝 Markdown** | Export en Markdown pur avec tables *pipe-delimited* parfaitement formatées. |
| **🔗 URL directe** | Gemini Notebook scrape la page lui-même. Instantané, zéro traitement client. |
| **📸 Screenshot** | Capture du viewport visible en PNG haute résolution. |
| **⚡ Import Direct** | Détection automatique de ~50 formats de fichiers (PDF, DOCX, PPTX, images, audio, vidéo) avec téléversement sans conversion. |
| **📋 Sélection** | Clic droit sur du texte sélectionné ➔ « 📎 Clipper la sélection dans Gemini Notebook ». |
| **☁️ Google Drive** | Import synchronisable de Google Docs, Sheets, Slides et fichiers hébergés sur Drive. |

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

---

## 📜 Historique des Versions (Changelog)

L'historique complet des versions et corrections est disponible dans le fichier journal :

👉 **[Consulter CHANGELOG.md](CHANGELOG.md)**

### Dernières versions :
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
