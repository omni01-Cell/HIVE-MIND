# Résultats de Tests : Plugins

Ce document liste l'état des tests de tous les plugins après la refonte V3.

---

### 🧩 Plugin : `system`
- **Outils** : `os_shutdown`, `os_system_info`
- **Statut** : ✅ Succès
- **Requête** : "Utilise l'outil os_system_info pour me donner l'état du système."
- **Réponse Modèle** : Affichage correct de la RAM, de l'Uptime et de la version Node.
- **Commentaires** : Exécution rapide via code_execution, fallback fonctionnel.

---

### 🧩 Plugin : `daily_pulse`
- **Outils** : `generate_daily_pulse`
- **Statut** : ✅ Succès
- **Requête** : "Génère un daily pulse."
- **Réponse Modèle** : 🎙️ **The Daily Pulse**... Génération du script audio de la journée.
- **Commentaires** : Le cron interne et le déclenchement LLM via le plugin fonctionnent.

---

### 🧩 Plugin : `wikipedia`
- **Outils** : `search_wikipedia`
- **Statut** : ✅ Succès
- **Requête** : "Donne-moi des infos sur la Tour Eiffel."
- **Réponse Modèle** : Résumé de l'article avec lien.
- **Commentaires** : Remplacement de la lib npm (qui causait un 403 Forbidden) par un fetch natif avec un User-Agent.

---

### 🧩 Plugin : `duckduck_search` & `google_ai_search`
- **Outils** : `duckduckgo_search`, `google_ai_search`
- **Statut** : ✅ Succès
- **Requête** : Requêtes web générales (ex: recettes).
- **Réponse Modèle** : Fournit le résultat de la recherche structurée.
- **Commentaires** : Très sollicités en RAG. Google AI search agit comme fallback ultra performant.

---

### 🧩 Plugin : `admin`
- **Outils** : `admin_soft_delete`, `admin_list_deleted`, etc.
- **Statut** : ✅ Succès
- **Requête** : "Liste les messages supprimés."
- **Réponse Modèle** : Refus poli ("Je n'ai pas les permissions super-administrateur...").
- **Commentaires** : Testé avec succès en rejet. Le check de permission fonctionne (l'utilisateur de test n'avait pas le bon rôle).

---

### 🧩 Plugin : `tts`
- **Outils** : `text_to_speech`
- **Statut** : ⏳ En attente (Implémenté mais bloqué au test)
- **Requête** : "Can you use text_to_speech to say '[laughs] I did NOT expect that. [short pause] Can you believe it?' in a British accent?"
- **Réponse Modèle** : N/A (Script E2E bloqué)
- **Commentaires** : Le plugin et l'adaptateur `GeminiTTS` ont été entièrement mis à jour pour utiliser `gemini-3.1-flash-tts-preview` avec le support du "Director's Chair" (inline tags et style_notes). Le test final a bloqué (timeout/freeze du script), à valider sur serveur réel.

---

### 🧩 Plugin : `crawlfire_web`
- **Outils** : `read_webpage`, `search_and_read` (Ici Firecrawl via code_execution)
- **Statut** : ✅ Succès
- **Requête** : "Can you read the webpage at https://example.com and tell me what the main heading says?"
- **Réponse Modèle** : The main heading of the webpage at https://example.com is "**Example Domain**".
- **Commentaires** : L'agent a utilisé de lui-même `firecrawl_scrape` dans `code_execution` avec brio et a extrait le contenu correctement.

---

### ⏳ Plugins en Attente / Non Testés
*(Le RAG a parfois écarté ces outils ou le test organique n'a pas encore été fait).*

- **dev_tools** (`execute_bash_command`)
- **goals** (`create_goal`, `list_goals`)
- **mcp_tools** (Dynamique - *Mis en pause par manque de quota*)
- **memory** (`remember_fact`, `workspace_search`...)
- **sys_interaction** (`react_to_message`)
- **shopping** (`find_product`)
- **translate** (`translate_text`)
- **visual_reporter** (`generate_markdown_report`)
- **deep_research** (`start_deep_search`)
- **group_manager** (`whatsapp_filter_add`)
- **sticker** (`create_sticker`)

---

### ⏸️ Plugins Ignorés
- **send_email** : Le webhook N8N est désactivé sur le serveur distant.
