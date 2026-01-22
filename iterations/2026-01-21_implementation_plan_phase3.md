# Plan d'Implémentation : Phase 3 - Résilience et Reprise 🔄

**Objectif :** Garantir que le bot peut reprendre ses plans complexes (via `Planner`) même après un crash ou un redémarrage, en résolvant le syndrome "Run-to-Death".

## État Actuel
*   `ActionMemory.js` sauvegarde le **début** de l'action dans Supabase (`agent_actions`), mais les **étapes intermédiaires** ne sont sauvegardées que dans Redis (mémoire volatile).
*   Si le bot redémarre, Redis peut persister l'état (si configuré), mais le bot n'a aucun mécanisme au démarrage pour vérifier "Tiens, avais-je un plan en cours ?" et le relancer.

## Changements Proposés

### 1. Persistance Robuste (`services/memory/ActionMemory.js`)
*   **Modifier** `updateStep()` : En plus de Redis, mettre à jour la colonne `steps` (JSON) dans la table `agent_actions` de Supabase.
*   **Modifier** `getActionState()` (ou créer) : Une méthode capable de reconstruire l'état complet depuis Supabase si Redis est vide.

### 2. Mécanisme de Reprise (`core/index.js`)
*   **Créer** `_resumePendingActions()` :
    *   Au démarrage (`init()`), scanner Redis/Supabase pour trouver des actions avec `status: 'active'`.
    *   Si trouvé, notifier l'admin/user : "♻️ J'ai une tâche interrompue : [Goal]. Je reprends..."
    *   Relancer le `Planner` avec l'état existant (injecter les étapes déjà complétées).

## Fichiers Impactés
*   `services/memory/ActionMemory.js` (Persistance)
*   `core/index.js` (Logique de reprise au démarrage)

## Plan de Vérification

### Test Manuel : Simulation de Crash
1.  Lancer une tâche longue : "Écris un poème de 10 strophes et explique chacune." (Planner activé).
2.  Pendant l'exécution (ex: étape 2/10), tuer le processus (`CTRL+C` ou `.shutdown`).
3.  Relancer le bot.
4.  **Vérifier** :
    *   Le bot détecte l'action interrompue.
    *   Le bot envoie un message "Je reprends...".
    *   Le bot continue à partir de l'étape 3 (ou recommence proprement sans erreur).

### Test de Persistance
1.  Vérifier dans Supabase que le tableau `steps` se remplit en temps réel.
