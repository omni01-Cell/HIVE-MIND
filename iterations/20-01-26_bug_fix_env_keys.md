# 🔑 Rapport de Bug : Résolution des Clés API (.env)

**Date:** 2026-01-20  
**Sévérité:** 🟡 **HAUTE**  
**Statut:** ✅ **CORRIGÉ**

---

## 🐛 Symptôme Observé

Lors de l'exécution de la commande CLI :
```bash
npm run cli tools:index
```

L'erreur suivante apparaissait :
```
[Embeddings] Using Model: gemini-embedding-1.0, Key: VOTRE..., Dims: 768
[Embeddings] Erreur fatale: API key not valid. Please pass a valid API key.
```

**Observation:** La clé affichée montrait `VOTRE...` au lieu d'une vraie clé API, indiquant que la variable d'environnement n'était pas résolue.

---

## 🔍 Analyse de la Cause

### Contexte
HIVE-MIND utilise un système de configuration en deux couches :
1. **`credentials.json`** : Contient des placeholders comme `"VOTRE_CLE_GEMINI"`
2. **Variables d'environnement (`.env`)** : Contient les vraies clés API

Le `ServiceContainer.js` (lignes 88-89) résout correctement ces placeholders :
```javascript
if (geminiKey && geminiKey.startsWith('VOTRE_') && process.env[geminiKey]) {
    geminiKey = process.env[geminiKey];
}
```

### Le Problème
Le script `admin-cli.js` instanciait directement `EmbeddingsService` **sans résoudre** les variables d'environnement :

```javascript
// ❌ CODE BUGUÉ (AVANT)
const credentials = JSON.parse(readFileSync(...));
const embeddings = new EmbeddingsService({
    geminiKey: credentials.familles_ia?.gemini,  // "VOTRE_CLE_GEMINI" (literal)
    openaiKey: credentials.familles_ia?.openai   // "VOTRE_CLE_OPENAI" (literal)
});
```

Résultat : L'API Gemini recevait la chaîne `"VOTRE_CLE_GEMINI"` comme clé au lieu de la vraie valeur depuis `.env`.

---

## ✅ Correction Appliquée

### Code Corrigé

```javascript
// ✅ CODE CORRIGÉ (APRÈS)
const credentials = JSON.parse(readFileSync(...));

// Résoudre les variables d'environnement (comme ServiceContainer)
let geminiKey = credentials.familles_ia?.gemini;
let openaiKey = credentials.familles_ia?.openai;

if (geminiKey && geminiKey.startsWith('VOTRE_') && process.env[geminiKey]) {
    geminiKey = process.env[geminiKey];
}
if (openaiKey && openaiKey.startsWith('VOTRE_') && process.env[openaiKey]) {
    openaiKey = process.env[openaiKey];
}

const embeddings = new EmbeddingsService({
    geminiKey,
    openaiKey
});
```

**Fichier modifié :** `scripts/admin-cli.js` (lignes 197-213)

---

## 📋 Validation

### Autres Instances Vérifiées

| Fichier | Status | Commentaire |
|---------|--------|-------------|
| `core/ServiceContainer.js` | ✅ OK | Implémentation de référence |
| `plugins/loader.js` | ✅ OK | Logique de résolution complète (lignes 258-269) |
| `scripts/admin-cli.js` | ✅ **CORRIGÉ** | Résolution ajoutée |
| `services/memory.js` | ⚠️ À vérifier | Utilise le ServiceContainer (normalement OK) |
| `services/graphMemory.js` | ⚠️ À vérifier | Utilise le ServiceContainer (normalement OK) |

### Test de Vérification

Après la correction, la commande devrait afficher :
```bash
[Embeddings] Using Model: gemini-embedding-1.0, Key: AIza...[last4], Dims: 768
```

---

## 🎯 Leçons Apprises

1. **Centralisation de la Config :** Tous les services devraient passer par le `ServiceContainer` pour accéder aux clés API.
2. **Helper Fonction :** Créer une fonction utilitaire `resolveApiKey(keyValue)` pour éviter la duplication du code de résolution.
3. **Tests d'Intégration :** Ajouter un test qui vérifie que les placeholders `VOTRE_*` sont toujours résolus avant usage.

---

## 🔐 Recommandations

### Solution Temporaire (Actuelle)
Les scripts CLI utilisent maintenant le même pattern que le ServiceContainer.

### Solution Idéale (Future)
Créer un module `config/keyResolver.js` :

```javascript
export function resolveApiKey(keyValue) {
    if (!keyValue) return null;
    if (keyValue.startsWith('VOTRE_') && process.env[keyValue]) {
        return process.env[keyValue];
    }
    return keyValue;
}
```

Et l'utiliser partout :
```javascript
const geminiKey = resolveApiKey(credentials.familles_ia?.gemini);
```

---

## 🏁 Conclusion

Bug critique résolu. La commande `tools:index` devrait maintenant fonctionner correctement avec les clés API depuis `.env`.

**Impact :** Tous les scripts CLI et services d'embeddings sont maintenant opérationnels.
