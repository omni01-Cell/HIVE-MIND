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

### 🧩 Plugin : `shopping`
- **Outils** : `find_product`
- **Statut** : ✅ Succès
- **Requête** : "find me some laptops under 500 dollars"
- **Réponse Modèle** : Lancement d'un `SubAgentEngine:PersonalShopper` qui a effectué plusieurs recherches et renvoyé un rapport structuré avec 3 modèles recommandés.
- **Commentaires** : Intégration parfaite du système de Sub-Agent pour les recherches complexes.

---

### 🧩 Plugin : `sys_interaction`
- **Outils** : `react_to_message`, `execute_bash_command` (via code_execution)
- **Statut** : ✅ Succès
- **Requête** : "test pinging an echo command"
- **Réponse Modèle** : Exécution réussie de `echo "ping test 1"`, `echo "ping test 2"`.
- **Commentaires** : Le fallback PTC a permis d'exécuter des commandes système de manière fluide.

---

### 🧩 Plugin : `deep_research`
- **Outils** : `start_deep_search`
- **Statut** : ✅ Succès
- **Requête** : "Generate a visual report on the topic of AI growth"
- **Réponse Modèle** : L'IA a lancé un `SubAgentEngine:DeepResearcher` pour approfondir le sujet.
- **Commentaires** : La boucle de recherche itérative (6+ itérations) est fonctionnelle et résiliente aux erreurs de quota.

---

### 🧩 Plugin : `crawlfire_web`
- **Outils** : `firecrawl_scrape`, `firecrawl_search`, etc.
- **Statut** : ✅ Succès
- **Requête** : Diverses recherches web.
- **Réponse Modèle** : Extraction de contenu markdown réussie.
- **Commentaires** : Un bug `json.data.map is not a function` a été identifié et corrigé (ajout d'un guard sur le format de réponse API).

---

### 🧩 Plugin : `visual_reporter` / `translate`
- **Statut** : 🟡 Partiel
- **Commentaires** : L'IA tente d'utiliser ces outils, mais ils sont parfois exclus du contexte par le RAG de sélection d'outils, ce qui provoque des erreurs dans le `code_execution` (UNKNOWN_TOOL). Néanmoins, la logique d'appel est correcte.

---

### 🧩 Plugin : `sticker`
- **Outils** : `create_sticker`
- **Statut** : ✅ Succès
- **Requête** : Testé avec une image de 64px et une image HD de 7Mo via un script de simulation.
- **Réponse Modèle** : Génération réussie d'un fichier `.webp` (Sticker WhatsApp) de ~60Ko.
- **Commentaires** : Correction d'un bug d'importation (`Sticker is not a constructor`) lié au format ESM. Le plugin est maintenant robuste et gère bien le redimensionnement des images lourdes.

---

### ⏳ Plugins en Attente / Non Testés
- **goals** (`create_goal`, `list_goals`) - L'IA était trop occupée par les tâches précédentes lors du test CLI de 30s.
- **group_manager** (`whatsapp_filter_add`)
- **mcp_tools** (Dynamique)

---

### ⏸️ Plugins Ignorés
- **send_email** : Le webhook N8N est désactivé sur le serveur distant.
