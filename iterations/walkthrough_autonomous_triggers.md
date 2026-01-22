# ⚡ Nouvel Outil : Déclencheurs Autonomes (Wait For X)

**Mission :** Ajouter la capacité de programmer des actions basées sur des événements (ex: "Attends que Jean réponde").
**Statut :** ✅ IMPLÉMENTÉ

## 📝 Ce que le bot peut faire maintenant
Il peut utiliser l'outil `create_goal` avec de nouveaux paramètres :
*   `waitForUser`: "Jean" (Attendre un message de Jean)
*   `waitForKeyword`: "Urgent" (Attendre un message contenant "Urgent")
*   `executeIn`: (Toujours dispo pour le temporel)

**Exemple de Prompt Utilisateur :**
> "Rappelle-moi de vérifier le serveur quand l'admin se connecte."
> "Dès que quelqu'un dit 'Bonjour', réponds 'Salut !'."

## 🛠️ Modifications Techniques

### 1. Base de Données (`autonomous_goals`)
Extension de la table pour stocker les conditions.
*   **Action Requise :** Exécuter la migration SQL.
*   Fichier : `supabase/migrations/20260122_support_event_triggers.sql`

### 2. Service (`goalsService.js`)
*   Ajout de la méthode `checkEventTriggers(message)` qui compare chaque message entrant avec les objectifs en attente.
*   Mise à jour de `createGoal` pour stocker les types `EVENT`.

### 3. Cerveau (`core/index.js`)
*   Injection d'un "Event Listener" dans la boucle de réception de messages (`_handleMessage`).
*   Si un objectif est déclenché, le système injecte un pseudo-message `SYSTEM_GOAL_TRIGGER` pour forcer le bot à agir immédiatement.

### 4. Plugin (`plugins/goals`)
*   Mise à jour de la définition de l'outil pour exposer `waitForUser` et `waitForKeyword` au LLM.

## 🧪 Comment Tester ?
1.  **SQL :** Lancez la migration.
2.  **Prompt :** "Dès que j'écris le mot 'TEST_TRIGGER', dis-moi que ça marche."
3.  **Action :** Écrivez un message quelconque (rien ne se passe).
4.  **Action :** Écrivez "Ceci est un TEST_TRIGGER".
5.  **Résultat :** Le bot doit répondre "Ça marche !".
