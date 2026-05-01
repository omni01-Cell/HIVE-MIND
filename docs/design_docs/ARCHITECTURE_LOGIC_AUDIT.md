# 📑 Rapport d'Audit Architectural & Logique - HIVE-MIND V3

## 1. 🛑 Amnésie du FastPath (L'effet "Poisson Rouge")
**Problème :** L'architecture sépare le traitement en `FAST` et `AGENTIC`. Le mode `FAST` (utilisé pour 95% des messages) est totalement aveugle aux couches de mémoire `COLD`.
- **Détails :** Le `TieredContextLoader` ne charge ni le RAG (mémoire sémantique), ni les Faits (mémoire d'identité), ni les clés du Workspace en mode `FAST`.
- **Conséquence :** Le bot peut se contredire d'un message à l'autre si le second message passe par le FastPath. Il perd toute notion de préférences utilisateur ou de contexte historique dès que la latence est privilégiée.
- **Biais Logique :** L'IA "pense" qu'elle n'a pas de passé en mode Fast, ce qui brise l'illusion d'une identité persistante.

## 2. 🧩 Disconnexion Workspace / Rappels (Le "Programmeur Aveugle")
**Problème :** Il existe une automatisation "fantôme" entre le Workspace et le système de rappels, mais l'agent n'en est pas informé.
- **Détails :** Le `schedulerHandler.ts` contient un agent d'extraction qui scanne les documents du Workspace pour en extraire des rappels (y compris des expressions `cron`). Cependant, le `systemPrompt` ne contient aucune instruction expliquant ce mécanisme à l'IA.
- **Conséquence :** L'IA tente de gérer des rappels via `create_goal` (qui ne supporte pas le cron) ou pense qu'elle ne peut tout simplement pas programmer d'actions récurrentes, alors que le système technique le permet via l'écriture dans le Workspace.
- **Outil manquant :** Absence d'un outil direct `schedule_reminder(message, cron)` qui permettrait une action explicite plutôt qu'une extraction heuristique en arrière-plan.

## 3. 📉 Perte de Traçabilité des Actions (L'agent "Amnésique")
**Problème :** La `WorkingMemory` (Redis) ne stocke que les rôles `user` et `assistant` sous forme de texte.
- **Détails :** Lorsqu'un agent exécute un outil (ex: `workspace_read` ou `web_search`), le résultat est ajouté à l'historique *pendant* la boucle en cours. Mais une fois la réponse envoyée, seul le texte final de l'assistant est sauvegardé dans Redis.
- **Conséquence :** Au message suivant de l'utilisateur, l'IA voit qu'elle a répondu quelque chose, mais elle a oublié **quels outils** elle a utilisé et **quels étaient les résultats bruts** de ces outils.
- **Biais Logique :** L'IA doit souvent "re-exécuter" les mêmes outils d'un tour à l'autre si l'utilisateur demande une précision sur une action précédente, car elle n'a plus la trace de l'exécution technique dans son contexte GCC (Global Consistency Context).

## 4. 🧠 Mémoire de Travail (GCC) vs Historique de Message
**Problème :** Confusion entre "Historique de conversation" et "Mémoire de travail".
- **Détails :** La `WorkingMemory` actuelle est une simple liste FIFO des 15 derniers messages. Il manque une véritable strate "GCC" (Scratchpad persistant) qui serait visible à chaque tour, indépendamment de l'historique de chat, pour stocker les "pensées en cours" ou les variables d'état de la tâche.
- **Note sur ActionMemory :** Bien qu'un service `ActionMemory` existe pour suivre les plans du `Planner`, ses données ne sont pas injectées dans le prompt de l'agent comme un résumé "Voici ce que j'ai fait jusqu'à présent".

## 5. 🎭 Fragmentation de l'Identité
**Problème :** L'identité (Faits) est chargée uniquement en mode `AGENTIC`.
- **Détails :** Si un utilisateur dit "Je m'appelle Jean" (mémorisé en mode Agentic), et que le message suivant est "Quel est mon nom ?", si le classifieur choisit `FAST`, le bot répondra "Je ne sais pas".
- **Recommandation :** Les `Facts` (Faits) devraient être déplacés de la couche `COLD` à la couche `WARM` pour être disponibles même en FastPath, car ils définissent la cohérence de la relation.

## 6. 🔄 Biais de Classification "Safe First"
**Problème :** Le `FastPathHandler` escalade s'il détecte un besoin d'outil complexe, mais le classifieur initial peut se tromper par manque de contexte.
- **Détails :** Sans accès au RAG au moment de la classification, le système ne peut pas savoir qu'une question "simple" en apparence nécessite en réalité une recherche dans la mémoire profonde.

---
**Verdict :** L'architecture actuelle privilégie la performance brute (latence) au détriment de l'intégrité cognitive. Le bot "pense" et "agit" de manière fragmentée selon le chemin (Fast vs Agentic) emprunté par le message.
