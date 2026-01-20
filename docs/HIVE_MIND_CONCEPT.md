# 🧠 HIVE-MIND : Documentation Générale

> **Hive-Mind** est un bot WhatsApp de nouvelle génération, conçu pour être modulaire, résilient et doté d'une mémoire "consciente".

Contrairement aux bots classiques qui réagissent simplement à des commandes, HIVE-MIND possède une "psychologie", une mémoire à long terme (State) et une capacité à comprendre le contexte social des groupes.

---

## 🏗️ Architecture "Brick-Like"

Le projet est construit sur une architecture modulaire où chaque composant est une brique indépendante. Cela permet de remplacer ou d'améliorer une partie du système sans casser le reste.

### 1. Le Cœur (Core)
*   **Orchestrator (`core/index.js`)** : Le cerveau central. Il reçoit les messages, analyse le contexte, décide si le bot doit répondre (via des filtres ou l'IA) et choisit le bon outil.
*   **Service Container (`core/ServiceContainer.js`)** : Gère l'injection de dépendances (DI). Tous les services (User, Group, Redis, Supabase) sont enregistrés ici et distribués proprement.
*   **Transport (`core/transport/baileys.js`)** : La couche de communication avec WhatsApp (via la librairie Baileys). Elle gère la connexion, les reconnexions et l'envoi de messages.

### 2. La Mémoire (State Layer)
Hive-Mind utilise un système de mémoire hybride ultra-performant :

*   **Redis (Mémoire de Travail & Cache)** :
    *   Stocke le contexte immédiat de la conversation (court terme).
    *   Gère les verrous (Locks) pour éviter les conflits d'écriture.
    *   Sert de tampon (Buffer) pour les écritures en base de données (Pattern "Write-Behind").
    *   Gère les classements en temps réel (ZSET pour les stats de groupe).
*   **Supabase (Mémoire Long Terme)** :
    *   Stocke les profils utilisateurs, les configurations de groupe, et les souvenirs sémantiques.
    *   Utilise PostgreSQL avec l'extension `pgvector` pour la recherche sémantique (RAG).

### 3. Les Services
Des modules spécialisés pour chaque domaine :
*   **UserService** : Gère l'identité (JID, LID), les pseudos, et l'XP globale. Intègre le système **Dual Identity** (voir plus bas).
*   **GroupService** : Gère les métadonnées de groupe et assure la cohérence DB via "Force Sync".
*   **StateManager** : L'interface unifiée pour accéder aux données (Redis <-> Supabase).
*   **AdminService** : Gère les permissions globales (SuperUser, Admins).

### 4. Le Système d'Outils Dynamique (RAG)
Au lieu de charger tous les outils en mémoire, V3 utilise une recherche vectorielle pour trouver le bon outil :
1.  **Indexation** : Les descriptions des outils sont vectorisées (Embedding) et stockées dans Supabase.
2.  **Recherche** : À chaque requête utilisateur, le bot cherche les outils sémantiquement proches.
3.  **Exécution** : Seuls les outils pertinents sont présentés au LLM, permettant d'avoir des centaines d'outils sans pollution de contexte.

---

## 🚀 Fonctionnalités Clés V3

### 🆔 Système "Dual Identity" (LID vs JID)
WhatsApp utilise deux identifiants :
- **JID** (Phone-based) : L'identifiant historique (`336...@s.whatsapp.net`).
- **LID** (Device-based) : L'identifiant technique caché (`123...@lid`).

Hive-Mind V3 gère cela nativement via :
- **Authoritative Sync** : Écoute de `contacts.upsert` pour apprendre le lien JID<->LID à la source.
- **Lazy Resolution** : Si un LID est inconnu, le système ne plante pas (valeur `NULL`) et attend la première interaction pour apprendre le mapping.

### 🛡️ Résilience & Auto-Guérison
- **Force Sync** : Au démarrage, le bot vérifie si le groupe est bien en DB. Si non, il force une synchro totale.
- **Bad Cache Detection** : Si le cache Redis contient des données corrompues (LID à la place de JID), il s'autocorrige.
- **Circuit Breaker** : Si une IA plante, il bascule sur une autre (ex: Kimi -> Gemini).

---

## 🚀 Fonctionnalités Clés

### 🧠 Intelligence Sociale
Le bot ne parle pas "dans le vide". Il comprend :
*   **Qui lui parle** (Niveau d'intimité, statut admin).
*   **Où il est** (Groupe "Bureau" vs "Potes").
*   **Sa mission** (Définie par les admins du groupe).

### ⚡ Performance (Redis ZSET)
Pour les fonctionnalités gourmandes comme les "Top Parleurs", le bot utilise des structures de données Redis optimisées (Sorted Sets) pour des réponses instantanées, même avec des milliers de messages.

### 🛡️ Sécurité & Robustesse
*   **Anti-Crash** : Isolation des erreurs pour que le bot ne plante jamais complètement.
*   **Circuit Breaker** : Si une IA plante, il bascule sur une autre (ex: Kimi -> Gemini).
*   **Rate Limiting** : Protection contre le spam.

---

## 🛠️ Stack Technique

*   **Langage** : Node.js (Modules ES6)
*   **Base de Données** : Supabase (PostgreSQL)
*   **Cache / State** : Redis (Cloud ou Local)
*   **WhatsApp Library** : @whiskeysockets/baileys
*   **AI** : Modèles compatibles OpenAI,Anthropic,Moonshoot,Kimi-for-coding,Mistral

---

## 📚 Guide Rapide

### Commandes Admin (CLI)
Gérez le bot sans toucher au code via le terminal :
```bash
# Ajouter un admin global
npm run cli admin:add 33612345678@s.whatsapp.net "Pseudo"

# Voir les stats Redis
npm run cli redis:stats
```

### Personnalisation
Modifiez `persona/prompts/system.md` pour changer la personnalité fondamentale du bot.

