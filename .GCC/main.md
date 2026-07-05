# Current Project Context

## 🏆 Major Milestones (Archived Epics)

- **[2026-07-03] Modernisation et Adaptation Complète de la TUI HIVE-MIND (Sessions 1 à 22)** : Remplacement des composants obsolètes de Gemini, couplage asynchrone non-bloquant de la file d'attente, routage interactif HITL local, affichage cliquable des services d'arrière-plan, intégration IDE par WebSocket local, navigation d'historique connectée à Supabase, compaction d'historique sur jauge dynamique de contexte à 80% (ContextWindowService), intégration du logo ASCII et déploiement de la charte graphique néon HIVE-MIND (violet, fuchsia, cyan) avec zéro erreur de compilation et zéro erreur de linter.
- **[2026-07-03] Session 17 - Context Window Indicator & Dynamic Compaction** : Implémentation du ContextWindowService, de la compaction d'historique basée sur un seuil dynamique de 80% des tokens du modèle actif, et de l'affichage de la consommation sous la forme [Context: X/Y (Z%)] (avec coloration dynamique de niveau de saturation) dans StatusRow.tsx et ModelStatsDisplay.tsx de la TUI.
- **[2026-07-03] PR Recovery & Integration** : Restauration et intégration sélective des Pull Requests fermées indûment par Jules (PR #11 pour l'indicateur de présence TUI, PR #10 pour les tests unitaires d'audioConverter, et PR #8 pour la correction d'injection de commande dans ASTTools.expandDirectory).
- **[2026-07-03] Jules TUI PR Integration & Decoupling** : Résolution des conflits et fusion définitive de la PR de Jules (liaison de session dynamique) sur le fork et le dépôt parent, après un découplage architectural de `HiveTransport` pour éliminer la cascade de compilation TS des fichiers TUI non-refactorisés.
- **[2026-07-03] Jules Rules and Workflow Lock** : Éradication complète des boucles de Pull Requests automatiques par le nettoyage final et la suppression de toutes les branches obsolètes sur le fork `leandre755/HIVE-MIND`, la fermeture de toutes les PRs en boucle sur `omni01-Cell/HIVE-MIND`, la mise à jour de `guide_auto_review_merge.md` et le déploiement général du fichier `JULES.md` à la racine.
- **[2026-07-02] Gitignore Refinement** : Retrait de `.agent/` et de `AGENTS.md` du fichier `.gitignore` afin de permettre l'inclusion et le suivi de ces fichiers dans Git.
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

- [2026-07-05] [JULES-SESSION-INIT] Moi, Jules, j'ai initialisé la session de travail et créé le plan `plan_agent_test_battery.md` comme demandé.
- [2026-07-03] [PR-8-INTEGRATION] Intégration de la PR #8. Analyse et application manuelle de la correction d'injection de commande dans la fonction expandDirectory d'ASTTools en utilisant execFileAsync au lieu d'execAsync.
- [2026-07-03] [PR-INTEGRITY-RECOVERY] Récupération sélective des PRs fermées de force par Jules. Pour préserver la sécurité de la branche main et éviter les conflits obsolètes de workflows, les changements fonctionnels légitimes (indicateurs de présence et tests unitaires) ont été isolés et appliqués directement sur main.
- [2026-07-03] [COMMIT-CO-AUTH] Co-authored-by commit message footers. Décidé d'ajouter systématiquement le pied de commit "Co-authored-by: Google Antigravity <242056456+google-antigravity@users.noreply.github.com>" à tous les futurs commits Git générés par l'assistant IA, pour assurer une attribution correcte sur GitHub.
- [2026-07-03] [TUI-TRANSPORT-DECOUPLING] Decoupled HiveTransport from hiveConfig. Décidé de rompre la dépendance directe de HiveTransport envers hiveConfig pour éviter que l'importation de HiveTransport par le core ne force TypeScript à compiler l'intégralité de l'application TUI (contenant 45 erreurs TS héritées de fichiers React non-refactorisés). L'ID de session est désormais propagé de manière asymétrique via setSessionId() sur le transport lors de l'initialisation et des changements.
- [2026-07-03] [TUI-MODELS-DYNAMIC] Refactorisation des dialogues de modèles (ModelDialog et VoiceModelDialog) pour les lier dynamiquement à l'infrastructure multi-providers de HIVE-MIND. Ajout de properties de surcharge ('forcedFamily', 'forcedModel') sur le Router central et intégration de nouveaux paramètres de voix (TTS Minimax/Gemini/gTTS, STT Groq/Gemini-Live) dans le schéma de configuration.
- [2026-07-03] [JULES-PR-INTEGRITY] Ajout d'une règle dans JULES.md (section 5) et dans l'instruction de revue du workflow pr-review.yml pour exiger que Jules vérifie si les modifications de code réelles de la PR correspondent aux revendications textuelles de son titre, de sa description et du fichier .GCC/resume.md.
- [2026-07-03] [GCC-AUTO-MERGE] Création de .gitattributes configurant le pilote de fusion 'union' pour .GCC/resume.md et .GCC/main.md, permettant à Git et à GitHub de résoudre automatiquement les conflits sur les fichiers de suivi de contexte.
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
- [2026-07-02] [GITHUB-SYNC-ISOLATION] Décision d'isoler le dossier `.github/` en créant des branches épurées `pr-clean-*` pour les Pull Requests amont, et de restaurer de force le dossier `.github/` local (`git checkout main -- .github/`) lors de l'intégration des mises à jour amont pour protéger la configuration du fork.
- [2026-07-02] [GITHUB-SYNC-DIFF] Ajout d'une vérification par `git diff --quiet` dans la synchronisation automatique pour éviter de créer des Pull Requests vides et prévenir les plantages de l'API GraphQL de GitHub.
- [2026-07-02] [GITHUB-SYNC-STATIC-BRANCH] Adoption d'une branche de synchronisation statique (`sync-upstream-main`) mise à jour par force-push, éliminant l'accumulation de branches obsolètes sur le fork.
- [2026-07-03] [TUI-MODELS-DYNAMIC] Refactorisation des dialogues de modèles (ModelDialog et VoiceModelDialog) pour les lier dynamiquement à l'infrastructure multi-providers de HIVE-MIND. Ajout de properties de surcharge ('forcedFamily', 'forcedModel') sur le Router central et intégration de nouveaux paramètres de voix (TTS Minimax/Gemini/gTTS, STT Groq/Gemini-Live) dans le schéma de configuration.
- [2026-07-03] [JULES-PR-INTEGRITY] Ajout d'une règle dans JULES.md (section 5) et dans l'instruction de revue du workflow pr-review.yml pour exiger que Jules vérifie si les modifications de code réelles de la PR correspondent aux revendications textuelles de son titre, de sa description et du fichier .GCC/resume.md.
- [2026-07-03] [GCC-AUTO-MERGE] Création de .gitattributes configurant le pilote de fusion 'union' pour .GCC/resume.md et .GCC/main.md, permettant à Git et à GitHub de résoudre automatiquement les conflits sur les fichiers de suivi de contexte.
- [2026-07-03] [SYSTEM-KEYBOARD-CONFIG] Configuration clavier personnalisée pour l'utilisateur sur KDE Wayland. Création du layout XKB utilisateur custom_fr sous ~/.config/xkb/symbols/custom_fr (mappage de AltGr+; vers < et AltGr+: vers >) et activation persistante dans ~/.config/kxkbrc.

## 🌿 Active Branches / Plans

- `agent-test-battery` : Plan de test d'automatisation de l'agent [plan_agent_test_battery.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/plan_agent_test_battery.md)
- `claude-code-sota` : Plan de refactorisation SOTA (streaming, caches, compaction) [plan_claude_code_sota.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/plan_claude_code_sota.md)
- `investigation-harnais` : Analyse et investigation du harnais de sécurité [plan_investigation_harnais.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/plan_investigation_harnais.md)
- `test-activity` : Suivi général des tests [test.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/test.md) et backlog [test_afaire.md](file:///home/omni/Code/HIVE-MIND-RAILWAY/.GCC/branches/test_afaire.md)

## 📈 Current Status

- ✅ Done: Modernisation et Adaptation Complète de la TUI HIVE-MIND (Sessions 1 à 22 complétées et validées).
- ✅ Done: Session 1 — Purge du Code Mort et des Modules Google Inutiles.
- ✅ Done: Session 2 — Désactivation des Dialogues de Sécurité Gemini.
- ✅ Done: Session 3 — Assainissement des Imports et Nettoyage de useAgentStream.ts.
- ✅ Done: Session 4 — Stabilisation du composant StatusRow et Correction de Rendu de Base.
- ✅ Done: Session 5 — Raccordement du Transport de Base (Natification des Signaux de Fin).
- ✅ Done: Session 6 — Intégration de la File d'Attente de Messages Non-Bloquante.
- ✅ Done: Session 7 — Routage Local HITL (Human-in-the-Loop).
- ✅ Done: Session 8 — Intégration des Composants de Confirmation de Sécurité.
- ✅ Done: Session 9 — Émission d'Événements d'Activité de Services (Core).
- ✅ Done: Session 10 — Rendu Interactif des Services Actifs dans la TUI.
- ✅ Done: Session 11 — Commande `/skills` et Indexation d'Outils.
- ✅ Done: Session 12 — Commande `/search` par Embeddings Sémantiques.
- ✅ Done: Session 13 — Commande `/session` (Gestionnaire de Sessions Hybride).
- ✅ Done: Session 14 — Conservation et Réadaptation du Module IDE.
- ✅ Done: Session 15 — Nettoyage et Adaptation des Dialogues de Modèles.
- ✅ Done: Session 16 — Branchement du Navigateur d'Historique sur Supabase.
- ✅ Done: Session 17 — Indicateur dynamique de contexte TUI et compaction à 80%.
- ✅ Done: Session 18 — Purge des Mentions Google LLC & Textes Gemini dans AboutBox, Help, ShortcutsHelp, Footer, Header.
- ✅ Done: Session 19 — Intégration du Logo ASCII HIVE-MIND dans AsciiArt.ts.
- ✅ Done: Session 20 — Déploiement de la Charte Graphique et des Couleurs HIVE-MIND (néon violet/cyan/fuchsia dans colors, semantic-colors, themes).
- ✅ Done: Session 21 — Résolution Strict-Type et Éradication ESLint Restante dans HistoryItemDisplay, slashCommandProcessor, atCommandProcessor, AskUserDialog, DetailedMessagesDisplay.
- ✅ Done: Session 22 — Certification Finale (TSC & ESLint à 0 erreur, tous les 399 tests Jest au vert).

## 👉 Next Session Direction

Démarrer le plan de test d'automatisation de l'agent (agent-test-battery) ou explorer de nouvelles fonctionnalités d'intelligence.
