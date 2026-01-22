# Audit Technique Exhaustif HIVE-MIND
**Date** : 22 Janvier 2026
**Version** : 3.0.0 (Audit)

Ce document présente une analyse technique détaillée et exhaustive de l'architecture actuelle du projet HIVE-MIND, suite à l'examen de l'ensemble du code source (hors `node_modules` et tests).

---

## 1. Audit Core Infra

L'infrastructure centrale repose sur des principes solides (Event-Driven, Injection de Dépendances), mais l'implémentation souffre d'incohérences critiques dans la gestion de la configuration.

*   **`core/orchestrator.js` & `FairnessQueue.js`**
    *   ✅ **Point Fort** : Architecture asynchrone robuste. La `FairnessQueue` implémente correctement une logique Round-Robin pour éviter qu'un groupe spammeur ne bloque le bot.
    *   ✅ **Point Fort** : Gestion du Cooldown pour protéger les quotas API.
    *   ⚠️ **Faiblesse** : Charge une configuration locale pour le backlog au lieu d'utiliser l'objet config global injecté.

*   **`core/ServiceContainer.js`**
    *   ✅ **Point Fort** : Bonne implémentation du pattern DI (Dependency Injection). Gère bien l'initialisation asynchrone (`init()`).
    *   ⛔ **POINT CRITIQUE** : **Duplication de la logique de chargement de configuration**. Le conteneur lit manuellement `config/credentials.json` et `models_config.json` via `fs.readFileSync`. Il parse lui-même les variables d'environnement (`VOTRE_...`). C'est une violation du principe DRY (Don't Repeat Yourself) et une source d'erreurs majeure si le format des fichiers change.

*   **`core/events.js`**
    *   ✅ **Point Fort** : Bus d'événements simple et efficace (`EventBus`). Les constantes `BotEvents` sont bien définies.

*   **`plugins/loader.js`**
    *   ✅ **Point Fort** : Système de chargement dynamique flexible ("Brick-like"). Supporte la dégradation gracieuse.
    *   ⛔ **Faiblesse** : Pour le RAG des outils (`getRelevantTools`), le loader ré-implémente encore une fois toute la logique de chargement des credentials et des embeddings ! Il y a donc 3 ou 4 versions différentes de la logique "Charger la clé Gemini" dans le projet.

---

## 2. Special Baileys (`core/transport/baileys.js`)

C'est le composant le plus critique et le plus fragile du système actuel.

*   ⛔ **Architecture Monolithique (>1100 lignes)**
    *   Le fichier viole le principe de Responsabilité Unique (SRP). Il gère simultanément :
        1.  La connexion Socket / Auth
        2.  Le téléchargement des médias
        3.  Le traitement Audio (Logique PV vs Groupe)
        4.  L'Anti-Delete
        5.  L'Anti-Spam (Backlog protection)
        6.  L'envoi des accusés de réception
        7.  La résolution des Mentions
    *   **Conséquence** : Chaque modification (ex: corriger un bug audio) risque de casser la connexion.

*   ⛔ **Stabilité de Connexion (Erreur 440)**
    *   Le code gère la reconnexion automatique (`connection.update`), mais ne protège pas contre les conflits de session.
    *   Si un processus fantôme tourne encore, la nouvelle instance tente de se connecter, l'autre est déconnectée, se reconnecte, etc. Cela crée la fameuse boucle "Stream Errored (conflict)".
    *   **Manque** : Pas de vérification de PID unique au démarrage.

*   ⚠️ **Gestion des Erreurs**
    *   Utilisation excessive de `try/catch` avec des logs parfois verbeux, parfois silencieux. Difficile de tracer l'origine réelle d'un crash socket.

---

## 3. Service & Boot

L'analyse des services révèle une bonne structure de façade mais des fuites d'abstraction.

*   **`bot.js` (Boot)**
    *   ⚠️ **Manque** : Point d'entrée simpliste. Il manque un système de **Verrouillage (PID Lock)** pour empêcher le lancement multiple, cause principale des instabilités actuelles.

*   **`services/memory.js`**
    *   ⛔ **POINT CRITIQUE** : Instancie sa propre version de `EmbeddingsService` avec sa propre logique de lecture de fichiers JSON. Il ignore complètement le `ServiceContainer`.
    *   Si on change la clé API dans `config/index.js`, la mémoire ne le saura pas et continuera d'utiliser l'ancienne méthode ou plantera.

*   **`services/voice/voiceProvider.js`**
    *   ⛔ **Même problème** : Possède sa propre fonction `loadCredentials()` qui parse `credentials.json` manuellement.
    *   L'architecture "Unified Voice" est bonne sur le papier (Adapters), mais l'initialisation est désynchronisée du reste de l'app.

*   **`services/groupService.js`**
    *   ⚠️ **Dette Technique** : Contient du code mort ou commenté pour la synchronisation SQL (`syncAdminsToSupabase` désactivé). Utilise Redis comme source de vérité faute de schéma DB à jour.
    *   **Risque** : Perte de données d'administration si Redis est flushé.

---

## 4. Script Admin & CLI

C'est la partie la plus dangereuse pour la maintenance.

*   **`scripts/admin-cli.js`**
    *   ⛔ **Duplication Totale** : Ce script ne réutilise PAS le code de `bot.js` ou `ServiceContainer.js` pour s'initialiser. Il réécrit 100% de la logique de connexion DB, Redis, et chargement de config.
    *   **Risque** : Une commande admin (ex: `tools:index`) peut s'exécuter avec une configuration, des clés, ou des modèles **différents** de ceux du bot principal qui tourne à côté.
    *   **Fragilité** : La commande `db:reset-data` contient une liste "en dur" des tables à vider. Si le schéma change (nouvelle table), le reset ne marchera plus ou laissera des données orphelines.

---

## 5. Plugins & Provider

*   **`plugins/system`**
    *   ✅ **Point Fort** : Bonne gestion des permissions (SuperUser check).

*   **`plugins/group_manager`**
    *   ⚠️ **Complexité** : Fichier très dense avec beaucoup de logique métier (Ban, warn, filters) qui mériterait d'être déléguée à des services dédiés (`ModerationService`).
    *   ⚠️ **Regex** : Utilise des regex complexes pour parser les commandes, ce qui peut être fragile aux variations de texte.

*   **Providers & Adapters**
    *   ⚠️ **Organisation** : `geminiLiveAdapter.js` se trouve dans `services/voice/adapters/` alors que les autres adapters sont dans `providers/adapters/`. Incohérence d'arborescence.
    *   ✅ **Code** : Le code de l'adapter Gemini Live semble correct, utilisant bien les websockets natifs.

---

## Conclusion & Recommandations

L'audit révèle que **HIVE-MIND est fonctionnel mais fragile**. La fragilité ne vient pas de la logique IA (qui est excellente), mais de la **tuyauterie (Plumbing)**.

**Actions Prioritaires :**
1.  **Unifier la Configuration** : Créer un `config/index.js` unique et forcer TOUS les services (Memory, Voice, CLI) à l'utiliser. Bannir `fs.readFilySync('config.json')` du code source.
2.  **PID Lock** : Sécuriser le démarrage (`bot.js`) pour tuer les zombies.
3.  **Refactor Baileys** : Sortir la logique Audio et Anti-Delete pour alléger le transport.
