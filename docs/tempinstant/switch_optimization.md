# Optimization: Intelligent Fast Path with Tools

L'objectif est d'accélérer le bot en permettant l'utilisation d'outils (comme les réactions) directement dans le mode `STANDARD`, sans entrer dans une boucle ReAct itérative.

## Proposed Changes

### 1. Early Classification
- Déplacer l'appel à `_classifyComplexity` au tout début de `_handleMessage`.
- Utiliser le résultat pour décider immédiatement de la stratégie.

### 2. Standard Path (Single Pass)
- Appeler le provider avec `relevantTools`.
- Si le modèle retourne des `tool_calls` :
    - Les exécuter immédiatement via `_executeTool`.
    - Ne PAS boucler pour une nouvelle réflexion.
    - Envoyer la réponse textuelle si présente.

### 3. Agentic Path (Iterative Loop)
- Conserver la boucle `while` actuelle pour les tâches complexes nécessitant plusieurs étapes (planning, recherche complexe).

---

## Verification Plan
1. **Simple Réaction** : "Réagis avec ✨". Ça doit être instantané.
2. **Recherche Web** : "Qui est le président de la France ?". Ça doit passer par la boucle agentique car c'est classé `AGENTIC`.
3. **Double Action** : "Bannis @user et réagis avec ❌". Vérifier si le mode Standard suffit ou si l'IA passe en Agentic.
