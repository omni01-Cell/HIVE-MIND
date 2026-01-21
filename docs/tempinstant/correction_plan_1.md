# Correction Plan 1: Optimisation & Fixes

Ce plan adresse les régressions identifiées lors des derniers tests.

## User Review Required

> [!IMPORTANT]
> L'introduction du **Switch Agentic/Banal** va modifier la réactivité du bot. Les demandes simples (ex: "Salut", "Merci") ne déclencheront plus de boucle de réflexion longue.

> [!WARNING]
> **Signature Gemini**: Les champs `thoughtSignature` seront filtrés pour éviter toute pollution visuelle dans les logs et réponses.

---

## Proposed Changes

### 1. Fix: react_to_message plugin
- Vérifier pourquoi l'outil ne s'exécute pas.
- Assurer le lien entre le plugin et le transport Baileys.

### 2. Flux: Agentic Switch Logic
- Modifier `core/index.js` pour inclure une phase de pré-classification.
- Si la demande est "banale" (conversation simple sans besoin de tools complexes) : Passer par un appel LLM direct sans boucle agentique.
- Si la demande est "action-oriented" : Utiliser la boucle complète.

### 3. Fix: VoiceProvider & TTS
- Corriger l'erreur `this.quotaManager.canUse is not a function`.
- Vérifier les adaptateurs Gemini pour le TTS natif.
- S'assurer que les clés API sont correctement transmises.

### 4. Cleanup: Log & Signatures
- Nettoyer les sorties brutes des modèles avant log/traitement.
- Supprimer le "bruit" des jobs de scheduler dans le flux de message principal.

---

## Verification Plan

### Automated Tests
- Test du switch : "Salut" vs "Cherche sur le web la météo". Vérifier si 1 vs 2+ étapes.
- Test TTS : `.tts Test de voix`.
- Test Réaction : "Réagis avec un ✨ à mon message".

### Manual Verification
- Observation des logs console pour confirmer la disparition des signatures et du bruit inutile.
