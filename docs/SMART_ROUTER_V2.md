# Smart Router V2 : Ultra-Resilience & Multi-Key Logic

Ce document détaille la nouvelle architecture du Smart Router pour maximiser la disponibilité gratuite (Zero-Cost) et l'efficacité du système en isolant les modèles audio/live et en gérant une rotation intelligente de clés multiples.

## 1. Filtrage Intelligent des Modèles

Pour éviter que des modèles spécialisés (Audio, Live, TTS) ne soient chargés par erreur lors d'une session de chat texte classique, une logique de filtrage par type est mise en place.

### Modèles Exclus du Chat Texte
Les modèles possédant les types suivants dans `models_config.json` sont automatiquement écartés du pool de sélection "Chat" :
- `live_api` (ex: Gemini Live)
- `tts` (Text-to-Speech)
- `stt` / `transcription` (Speech-to-Text)
- `audio` (Modèles multimodaux orientés audio natif)

### Bénéfices
- **Économie de Quota :** Ne pas gaspiller les quotas précieux des modèles Live pour du texte simple.
- **Expérience Utilisateur :** Éviter les réponses contenant des artefacts audio ou des comportements spécifiques aux APIs de streaming là où un chat synchrone est attendu.
- **Vitesse :** Les modèles Flash Lite (363 tok/s) sont prioritaires pour le texte.

---

## 2. Rotation Multi-Clés (Logic 7-Keys)

Le système supporte désormais jusqu'à **7 clés API par fournisseur**, permettant de multiplier par 7 les limites de quotas gratuits.

### Configuration (`.env`)
Le format de nommage est standardisé pour une détection automatique :
```env
GEMINI_KEY_1=...
GEMINI_KEY_2=...
...
GEMINI_KEY_7=...

GROQ_KEY_1=...
GROQ_KEY_2=...
```

### Mécanisme de Rotation
1. **Sélection Initiale :** Le routeur commence par la clé `_1`.
2. **Détection de Quota (429) :** Si une erreur de quota est rencontrée ou si le `QuotaManager` détecte que la clé `_1` est proche de sa limite (marge de sécurité), le routeur passe **instantanément** à la clé `_2`.
3. **Persistance Redis :** L'état de chaque clé (RPM/TPM/RPD utilisé) est stocké de manière indépendante dans Redis.
4. **Fast-Switching :** La rotation se fait au niveau de l'adaptateur sans délai perceptible pour l'utilisateur.

---

## 3. QuotaManager V2 : Granularité par Clé

Le `QuotaManager` n'analyse plus seulement la santé globale d'un modèle, mais la santé du couple **(Modèle, Index de Clé)**.

### Structure des Clés Redis
Les clés de quota intègrent désormais l'index de la clé utilisée :
- `quota:{modelId}:k{index}:rpm`
- `quota:{modelId}:k{index}:tpm`
- `quota:{modelId}:k{index}:rpd`

### Circuit Breaker par Clé
Si une clé `K1` d'un fournisseur `GROQ` renvoie une erreur 429, seule cette clé `K1` est mise en "cooldown". Le système continue d'utiliser `K2` à `K7` normalement.

---

## 4. Logique de Décision du Routeur

Lors d'un appel `chat()`, le routeur suit cet algorithme :

1. **Identifier les familles candidates** (ex: Gemini, Groq).
2. **Pour chaque famille :**
   - Lister les modèles disponibles (en excluant les types `live_api`, `audio`, etc.).
   - Pour chaque modèle, vérifier quel index de clé (1-7) est actuellement "sain".
3. **Sélectionner le meilleur couple (Modèle, CléIndex).**
4. **Exécuter l'appel.**
5. **Si Échec Quota :** Marquer (Modèle, CléIndex) comme bloqué dans Redis et relancer immédiatement avec l'index suivant.

---

## 5. Guide d'Implémentation

### Étape 1 : Mise à jour de `EnvResolver`
Modifier `resolve()` pour supporter un paramètre `index` ou détecter automatiquement les suffixes `_N`.

### Étape 2 : Mise à jour de `QuotaManager`
Modifier `recordUsage` et `isModelAvailable` pour accepter un `keyIndex`.

### Étape 3 : Mise à jour de `ProviderRouter`
Modifier la boucle de cascade pour itérer non seulement sur les familles et modèles, mais aussi sur les clés disponibles.

### Étape 4 : Refactor des Adaptateurs
S'assurer que les adaptateurs (Gemini, Groq, etc.) acceptent une clé API dynamique passée par le routeur à chaque appel.
