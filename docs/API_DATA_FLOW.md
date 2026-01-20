# 📡 API Data Injection Plan

Ce document détaille précisément les données injectées (payloads JSON) lors des appels aux différentes APIs d'Intelligence Artificielle.

---

## 0. Data Aggregation & Context Injection (Pre-API)
Avant tout appel au routeur, le `Core` (`core/index.js`) agrège des données provenant de plusieurs sources (Redis, Supabase) pour construire le **System Prompt** et l'**Historique**. Ces données sont invisibles dans le payload brut de l'adapteur mais cruciales.

### Sources de Données
1.  **Working Memory (Redis)** :
    *   **Donnée :** `shortTermContext` (10-20 derniers messages du chat actuel).
    *   **Injection :** Concaténé dans le tableau `messages` avant le message utilisateur.
    *   **But :** Mémoire à court terme, suivi de conversation.

2.  **Semantic Memory (Supabase Vector)** :
    *   **Donnée :** `memories` (Extrait de la base documentaire RAG).
    *   **Injection :** Remplacé dans le System Prompt via `{{memories}}`.
    *   **But :** Connaissance encyclopédique ou souvenirs à long terme.

3.  **Facts Memory (Supabase)** :
    *   **Donnée :** Clés-valeurs sur l'utilisateur (ex: "surnom: Seb", "ville: Paris").
    *   **Injection :** Remplacé dans le System Prompt via `{{facts}}`.
    *   **But :** Personnalisation.

4.  **Social Context (Redis/DB)** :
    *   **Donnée :** Liste des admins, nom du groupe, rôle de l'expéditeur.
    *   **Injection :** Remplacé dans le System Prompt via `{{context}}` et `{{social}}`.
    *   **But :** Sécurité (savoir qui est admin) et conscience sociale.

5.  **User Profile (Supabase)** :
    *   **Donnée :** Nom, XP, Niveau de l'utilisateur.
    *   **Injection :** Utilisé pour le nom de l'expéditeur dans les messages.

---

## 1. OpenAI Integration
**Endpoint:** `POST https://api.openai.com/v1/chat/completions`  
**Adapter:** `providers/adapters/openai.js`

### Payload JSON Injecté (Body)
```json
{
  "model": "gpt-4o-mini",          // ou modèle configuré
  "messages": [
    {
      "role": "system",
      "content": "Tu es une IA... [Données RAG injectées ici] [Faits user injectés ici]" 
    },
    {
      "role": "user",
      "content": "Salut !"         // Message utilisateur
    }
  ],
  "temperature": 0.7,              // Par défaut 0.7
  "max_tokens": 1000,              // Hardcodé
  
  // Optionnel : Injecté seulement si des outils sont disponibles
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "nom_outil",
        "description": "description...",
        "parameters": { ...JSON Schema... }
      }
    }
  ],
  "tool_choice": "auto"            // Forcé si tools présent
}
```

---

## 2. Google Gemini Integration
**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent?key={API_KEY}`  
**Adapter:** `providers/adapters/gemini.js`

### Specificités
- Le rôle `assistant` est converti en `model`.
- Le prompt système est extrait des messages et envoyé dans un champ séparé `systemInstruction`.

### Payload JSON Injecté (Body)
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Salut !" }
      ]
    },
    {
      "role": "model",             // Adaptation du role 'assistant'
      "parts": [
        { "text": "Bonjour !" }
      ]
    }
  ],
  
  "systemInstruction": {           // Extrait du message role='system' et enrichi par Redis/Supabase
    "parts": [
      { "text": "Tu es une IA... [Context RAG] [Context Social]" }
    ]
  },
  
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 1000
  },
  
  // Optionnel : Injecté si tools présents
  "tools": [
    {
      "functionDeclarations": [    // Format spécifique Google
        {
          "name": "nom_outil",
          "description": "description...",
          "parameters": { ...JSON Schema... }
        }
      ]
    }
  ]
}
```

---

## 3. Mistral AI Integration
**Endpoint:** `POST https://api.mistral.ai/v1/chat/completions`  
**Adapter:** `providers/adapters/mistral.js`

### Payload JSON Injecté (Body)
Identique au format OpenAI standard.

```json
{
  "model": "mistral-small-latest", // Par défaut
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 1000,
  "tools": [...],                  // Format OpenAI standard
  "tool_choice": "auto"
}
```

---

## 4. Flux de Données Global (Pipeline)

Le `ProviderRouter` (`providers/index.js`) orchestre les données avant l'injection :

1.  **Réception :** `chat(messages, options)`
2.  **Enrichissement :** Ajout de `apiKey`, `familyConfig` depuis les fichiers de config.
3.  **Filtrage :** Vérification des quotas via `QuotaManager`.
4.  **Adaptation :** L'adaptateur spécifique (ex: `gemini.js`) transforme le format standard (OpenAI-like) vers le format propriétaire de l'API cible.
5.  **Injection :** Envoi de la requête HTTP.
