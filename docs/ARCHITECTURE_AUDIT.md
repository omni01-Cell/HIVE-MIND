# 🏗️ Audit Architecture & Propositions d'Évolution

## 1. Limites du Système Actuel (v3.0)

### 🚨 1.1 Perte de "Speaker Diarization" (Qui parle ?)
**Problème :** L'historique court terme (Redis) stocke uniquement `{ role: 'user', content: '...' }`.
**Conséquence :** Dans un groupe, l'IA est aveugle.
- Alice dit : "J'aime les pommes"
- Bob dit : "Je déteste ça"
- L'IA reçoit : 
  1. User: "J'aime les pommes"
  2. User: "Je déteste ça"
-> L'IA pense que l'utilisateur est contradictoire, car elle ne sait pas que ce sont deux personnes différentes.
-> **L'IA ne peut pas gérer les débats ou les conversations multi-acteurs correctement.**

### ⚠️ 1.2 Hallucination d'Identité
**Problème :** Le `System Prompt` contient "Interlocuteur : Christ-Léandre", mais l'historique contient des messages qui peuvent venir d'autres personnes (avant que Christ-Léandre ne parle).
**Conséquence :** L'IA attribue potentiellement les propos des autres à l'interlocuteur actuel.

### 🔒 1.3 Sécurité & Usurpation (Spoofing)
**Problème :** L'identification repose uniquement sur la résolution de noms (`userService`).
**Risque :** Si deux utilisateurs s'appellent "Thomas", l'IA les confondra totalement dans sa "mémoire" et ses réponses. Pas de lien fort avec l'ID technique (JID) dans la couche cognitive.

### 🧠 1.4 Mémoire "Plate"
**Problème :** Le RAG (Supabase) injecte des morceaux de texte sans savoir *quand* ni *dans quel contexte* ils ont été dits.
**Conséquence :** L'IA manque de temporalité ("C'était hier" vs "Il y a un an").

---

## 2. Propositions d'Amélioration (Vers v3.5)

### ✅ Proposition A : "Speaker Injection" (Recommandé)
Modifier le format des messages envoyés à l'IA pour inclure le nom de l'auteur directement dans le contenu.

**Format Actuel :**
```json
{ "role": "user", "content": "Salut ça va ?" }
```

**Nouveau Format :**
```json
{ "role": "user", "content": "[Christ-Léandre]: Salut ça va ?" }
```
**Avantages :** 
- L'IA distingue immédiatement qui parle.
- Compatible avec tous les modèles (OpenAI, Gemini, Mistral).
- Ne nécessite pas de changer l'API (juste le prompt).

### 🛡️ Proposition B : "Anonymous Hash ID"
Injecter un Hash court unique pour chaque utilisateur pour garantir l'identité sans fuiter le numéro.

**Format :**
```json
{ "role": "user", "content": "[User #A7X2]: Salut" }
```
**Avantages :** Zéro collision possible. Confidentialité technique préservée.
**Inconvénients :** Moins naturel pour l'IA ("User #A7X2" vs "Christ-Léandre").

### 🚀 Proposition C : "OpenAI Name Field" (Spécifique OpenAI)
Utiliser le champ `name` officiel de l'API OpenAI.

**Format :**
```json
{ "role": "user", "name": "Christ_Leandre", "content": "Salut" }
```
**Avantages :** Le plus "propre" techniquement.
**Inconvénients :** Ne fonctionne PAS ou mal avec Gemini/Mistral/Local qui ignorent souvent ce champ.

---

## 3. Plan d'Action Recommandé

Je suggère d'implémenter la **Proposition A (Speaker Injection)** combinée à une **Refonte de la Working Memory**.

1.  **Update WorkingMemory** : Stocker `{ role, content, author_name, author_hash }` dans Redis au lieu de juste `{ role, content }`.
2.  **Update Core** : Lors de la construction de l'historique pour l'API, préfixer le contenu avec `[Nom]: ` si le message vient d'un groupe.
3.  **Update RAG** : Indexer les métadonnées (auteur) avec les vecteurs pour permettre des questions comme "Qu'est-ce que Thomas a dit sur le projet ?".

Qu'en penses-tu ?
