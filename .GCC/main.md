# Current Project Context

## 🏆 Major Milestones (Archived Epics)
- **[2026-07-02] Epic Auto-Review and Auto-Merge** : Installation de Husky locale avec validations incrémentales (seuls les fichiers modifiés sont passés au Linter ESLint) et création du workflow pr-review.yml (CI/CD) intégrant la revue automatique Jules et l'auto-merge GitHub.
- **[2026-07-02] GitHub Actions Synchronization** : Configuration et automatisation de la synchronisation bidirectionnelle par Pull Request entre le fork (leandre755/HIVE-MIND) et le parent (omni01-Cell/HIVE-MIND), incluant le déploiement automatique du token en tant que secret `UPSTREAM_PAT` sur le fork.
- **[2026-06-11] Epic TUI Refactoring & Fixes** : Résolution de l'erreur d'exécution `useSettings` (Provider lifecycle) dans la TUI (`src/tui/`), élimination de toutes les erreurs de type strict TypeScript et de linter ESLint dans les fichiers cibles de la TUI, validée par audit forensique et test de boot E2E.
- **[2026-06-04] Epic Gemini Embedding 2** : Indexation multimodale complète (images, vidéos, audio, PDF) via Gemini Embedding 2 (3072 dims) avec recherche vectorielle locale HNSW + JSON atomique dans `/mediaDB/`. 4 fichiers créés (MultimodalEmbeddingService, MediaIndexer, MediaSearch + intégration core/index.ts). Summary LLM optionnel pour images, rétention 30j + cap 500 entries/context. 40 nouveaux tests (360 total).
- **[2026-06-03] Epic ESLint Eradication** : Éradication complète de 1257 erreurs ESLint sur 81+ fichiers (`src/services/`, `src/plugins/`, `src/core/`, `src/config/`, `src/scheduler/`, `src/scripts/`, `src/tests/`). Types `any` → interfaces strictes, `error: unknown` + `extractErrorMessage`, `no-case-declarations` par extraction de handlers, `prefer-const`, `no-empty`, `max-depth`, `complexity` tous résolus. Corrections TS post-ESLint dans 15+ fichiers. 317 tests au vert, 0 régression.
- **[2026-06-08] Epic ESLint TUI Eradication** : Éradication complète de 348 erreurs ESLint dans `src/tui/` (composants Ink/React). Résolu : no-duplicate-imports (90, script Python bulk merge), no-shadow (84, suppression destructuring redondante), no-warning-comments (16), max-depth (42, early returns + helpers), no-param-reassign (9), no-unused-vars (8), no-explicit-any (5), react-hooks/rules-of-hooks (2). Refactoring : ToolConfirmationMessage (3 helpers + sub-component), ScrollProvider (2 helpers), SessionBrowser (2 key handlers). Fichiers morts Gemini supprimés (liteRtServerManager, agentSettings, hookSettings, SlashCommandConflictHandler). 3 géants (AppContainer/InputPrompt/useGeminiStream) en eslint-disable ciblé. TSC 0 erreur, ESLint 0 erreur (23 warnings react-hooks/exhaustive-deps).
- **[2026-05-24] Harnais LLM & Boucle de ReAct Anti-Crash** : Implémentation du système de validation strict Zod/Ajv de Claude Code pour garantir un crash-free (100/100) sur l'exécution des outils par des petits modèles (Flash-Lite). Boucle de retry gérée par `<tool_use_error>`.
- **[2026-05-24] Politique de Prompt Stricte** : Déploiement global de `ResponseFormatEnforcer`, durcissement de tous les prompts LLM avec exemples few-shot, parsing résilient unifié et retry correctif `[SYSTEM REJECTION]`. Validé à 100% (292 tests verts).
- **[2026-05-24] Codebase Reorganization & Git Security** : Réorganisation complète de la codebase sous `src/` et isolation de la documentation finalisées.
- **[Phase 1] [2026-04-22] Migration TypeScript & Blueprinting** : Migration complète de la codebase JavaScript brute (+20k lignes) vers TypeScript strict.
- **[Phase 2] [2026-04-23] System & FS Capabilities (Claude Code Alignment)** : Bash persistant, Ripgrep, mtime tracking.
- **[Phase 3] [2026-04-23] Multi-Interface Adaptation & Dual Rendering** : Découplage Brain/Adapteurs, WhatsApp/CLI/Discord, client MCP.
- **[Phase 4] [2026-04-24] Agent Hardening & FinOps** : Implémentation de 8 fonctionnalités critiques (Compression LLM, SubAgent isolé, Callback onProgress, Kill Switch FinOps, Dual-Logic HITL, Dual Rendering CLI/WhatsApp, Chain of Thought obligatoire, et interception de sécurité).
- **[Phase 5] [2026-05-19] Unified Runtime Infrastructure** : Conception, implémentation et intégration complète du service unifié `RuntimeInfrastructure` (Sentinel safety evaluation, Ralph laziness kickback system, et KKT Lagrangian token-budget throttling).
- **[Phase 6] [2026-05-19] Epic AION (Memory Management & Decay System)** : Conception et implémentation complète de la Cognitive Memory Architecture (CMA), intégrant la taxonomie MAPLE (`fact:`, `pref:`, `goal:`), le vieillissement des souvenirs par loi d'oubli exponentielle (`MemoryDecaySystem` avec consolidation par setImmediate) et l'hydratation Context Engineer (prompts XML d'Anthropic).
- **Epic Dirac** : Hash-Anchored Edits (AnchorStateManager, lineHashing, hashDictionary), AST-Native Tools (TreeSitterService, 3 outils), Multi-File Batching, Parallel Tool Execution (`Promise.all` read-only), Context Curation + Minimal Prompting (DIRAC CODING PROTOCOL).
- **Epic SOTA Browser Agent Integration** : Installation agent-browser + Chrome for Testing, BrowserService (CLI wrapper), BrowserTools plugin (13 outils browser_*), Intégration PTC, System Prompt browser instructions, Sécurité & Guardrails (NVM path, type safety, sendMedia fix).

## 🎯 Objective
Adapter la TUI (fork Gemini CLI) au core HIVE-MIND existant.

## 🧠 Decisions Made
- [2026-06-11] [TUI-ANALYSIS] Analyse complète de la TUI (82k lignes, 250 fichiers) et du core HIVE-MIND (5k lignes, 14 fichiers). La TUI est un fork Gemini CLI non connecté au vrai core. Le stub `@tui/core` (1035 lignes) est utilisé par 100+ fichiers. La couche transport (`src/tui/transport/`, 1045 lignes) existe mais n'est jamais branchée.
- [2026-06-11] [TUI-STRICT-ANY] Détection d'erreurs implicites 'any' suite à la réactivation de `noImplicitAny: true`. Décidé d'explorer et d'appliquer des types stricts ou de déclarer les modules non-typés (`semver`, `ansi-regex`).
- [2026-06-11] [TUI-R1] Passing `settings` as a parameter to `useIdeTrustListener` to resolve the SettingsProvider mounting context order.
- [2026-06-15] [TUI-DIAGNOSTIC] Diagnostic de l'état actuel de `src/tui` : le stub `@tui/core` a bien été supprimé, mais la refactorisation s'est arrêtée là. `src/tui/ui/contexts/UIStateContext.tsx` est devenu le point de rupture central (imports auto-référencés, types exportés manquants, concepts Gemini encore présents). `AppContainer.tsx` reste un god component de 3014 lignes avec 100+ références Gemini. `useAgentStream` est appelé avec `agent: undefined`. `HiveTransport.ts` est un shell qui n'importe jamais le vrai core. Décision : arrêter les patchs par dessus et reprendre par une approche incrémentale : (1) consolider UIStateContext, (2) créer le vrai pont core dans `src/tui/core/connection.ts`, (3) connecter `useAgentStream`, (4) nettoyer AppContainer, (5) remplacer les références Gemini.
- [2026-06-15] [TUI-TRANSPORT-BYPASS] Le core (`src/core/index.ts:458`) filtrait `ink-cli` du tableau `activeTransports` quand `process.stdin.isTTY === false`. Bug : en mode `npx tsx` ou tout contexte non-TTY, le tableau devenait `[]` et `TransportManager.onMessage(callback)` n'enregistrait aucun callback, faisant de `submitUserMessage()` un no-op silencieux. Fix : si `ACTIVE_TRANSPORTS` contains explicitement `ink-cli`, ne jamais le filtrer, quelle que soit la valeur de `isTTY` ou `APP_ENV`.
- [2026-06-18] [TUI-NATIVE-END] Remplacement du minuteur de silence de 1,5s dans connection.ts par une détection native de fin de traitement du Core (écoute de l'événement de présence 'paused' émis par le Core).
- [2026-06-18] [TUI-QUEUING] Consolidation de la file d'attente (useMessageQueue.ts) pour garder la zone de saisie non-bloquante et empiler proprement les requêtes utilisateur formulées pendant la réflexion de l'agent.
- [2026-06-18] [TUI-SLASH-CMDS] Décision d'ajouter des commandes slash administratives avancées (/index tools, /redis stats, /quota) pour remplacer et compléter les outils en ligne de commande.
- [2026-06-18] [TUI-TYPE-SAFETY] Reconstruction de la classe `Storage` et correction des interfaces `SessionRetentionSettings`, `ToolVisibilityContext`, `HistoryItemToolGroup` et `RoleMetrics` pour éradiquer systématiquement les erreurs de typage fondamentales dans la TUI.
- [2026-06-18] [TUI-IMPORTS] Correction des imports de types et fonctions manquants dans `useSessionBrowser.ts` et correction des signatures/méthodes de `convertSessionToClientHistory` et `uiTelemetryService`.
- [2026-06-18] [TUI-IDE] Décision d'ajuster le plan d'adaptation de la TUI pour conserver et réarchitecturer le module d'intégration IDE (IdeClient et IdeIntegrationNudge) via une communication WebSocket locale légère avec l'extension compagne.
- [2026-06-18] [TUI-SKILLS] Intégration de la commande /skills pour lister les expert skills détectés localement par le LearningEngine.
- [2026-06-18] [TUI-SERVICES] Visualisation en temps réel des services actifs (MAPLE, VIGIL) par indicateurs textuels et événements sur le pont de transport.
- [2026-06-18] [TUI-SESSIONS] Gestion de session hybride locale/DB via la commande /session (list, resume, delete, rename).
- [2026-06-18] [TUI-EMBEDDING-SEARCH] Recherche par embeddings via la commande /search s'appuyant sur le service MediaSearch local.
- [2026-06-18] [TUI-HITL] Routage local des confirmations HITL directement dans le terminal (ink-cli) via le PermissionManager.
- [2026-06-18] [TUI-MODERATION] Bypass de la modération de groupe (FilterProcessor) car le chat TUI est direct/local.
- [2026-06-18] [TUI-PLAN-EXPANSION] Décision d'étendre le plan d'adaptation de la TUI à 22 sessions ultra-détaillées pour maximiser la clarté et la modularité des étapes d'implémentation.
- [2026-06-18] [TUI-CONTEXT-WIDGET] Décidé d'intégrer dans la session 17 de la TUI un indicateur dynamique de consommation de la fenêtre de contexte en pourcentage.
- [2026-06-18] [TUI-CONTEXT-80-PERCENT] Décidé d'utiliser un seuil dynamique de 80% de la fenêtre de contexte du modèle pour déclencher la compression, géré par ContextWindowService.
- [2026-06-18] [TUI-HITL-ROUTING] Correction de la syntaxe de handleInput et implémentation du routage des confirmations de sécurité HITL locales (ink-cli) dans le PermissionManager.
- [2026-06-18] [TUI-CONFIRMATION-QUEUE] Intégration de la file d'attente de confirmation dans connection.ts de la TUI avec typage strict pour la liaison interactive (Session 7 complétée).
- [2026-06-18] [TUI-PERMISSION-MAPPING] Décision de mapper le type d'événement de confirmation 'permission_request' sur le type 'info' dans connection.ts pour un rendu textuel clair des permissions de sécurité locales.
- [2026-06-18] [TUI-SERVICES-RENDERING] Branchement et rendu visuel interactif des services actifs (MAPLE, VIGIL) dans la StatusRow avec gestion du clic de souris via useMouseClick pour afficher les détails opérationnels en direct.
- [2026-06-18] [TUI-SKILLS-COMMAND] Intégration de la commande slash `/skills` pour lister et indexer de manière interactive tous les expert skills disponibles dans le répertoire `/skills/`.
- [2026-07-02] [GITHUB-SYNC] Conception et configuration des workflows GitHub Actions pour la synchronisation bidirectionnelle entre le dépôt parent (omni01-Cell/HIVE-MIND) et le fork (leandre755/HIVE-MIND) avec utilisation d'un PAT pour passer la barrière de sécurité des droits d'écriture inter-dépôts.


## 🌿 Active Branches / Plans
- `tui-refactoring` : Refonte et adaptation de la TUI au core HIVE-MIND [plan_tui_refactoring.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/plan_tui_refactoring.md)
- `agent-test-battery` : Plan de test d'automatisation de l'agent [plan_agent_test_battery.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/plan_agent_test_battery.md)
- `claude-code-sota` : Plan de refactorisation SOTA (streaming, caches, compaction) [plan_claude_code_sota.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/plan_claude_code_sota.md)
- `investigation-harnais` : Analyse et investigation du harnais de sécurité [plan_investigation_harnais.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/plan_investigation_harnais.md)
- `test-activity` : Suivi général des tests [test.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/test.md) et backlog [test_afaire.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/test_afaire.md)

## 📈 Current Status
- ✅ Done: Session 1 — Purge du Code Mort et des Modules Google Inutiles (ConsentPrompt, LogoutConfirmationDialog, ModelQuotaDisplay, QuotaDisplay retirés et imports nettoyés dans slashCommandProcessor.ts, Footer.tsx et ModelDialog.tsx).
- ✅ Done: Session 2 — Désactivation des Dialogues de Sécurité Gemini (FolderTrustDialog et PermissionsModifyTrustDialog supprimés, imports et signatures nettoyés dans UIActionsContext.tsx).
- ✅ Done: Session 3 — Assainissement des Imports et Nettoyage de useAgentStream.ts (résolution de la déclaration lexicale dans le case 'message' de handleAgentEvent, fusion des imports dupliqués UIStateContext dans useAgentStream.ts, shellReducer.ts et useApprovalModeIndicator.ts).
- ✅ Done: Session 4 — Stabilisation du composant StatusRow et Correction de Rendu de Base (définition des variables showRow1 et showRow2 basées sur showUiDetails et les états minimaux de lignes pour corriger les ReferenceError).
- ✅ Done: Résolution définitive de l'accès Node/NPM/NPX global lié à NVM via des liens symboliques.
- ✅ Done: Session 5 — Raccordement du Transport de Base (Natification des Signaux de Fin).
- ✅ Done: Session 6 — Intégration de la File d'Attente de Messages Non-Bloquante.
- ✅ Done: Session 7 — Routage Local HITL (Human-in-the-Loop).
- ✅ Done: Session 8 — Intégration des Composants de Confirmation de Sécurité (connexion des boîtes de dialogue et composants de confirmation à l'infrastructure locale du PermissionManager).
- ✅ Done: Session 9 — Émission d'Événements d'Activité de Services (Core) (intégration des déclencheurs d'activité dans VIGIL et MAPLE).
- ✅ Done: Session 10 — Rendu Interactif des Services Actifs dans la TUI.
- ✅ Done: Session 11 — Commande `/skills` et Indexation d'Outils.
- 🔄 In progress: Session 12 — Commande `/search` par Embeddings Sémantiques.
- ⏳ Pending: Sessions 13 à 22 du plan d'adaptation de la TUI.

## 👉 Next Session Direction
Poursuivre le plan de refactorisation de la TUI avec la Session 12 (Commande `/search` par Embeddings Sémantiques).
