# Plan de Correction : Silence Agentique (Lost Agents)
**Date** : 2026-01-21
**Contexte** : Correction du bug où le bot reste muet si l'IA renvoie un contenu null ou uniquement technique.

## 1. Modifications du Core Orchestration

### [MODIFY] `core/index.js`
*   **Fallback d'Itération** : Si `finalResponse` est nul après des itérations (cycles de réflexion), une réponse par défaut est injectée au lieu d'annuler l'envoi.
    - *Raison* : Éviter que l'utilisateur pense que le bot a planté alors qu'il a juste "oublié" de répondre textuellement après avoir utilisé des outils.
*   **Nettoyage de Pensée (Safety)** : Utilisation de l'optional chaining (`?.`) sur `finalResponse` avant d'appliquer `.includes('<thought>')`.
    - *Raison* : Prévenir les crashs `TypeError` si le modèle renvoie un objet non-string.

## 2. Optimisation des Adaptateurs

### [MODIFY] `providers/adapters/gemini.js`
*   **Extraction Multi-Parts** : Remplacement de l'extraction simple par une boucle `filter/map/join` sur toutes les `parts` de type texte.
    - *Raison* : Gemini sépare parfois le contenu textuel des blocs de pensée ou de tool calling. Capturer uniquement la première part entraînait une perte d'information.
*   **Robustesse ThoughtSignature** : Ajout de variantes de clés (`thought`, `thought_signature`) pour la capture des métadonnées de réflexion.

## 3. Protocole de Vérification
*   Simulation de réponses nulles via un script de test local.
*   Validation de la concaténation des chaînes de caractères multi-lignes.
