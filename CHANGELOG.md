# 📜 Journal des Modifications (CHANGELOG)

Toutes les modifications majeures apportées au projet **Magic Clipper for Gemini Notebook** sont répertoriées dans ce fichier par ordre chronologique inversé.

---

## [v6.2.4] — 2026-10-24

### 🛡️ Sécurité & Cloisonnement
- **SEC-1 (Émetteurs)** : Cloisonnement strict des messages du background script (`!sender.tab`). Les actions de gestion sensibles (`GET_ACCOUNTS`, `GET_NOTEBOOKS`, `CREATE_NOTEBOOK`, `START_CAPTURE`) sont désormais strictement inaccessibles depuis les content scripts des pages web tierces.
- **SEC-2 (SSRF)** : Protection avancée sur le proxy d'images `FETCH_IMAGE` avec blocage des hôtes locaux et adresses IP privées (`localhost`, `127.0.0.1`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`) et validation stricte du header `Content-Type: image/*`.
- **SEC-3 (Confinement RAM)** : Confinement des cookies maîtres Google et des jetons CSRF dans la mémoire vive volatile de l'extension (`browser.storage.session`). Élimination complète de la persistance de cookies sensibles sur le disque (`storage.local`).
- **SEC-4 & SEC-5 (Logs)** : Assainissement étendu des logs d'erreurs et masquage de l'ensemble des cookies de session Google et tokens d'authentification.

### ⚙️ Robustesse & Fiabilité
- **ROB-1 (IPC)** : Résolution systématique de la promesse `START_CAPTURE` via `sendResponse` dans toutes les branches d'exécution, éliminant tout blocage indéfini du canal de communication.
- **ROB-2 (Race Condition)** : Résolution déterministe de l'onglet actif (`targetTab`) dès l'initialisation du workflow, évitant toute bascule vers le mauvais onglet lors de changements rapides de focus.
- **ROB-3 (Réseau)** : Intégration de timeouts `AbortSignal.timeout` sur les appels RPC `batchexecute`, la détection de comptes et l'upload binaire resumable.
- **ROB-4 (Mémoire & Performance)** : Conversion directe Data URI ➔ Blob via l'API `fetch` native en C++, supprimant les ralentissements et pics mémoire de `atob()` sur les documents volumineux.
- **ROB-5 (Storage Quota)** : Protection défensive non-bloquante (`try/catch`) sur `saveCapture` et auto-reset de sécurité (TTL 3 min) sur le verrou de capture.

### ♿ Accessibilité (WCAG 2.1 AA) & Design UX
- **A11Y-1 (Clavier)** : Implémentation du pattern WAI-ARIA Roving Tabindex sur la liste des carnets (`#notebook-list`). Seul le carnet sélectionné porte `tabindex="0"`, permettant de traverser toute la liste en une seule tabulation `Tab`.
- **A11Y-2 & DES-1 (Contraste & Ergonomie)** : Refonte complète du bouton Fermer (`.close-btn`) en style secondaire neutre élégant, supprimant le rouge alerte destructif et garantissant des ratios de contraste certifiés WCAG AA (> 5.2:1 en mode clair, > 6.4:1 en mode sombre).
- **A11Y-3 (Focus)** : Ajout d'indicateurs de focus visibles et nets (`:focus-visible`) sur les éléments de carnets et le bouton Fermer.

---

## [v6.2.3] — 2026-07-31

### 🔴 Correctif Critique — Migration vers notebook.google.com
- **Migration Domaine Google** : Alignement de l'extension Web Clipper Firefox sur le nouveau domaine officiel de Google Gemini Notebook (`notebook.google.com`).
- **RPC & Authentification** : Mise à jour des endpoints RPC `batchexecute`, de l'upload resumable, de la lecture des cookies et du jeton CSRF vers `notebook.google.com` (avec fallback résilient sur `notebooklm.google.com`).

---

## [v6.2.2] — 2026-07-27

### 🐛 Correctifs
- **Authentification & RPC (ROB-2)** : Resolution du mismatch de clés de stockage CSRF entre `auth_personal.js` (`nblm_csrf_${authuserIndex}`) et `rpc_client.js` (`sendBatchExecute`/`uploadBlob`). Le token CSRF est désormais enregistré sous les deux clés (indexée et globale), résolvant définitivement l'erreur *"Impossible de récupérer vos carnets"*.

---

## [v6.2.1] — 2026-07-27

### 🏷️ Rebranding
- **Google Gemini Notebook** : Adoption officielle de la nouvelle dénomination produit (anciennement NotebookLM).
- **i18n & Métadonnées** : Mise à jour des libellés UI, descriptions et traductions dans les 6 langues (FR, EN, GCF, ES, DE, VI).
- **Indexabilité** : Maintien des mots-clés `(anciennement NotebookLM)` / `(formerly NotebookLM)` dans le README, le manifest et les formulaires AMO pour préserver le référencement.

---

## [v6.2.0] — 2026-07-27

### 🛡️ Sécurité & Robustesse
- **SEC-1 (SSRF)** : Ajout de `credentials: 'omit'` sur le proxy d'images CORS dans `background.js` afin d'éviter la transmission non sollicitée des cookies utilisateur aux serveurs tiers.
- **ROB-1 (OOM)** : Conversion asynchrone `base64ToUint8Array` via l'API Fetch native pour supprimer le pic d'allocation mémoire de `atob()` sur les fichiers volumineux.
- **ROB-2 (Multi-comptes)** : Cache des jetons CSRF indexé par `authuserIndex` (`nblm_csrf_${authuserIndex}`).
- **ROB-3 (Téléchargement)** : Suppression du timeout artificiel de 30 secondes pour la révocation des Blobs, désormais confiée exclusivement à l'écouteur `downloads.onChanged`.
- **ROB-5 (Réseau)** : Ajout d'un timeout `AbortSignal.timeout(5000)` sur les requêtes HEAD de détection MIME.

### ♿ Accessibilité (A11Y)
- **A11Y-2** : Ajout de l'attribut `aria-busy="true"` sur le composant `#notebook-list` pendant l'animation skeleton.
- **A11Y-6** : Dimensionnement des zones tactiles (`min-height: 44px`) pour le sélecteur de compte et le sélecteur de locale en mode tactile.

### 🎨 Design & Polish Visuel
- **D1** : Effet glassmorphism renforcé (`backdrop-filter: blur(12px) saturate(180%)`).
- **D2** : Courbes de transition Material Design (`cubic-bezier(0.4, 0, 0.2, 1)`).
- **D3-D4** : Contraste des textes secondaires (`--text-muted: #bdc1c6`) et visibilité des bordures en mode sombre (`rgba(255,255,255,0.15)`).
- **D5** : Ombre portée subtile au survol des boutons primaires.

---

## [v6.1.0] — Juin 2026

### ♿ Accessibilité (WCAG 2.1 AA)
- Labels ARIA, rôles et régions `aria-live` sur tous les éléments interactifs.
- Navigation clavier complète sur tous les boutons et listes.
- Support `prefers-reduced-motion`.
- Toutes les chaînes UI hardcodées migrées vers l'i18n.

### 🛡️ Stabilité & Architecture
- Persistance de session entre les redémarrages Firefox.
- Mécanisme keepAlive du service worker.
- Verrous de concurrence pour prévenir les captures en doublon.
- Timeouts sur tous les appels RPC asynchrones.
- Refactoring complet en ES Modules (popup + background).
- Skeleton loader animé (3 barres pulsantes) pendant le chargement des carnets.
- Layout popup réécrit en Flex colonne à hauteur fixe (580px).

---

## [v6.0.0] — Juin 2026

### 🧹 Contrôle & Sanitarisation
- **Fix `pdf_generator.js`** : Correction du bug `doc.y` au profit de la variable locale `y` dans `injectIntentHeader`.
- **Sanitarisation logs** : Suppression des `console.log` de débogage et préfixage systématique des avertissements conservés avec `[MC]`.
- **Dead code** : Nettoyage des utilitaires obsolètes (`guessMimeFromTitle`, export CJS).
- **CSP & Manifest** : Suppression de la permission `identity` orpheline et déclaration explicite de la CSP MV3 (`script-src 'self'; object-src 'none'`).

---

## [v5.6.0] — Mai 2026

- **YouTube** : Forçage automatique du mode URL sur `youtube.com/watch`, `youtu.be/` et `/shorts/`.
- **Import Direct** : Détection binaire en deux étapes (extension URL puis HEAD Content-Type exempt CORS depuis le background).
- **Clip de sélection** : Option de téléchargement local Markdown post-import.

---

## [v5.5.0] — Mai 2026

- **Tableaux complexes** : Aplatissement algorithmique `flattenTable` des cellules `colspan`/`rowspan` pour un rendu 2D propre en PDF et Markdown pipe-delimited.
- **Fallback tabulaire** : Déclenchement automatique d'un fallback DOM si Readability supprime plus de 50% des tableaux d'une page.

---

## [v5.4.0] — Mai 2026

- **Mode Sombre Natif** : Support 100% CSS via `prefers-color-scheme`.

---

## [v5.3.0] — Avril 2026

- **i18n complète** : Traduction à 100% pour l'allemand (DE), l'espagnol (ES), le vietnamien (VI) et le créole guadeloupéen (GCF).

---

## [v5.0.0] — Avril 2026

- **Lazy Loading (Sprint 3)** : Injection à la demande des modules lourds (`Readability.js`, `jsPDF`, `serializer.js`, `pdf_generator.js`, `md_generator.js`) via `browser.scripting.executeScript()`.
- **Sentinelles globales** : Prévention des réinjections sans recours à `eval()`.

---

## [v4.8.0] — Mars 2026

- **Intent Note** : Ajout du champ d'annotation d'intention de recherche injecté en en-tête des documents PDF et Markdown.

---

## [v4.5.0] — Février 2026

- **☁️ Google Drive** : Support natif de l'import synchronisable de Google Docs, Sheets, Slides et fichiers hébergés sur Drive.

---

## [v1.0.0 - v4.4.0] — 2025-2026

- Création initiale de l'extension, support des 7 modes d'import, double authentification (Cookies + CSRF), support multi-comptes et menu contextuel.
