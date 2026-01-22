# Plan d'Implémentation : Déclencheurs Autonomes (Wait For X) ⏳

**Objectif :** Permettre au bot de programmer des actions qui ne se déclenchent pas uniquement à une heure précise, mais en réponse à un **événement externe** (ex: "Attends que Jean réponde", "Dès que quelqu'un parle de 'Projet X'").

## Analyse de l'Existant vs Demande
*   **Existe déjà :** Programmation temporelle (`execute_at`). C'est redondant de recréer ça.
*   **Manque :** Programmation événementielle (`trigger_type`). C'est la nouveauté demandée.

## Changements Proposés

### 1. Base de Données (`autonomous_goals`)
Extension de la table pour supporter les types de déclencheurs.
*   Ajout colonne `trigger_type` (Enum: `TIME` (défaut), `EVENT`).
*   Ajout colonne `trigger_event` (ex: `WAIT_FOR_MESSAGE`, `WAIT_FOR_JOIN`).
*   Ajout colonne `trigger_condition` (JSONB, ex: `{ from_user: "xxx", contains: "budget" }`).

### 2. Logique de Détection (`services/goalsService.js` & `core/index.js`)
Contrairement aux tâches temporelles gérées par le *Scheduler* (polling toutes les minutes), les tâches événementielles doivent être vérifiées **en temps réel**.

*   **Hook :** Dans `core/index.js` -> `_onMessage`.
*   **Action :** À chaque message reçu, appeler `goalsService.checkEventTriggers(message)`.
*   **Logique :** Si un message correspond à une condition d'attente (ex: message de Jean), alors :
    1.  Marquer le goal comme `TRIGGERED`.
    2.  Exécuter l'action associée (via le même mécanisme que le Scheduler : `SYSTEM_GOAL_TRIGGER`).

### 3. Exemples de Flux
> **User :** "Relance-moi quand Jean répond."
> **Bot :** Crée un goal : 
> - `trigger_type`: `EVENT`
> - `trigger_event`: `WAIT_FOR_MESSAGE`
> - `trigger_condition`: `{ sender_name: "Jean" }`
> - `action`: "Analyser la réponse de Jean et notifier l'utilisateur".

## Fichiers Impactés
*   `supabase/migrations/xxxx_add_event_triggers.sql` (Schema)
*   `services/goalsService.js` (Logique de vérification)
*   `core/index.js` (Appel du vérificateur)
*   `plugins/goals/index.js` (Mise à jour de l'outil `create_goal`)

## Validation
1.  **Test Manuel :** Demander au bot "Dès que je dis 'Banane', raconte une blague".
2.  **Action :** Envoyer un message "Pomme" (Rien ne se passe).
3.  **Action :** Envoyer un message "Banane".
4.  **Résultat :** Le bot se réveille et raconte une blague.
