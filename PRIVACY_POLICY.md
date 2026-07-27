# Privacy Policy — Magic Clipper for NotebookLM

**Last updated:** July 27, 2026

---

## English

**Magic Clipper for NotebookLM** is a Firefox browser extension developed by **MTF Karukera**.

### Data Collection
This extension **does not collect, store, transmit, or share any personal data**. It operates **100% locally** within your browser.

### How It Works
- The extension reads the content of the active web page **only when you explicitly trigger a capture** (via the popup button or context menu).
- Captured content (PDF, Markdown, screenshot, or URL) is sent **directly to Google NotebookLM** using your existing Google session cookies, without passing through any third-party server.
- No data is sent to the developer or any analytics service.

### Permissions Justification

| Permission | Purpose |
|---|---|
| `storage` | Store user preferences (active account index, locale selection) locally in the browser profile. |
| `cookies` | Read existing Google session cookies to authenticate requests to NotebookLM (no cookies are created or modified). |
| `activeTab` | Access the content of the currently active tab when the user explicitly triggers a capture. |
| `notifications` | Display OS notifications when an import completes while the popup is closed. |
| `downloads` | Allow the user to download captured content (PDF/Markdown) to their local filesystem. |
| `contextMenus` | Add a "Clip selection" item to the right-click context menu. |
| `scripting` | Inject content scripts on-demand for PDF/Markdown generation (lazy loading). |
| `<all_urls>` (host) | Enable the context menu and content script on all web pages. Required for the selection clipping feature to work universally. |

### Third-Party Libraries
- **jsPDF 2.5.2** (MIT License) — Client-side PDF generation. No network calls.
- **Readability.js** (Apache 2.0 License) — Mozilla's article content extractor. No network calls.

### Contact
For questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/Aumusic/mc4nblm-firefox).

---

## Français

**Magic Clipper for NotebookLM** est une extension Firefox développée par **MTF Karukera**.

### Collecte de données
Cette extension **ne collecte, ne stocke, ne transmet et ne partage aucune donnée personnelle**. Elle fonctionne **100% localement** dans votre navigateur.

### Fonctionnement
- L'extension lit le contenu de la page web active **uniquement lorsque vous déclenchez explicitement une capture** (via le bouton popup ou le menu contextuel).
- Le contenu capturé (PDF, Markdown, capture d'écran ou URL) est envoyé **directement à Google NotebookLM** en utilisant vos cookies de session Google existants, sans passer par un serveur tiers.
- Aucune donnée n'est envoyée au développeur ni à un service d'analyse.

### Justification des permissions

| Permission | Utilisation |
|---|---|
| `storage` | Stocker les préférences utilisateur (index de compte actif, sélection de langue) localement dans le profil du navigateur. |
| `cookies` | Lire les cookies de session Google existants pour authentifier les requêtes vers NotebookLM (aucun cookie n'est créé ni modifié). |
| `activeTab` | Accéder au contenu de l'onglet actif lorsque l'utilisateur déclenche explicitement une capture. |
| `notifications` | Afficher des notifications système lorsqu'un import est terminé alors que la popup est fermée. |
| `downloads` | Permettre à l'utilisateur de télécharger le contenu capturé (PDF/Markdown) sur son système local. |
| `contextMenus` | Ajouter un élément « Clipper la sélection » au menu contextuel clic droit. |
| `scripting` | Injecter les scripts de contenu à la demande pour la génération PDF/Markdown (chargement paresseux). |
| `<all_urls>` (hôte) | Activer le menu contextuel et le script de contenu sur toutes les pages web. Requis pour que la fonctionnalité de clip de sélection fonctionne universellement. |

### Bibliothèques tierces
- **jsPDF 2.5.2** (Licence MIT) — Génération PDF côté client. Aucun appel réseau.
- **Readability.js** (Licence Apache 2.0) — Extracteur de contenu article de Mozilla. Aucun appel réseau.

### Contact
Pour toute question concernant cette politique de confidentialité, veuillez ouvrir un ticket sur le [dépôt GitHub](https://github.com/AuMusic/mc4nblm-firefox).

---

*Developed by **MTF Karukera**.*
