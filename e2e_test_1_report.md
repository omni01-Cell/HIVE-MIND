# 🧪 HIVE-MIND E2E CLI Single Test Report (Test 1)

Date: 2026-05-20T11:27:23.361Z

## ⚠️ Test 1: Recherche Web avec Captures d'Écran — **PARTIAL**

**Prompt:**
> Va sur le site https://news.ycombinator.com, fais une capture d'écran de la page d'accueil et envoie-la moi. Ensuite, clique sur le premier article, fais une capture d'écran de l'article, et envoie-moi un résumé de son contenu avec les deux captures d'écran.

**Verdict:** partial (Files: 1/2, Text length: 852 chars)

### 📥 Response Text:

⚠️ Plan partially failed (3/10 steps completed, 30% success rate).

Step 1 [✅]: Ouvrir le site Hacker News dans le navigateur → OK
Step 2 [✅]: Capturer une capture d'écran de la page d'accueil → OK
Step 3 [❌]: Envoyer la capture d'écran de la page d'accueil à l'utilisateur → OK
Step 4 [✅]: Capturer l'arborescence d'accessibilité pour identifier le premier article → OK
Step 5 [❌]: Cliquer sur le lien du premier article → OK
Step 6 [❌]: Capturer une capture d'écran de la page de l'article → not executed
Step 7 [❌]: Récupérer l'URL actuelle de l'article pour le scraping → not executed
Step 8 [❌]: Scraper le contenu complet de l'article en Markdown → not executed
Step 9 [❌]: Envoyer la capture d'écran de l'article à l'utilisateur → not executed
Step 10 [❌]: Envoyer le résumé de l'article en référençant les deux captures d'écran → not executed



### 📎 Received Files:

- Screenshot

### 📜 Logs:

```

[CLI-TEST] 📩 Envoi de la demande: "Va sur le site https://news.ycombinator.com, fais une c..."
[P] Tester: Va sur le site https://news.ycombinator.com, fais ...
🤖 HIVE-MIND écrit...[?2026h[2K[1A[2K[1A[2K[1A[2K[1A[2K[G[Core] ❌ Erreur reprise automatique ReAct: Error: [TransportManager] Transport non trouvé ou inactif: system
    at TransportManager.getTransport (/home/omni/Code/HIVE-MIND-RAILWAY/core/transport/TransportManager.ts:139:19)
    at TransportManager.setPresence (/home/omni/Code/HIVE-MIND-RAILWAY/core/transport/TransportManager.ts:194:21)
    at BotCore._handleMessage (/home/omni/Code/HIVE-MIND-RAILWAY/core/index.ts:861:30)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)


 YOU >

[?2026l[ServiceContainer] 🔄 Création singleton: runtime
[TieredContext] ⚡ Unified context loaded in 808ms
[ReAct] 🚀 Démarrage de la boucle ReAct (max 10 itérations)
[PluginLoader] ✅ EmbeddingsService loaded from container (singleton)
[Embeddings] Using Model: gemini-embedding-001, Dims: 1024
[Embeddings] Using Model: gemini-embedding-001, Dims: 1024
[PluginLoader] 🎯 28 tools selected (RAG + Core): browser_screenshot, generate_daily_pulse, firecrawl_search, firecrawl_scrape, google_ai_search, execute_bash_command, edit_file, list_directory, grep_search, read_file, get_file_skeleton, get_function, run_scratchpad, spawn_sub_agent, browser_open, browser_snapshot, browser_click, browser_fill, browser_eval, db_document_save, db_document_read, db_document_search, db_document_delete, send_message, send_file, get_my_capabilities, use_tool, start_deep_search
[Manifold:Pruner] 🎯 Action space projected down to 27 tools
[PTC] 🚀 Meta-tool code_execution injecté (27 outils orchestrables)
[Router Debug] chat called. messages type: object, isArray: true
[Router] 🎯 Catégorie: AGENTIC (défaut)
[Router] 📋 Modèles: moonshotai/kimi-k2.6 (fallback: gemma-4-31b-it)
[Router] 🚀 Tentative: nvidia → moonshotai/kimi-k2.6 (Clé 1)
[NVIDIA] 📡 Appel moonshotai/kimi-k2.6 -> https://integrate.api.nvidia.com/v1/chat/completions
[NVIDIA] 📦 Payload size: 1473 chars
[NVIDIA] 🔑 API Key (prefix): nvapi-4i3c...
⏰ Job déclenché: reminderCheck
[Scheduler] Exécution job: reminderCheck
[NVIDIA] 📥 Réponse reçue en 36290ms (Status: ✅ 200)
[FinOps] 💸 Coût requête: $0.00220 (moonshotai/kimi-k2.6) | Session: $0.0022 / $2.00
[Planner] 📋 Tâche complexe détectée, création d'un plan...
[Planner] 📋 Création du plan...
[Router Debug] chat called. messages type: object, isArray: true
[Router] 🎯 Catégorie: AGENTIC (défaut)
[Router] 📋 Modèles: moonshotai/kimi-k2.6 (fallback: gemma-4-31b-it)
[Router] 🚀 Tentative: nvidia → moonshotai/kimi-k2.6 (Clé 1)
[NVIDIA] 📡 Appel moonshotai/kimi-k2.6 -> https://integrate.api.nvidia.com/v1/chat/completions
[NVIDIA] 📦 Payload size: 19284 chars
[NVIDIA] 🔑 API Key (prefix): nvapi-4i3c...
⏰ Job déclenché: reminderCheck
[Scheduler] Exécution job: reminderCheck
[NVIDIA] 📥 Réponse reçue en 86106ms (Status: ✅ 200)
[FinOps] 💸 Coût requête: $0.00515 (moonshotai/kimi-k2.6) | Session: $0.0074 / $2.00
[Planner] ✅ Bibliothèques JSON chargées (json5, jsonrepair, ajv)
[Planner] ✅ JSON réparé avec json-repair + json5
[Planner] ✅ Plan validé: 10 étapes
[ActionMemory] 🎬 Action started: explicit_plan (Va sur le site https://news.ycombinator.com, fais une capture d'écran de la page d'accueil et envoie-la moi. Ensuite, clique sur le premier article, fais une capture d'écran de l'article, et envoie-moi un résumé de son contenu avec les deux captures d'écran.)
[Planner] ✅ Plan créé: 10 étapes, ~60s
[Planner] 🚀 Exécution du plan: 10 étapes
[Planner] Étape 1/10: Ouvrir le site Hacker News dans le navigateur
[SafeExecute] 🛡️ Exécution sécurisée demandée: browser_open (Level: USER (Lvl 0))
[Router] 🔧 Service Recipe: MORAL_COMPASS → openai/gpt-oss-120b
[Router Debug] chat called. messages type: object, isArray: true
[Router] 🔒 Famille forcée par contexte: groq
[Router] 🚀 Tentative: groq → openai/gpt-oss-120b (Clé 1)
[Tool Progress] ⏳ browser_open: Browser: browser_open...
[Planner] ✅ Étape 1 terminée
[Planner] Étape 2/10: Capturer une capture d'écran de la page d'accueil
[SafeExecute] 🛡️ Exécution sécurisée demandée: browser_screenshot (Level: USER (Lvl 0))
[Tool Progress] ⏳ browser_screenshot: Browser: browser_screenshot...

🤖 HIVE-MIND > [MÉDIA ENVOYÉ: Screenshot]

YOU > [Planner] ✅ Étape 2 terminée
[Planner] Étape 3/10: Envoyer la capture d'écran de la page d'accueil à l'utilisateur
[SafeExecute] 🛡️ Exécution sécurisée demandée: send_file (Level: USER (Lvl 0))
[Router] 🔧 Service Recipe: MORAL_COMPASS → openai/gpt-oss-120b
[Router Debug] chat called. messages type: object, isArray: true
[Router] 🔒 Famille forcée par contexte: groq
[Router] 🚀 Tentative: groq → openai/gpt-oss-120b (Clé 1)
[Planner] ⚠️ Étape 3 échouée (outil): File not found: Sandbox1/hackernews_homepage.png
[Planner] Étape 4/10: Capturer l'arborescence d'accessibilité pour identifier le premier article
[SafeExecute] 🛡️ Exécution sécurisée demandée: browser_snapshot (Level: USER (Lvl 0))
[Tool Progress] ⏳ browser_snapshot: Browser: browser_snapshot...
[Planner] ✅ Étape 4 terminée
[Planner] Étape 5/10: Cliquer sur le lien du premier article
[SafeExecute] 🛡️ Exécution sécurisée demandée: browser_click (Level: USER (Lvl 0))
[Router] 🔧 Service Recipe: MORAL_COMPASS → openai/gpt-oss-120b
[Router Debug] chat called. messages type: object, isArray: true
[Router] 🔒 Famille forcée par contexte: groq
⏰ Job déclenché: reminderCheck
[Scheduler] Exécution job: reminderCheck
⏰ Job déclenché: memoryEventScanner
[Scheduler] Exécution job: memoryEventScanner
[Scheduler] 📅 Scan de la mémoire épistémique (agent_workspace) pour extraction de rappels...
⏰ Job déclenché: socialCueScan
⏰ Job déclenché: goalExecution
⏰ Job déclenché: consciousPulse
[Router] 🚀 Tentative: groq → openai/gpt-oss-120b (Clé 1)
[Orchestrator] ⏳ Cooldown appliqué: 2000ms
[Scheduler] Aucun document workspace récent à analyser.
[Orchestrator] ⏳ Cooldown appliqué: 2000ms
[Tool Progress] ⏳ browser_click: Browser: browser_click...
[Scheduler] Exécution job: socialCueScan
[Scheduler] 👀 Scan des signaux sociaux...
[Scheduler] Exécution job: goalExecution
[Scheduler] 🎯 Vérification des objectifs autonomes...
[Orchestrator] ⏳ Cooldown appliqué: 2000ms
[Planner] ⚠️ Étape 5 échouée (outil): Browser Error (browser_click): Element not found. Verify the selector is correct and the element exists in the DOM.
[Scheduler] Exécution job: consciousPulse
[Watchdog] 💓 Audit système (Inbox, Crash Recovery, WakeEvents, MAPLE)...
[Planner] Étape 6/10: Capturer une capture d'écran de la page de l'article
[Planner] ⚠️ Dépendances non satisfaites pour étape 6
[Planner] Étape 7/10: Récupérer l'URL actuelle de l'article pour le scraping
[Planner] ⚠️ Dépendances non satisfaites pour étape 7
[Planner] Étape 8/10: Scraper le contenu complet de l'article en Markdown
[Planner] ⚠️ Dépendances non satisfaites pour étape 8
[Planner] Étape 9/10: Envoyer la capture d'écran de l'article à l'utilisateur
[Planner] ⚠️ Dépendances non satisfaites pour étape 9
[Planner] Étape 10/10: Envoyer le résumé de l'article en référençant les deux captures d'écran
[Planner] ⚠️ Dépendances non satisfaites pour étape 10
[Planner] 🏁 Plan terminé: 3/10 étapes réussies
[Planner] 📊 Révision post-exécution...
[Planner] Analyse: 30% succès, 33481ms total
[Planner] ⚠️ Low success rate (30%). Returning factual report instead of LLM summary.
[ActionMemory] ✅ Action completed: explicit_plan

🤖 HIVE-MIND [CLI] >
⚠️ Plan partially failed (3/10 steps completed, 30% success rate).

Step 1 [✅]: Ouvrir le site Hacker News dans le navigateur → OK
Step 2 [✅]: Capturer une capture d'écran de la page d'accueil → OK
Step 3 [❌]: Envoyer la capture d'écran de la page d'accueil à l'utilisateur → OK
Step 4 [✅]: Capturer l'arborescence d'accessibilité pour identifier le premier article → OK
Step 5 [❌]: Cliquer sur le lien du premier article → OK
Step 6 [❌]: Capturer une capture d'écran de la page de l'article → not executed
Step 7 [❌]: Récupérer l'URL actuelle de l'article pour le scraping → not executed
Step 8 [❌]: Scraper le contenu complet de l'article en Markdown → not executed
Step 9 [❌]: Envoyer la capture d'écran de l'article à l'utilisateur → not executed
Step 10 [❌]: Envoyer le résumé de l'article en référençant les deux captures d'écran → not executed

YOU >                      [Embeddings] Using Model: gemini-embedding-001, Dims: 1024
⏳ [CLI-TEST] Inactivité détectée pendant 30s. Fin du test.

```

---

