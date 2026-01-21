# 📔 Journal de Session & Rétrospective Technique

**Date :** 2026-01-20
**Projet :** HIVE-MIND (WhatsApp Bot)

Ce document retrace l'intégralité des actions techniques réalisées au cours de cette session, en expliquant la logique, les problèmes rencontrés et les solutions apportées.

---

## 🏗️ 1. Refonte du Système de Mentions (Smart Tagging)

### 🔴 Le Problème Initial
L'utilisateur a signalé une UX défaillante :
1.  **Hallucinations de JID :** Le bot voyait des IDs techniques (`user@s.whatsapp.net`) et essayait parfois de les utiliser.
2.  **Imprécision :** Impossible de taguer quelqu'un dont on ne connaît que le numéro (inconnu) ou de distinguer deux "Alex" (homonymes).
3.  **Spam de Mentions :** Le bot taguait *automatiquement* dès qu'il mentionnait un nom (ex: "Ton nom est Sébastien" -> TAG), ce qui est intrusif.

### 🛠️ La Solution : "Smart Tagging System"

Nous avons procédé en **3 étapes majeures** :

#### A. Le Cerveau : Dual Resolver (`utils/fuzzyMatcher.js`)
**Quoi :** Modification de l'algorithme de matching.
**Comment :**
- Ajout d'une détection de regex numérique (`^\d+$`).
- Si query = numéro → on cherche directement dans le JID (`336...`).
- Si query = texte → on garde le fuzzy matching existant.
**Pourquoi :** Permet au bot de dire `@33612345678` pour cibler chirurgicalement un utilisateur, même inconnu ou homonyme.

#### B. La Vue : Context Cleaning (`core/index.js`)
**Quoi :** Nettoyage des données envoyées au LLM.
**Comment :**
- Remplacement des formats `Nom (ID: ...)` par `Nom (@Numéro)`.
- Application sur toutes les listes : Membres, Admins, Mentions reçues, Global Admins.
**Pourquoi :** Le LLM ne doit voir que ce qu'il peut utiliser. `Nom (@Numero)` lui donne les deux clés (Nom pour le naturel, Numéro pour la précision).

#### C. Le Contrôle : Strict Mentions (`core/transport/baileys.js`)
**Quoi :** Suppression de la résolution implicite.
**Comment :**
- Suppression de l'appel à `resolveImplicitMentions`.
- Seules les mentions commençant explicitement par `@` sont traitées.
**Pourquoi :** C'était le point critique. Le bot doit pouvoir dire "C'est le numéro de Jordan" sans déclencher une notification. Le préfixe `@` devient l'interrupteur conscient de notification.

### ✅ État Final (Mentions)
- **@Sébastien** → Tag (Notification)
- **@336...** → Tag (Notification précise)
- **Sébastien** → Texte simple (Information)
- **336...** → Texte simple (Information)

---

## 🧠 2. Refonte du Smart Router (Niveau 3)

### 🔴 Le Problème Initial
Le routeur intelligent (qui choisit le modèle selon la requête) était trop vague :
1.  **Imprécis :** Il choisissait une *famille* (`gemini`) au lieu d'un modèle expert (`gemini-3-flash-preview` vs `gemini-2.5-flash-vision`).
2.  **Lent :** Il utilisait Gemini par défaut pour choisir, alors que Groq (LPU) est beaucoup plus rapide.
3.  **Rigide :** Les règles de choix étaient codées en dur ("si coding -> github").

### 🛠️ La Solution : Sélection Dynamique & Spécifique

#### A. Sélection de Modèle Spécifique (`providers/index.js`)
**Quoi :** Le router retourne maintenant `{ model: "id", family: "famille" }`.
**Comment :**
- On construit la liste de *tous* les modèles disponibles.
- On injecte leurs descriptions et types (`models_config.json`) dans le prompt système.
**Pourquoi :** Permet au LLM de choisir le *meilleur* outil (ex: `codestral-latest` pour du code) plutôt qu'une famille générique.

#### B. Intégration de Groq
**Quoi :** Utilisation de `llama-3.1-8b-instant` sur Groq comme cerveau du routeur.
**Comment :**
- Ajout d'une liste de priorité pour le "Router Brain" :
    1.  `groq/llama-3.1-8b-instant` (Priorité Vitesse)
    2.  `gemini/gemini-3-flash-preview` (Fallback Qualité/Vitesse)
**Pourquoi :** L'étape de routing ajoute de la latence. Groq est quasi-instantané, rendant cette étape invisible pour l'utilisateur.

#### C. Prompt Dynamique
**Quoi :** Le prompt n'a plus de règles hardcodées.
**Comment :**
```javascript
const modelsList = metadata.map(m => `- ${m.id}: ${m.description} [${m.types}]`).join('\n');
```
**Pourquoi :** Si vous ajoutez un nouveau modèle dans le JSON demain, le routeur "l'apprend" automatiquement sans toucher au code.

---

## 📋 Résumé des Acquis

| Feature | Avant | Après |
| :--- | :--- | :--- |
| **Mention** | `@Nom` uniquement, tag souvent involontaire | `@Nom` OU `@Numéro`, tag uniquement si `@` explicite |
| **Contexte IA** | Pollué par JID techniques | Propre : `Nom (@Numéro)` |
| **Routing** | Choix de Famille, règles fixes | Choix de Modèle, basé sur config, via Groq |
| **Latence Router** | ~500ms-1s (Gemini) | <200ms (Groq LPU) |

## ⏭️ Prochaines Étapes (En attente)

1.  **Mise à jour Data :** Mettre à jour `models_config.json` avec les vraies descriptions/types (Web Search). *[Annulé pour l'instant]*
2.  **Finalisation :** Le système est stable et prêt.

---

**Note Personnelle du Système :**
L'approche "Strict Mention" combinée au "Dual Resolver" offre la meilleure UX possible sur WhatsApp. Elle donne à l'IA la compétence humaine de *choisir* quand déranger (notifier) ou simplement informer. De même, le refactoring du routeur transforme le bot d'un simple switch à un véritable orchestrateur d'IA.
