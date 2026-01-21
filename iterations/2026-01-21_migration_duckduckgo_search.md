# 🦆 Migration: Retrait de Google Search → DuckDuckGo Uniquement

**Date:** 2026-01-21  
**Raison:** L'API JSON Custom Search de Google sera dépréciée le **1er janvier 2027**  
**Solution:** Utilisation exclusive de DuckDuckGo pour les recherches web

---

## 📋 Changements Effectués

### 1. Plugin Web Search
**Fichier:** `plugins/web_search/index.js`

#### Avant
- ✅ Google Custom Search API (primaire)
- 🔄 DuckDuckGo scraping (fallback)

#### Après
- 🦆 **DuckDuckGo scraping uniquement**
- ❌ Google Search retiré complètement

**Avantages:**
- ✅ Pas de clé API requise
- ✅ Gratuit et illimité
- ✅ Pas de quota à gérer
- ✅ Plus simple à maintenir

---

### 2. Fichiers de Configuration

#### `config/credentials.json`
```diff
- "google_search": {
-     "apiKey": "VOTRE_CLE_GOOGLE_SEARCH_API",
-     "cseId": "VOTRE_SEARCH_ENGINE_ID"
- }
```

#### `config/index.js`
```diff
- googleSearch: {
-     apiKey: process.env.GOOGLE_SEARCH_API_KEY,
-     cseId: process.env.GOOGLE_SEARCH_CSE_ID
- }
```

#### `.env.example`
```diff
- # =================== SERVICES EXTERNES ===================
- # Google Custom Search (optionnel, pour web_search)
- VOTRE_CLE_GOOGLE_SEARCH_API=your-google-api-key
- VOTRE_SEARCH_ENGINE_ID=your-custom-search-engine-id
```

---

### 3. Documentation

#### `docs/COMMANDS.md`
```diff
- | **Recherche Web** | Cherche sur Google (Actus, Météo, Faits). |
+ | **Recherche Web** | Cherche sur DuckDuckGo (Actus, Météo, Faits). |

- *(Note: La clé API Google Search doit être configurée dans credentials.json)*
```

---

## 🔧 Impact Utilisateur

### Avant
```
User: "Météo Paris"
Bot: 🔎 Résultats Google pour "Météo Paris":...
```

### Après
```
User: "Météo Paris"
Bot: 🦆 Résultats DuckDuckGo pour "Météo Paris":...
```

**Note:** L'expérience utilisateur reste identique, seul l'emoji change.

---

## ✅ Validation

### Test de Fonctionnalité
Pour vérifier que le plugin fonctionne:

```javascript
// Dans un groupe WhatsApp
"Quelle est la météo à Paris ?"
"Qui a gagné le dernier match de la Ligue 1 ?"
```

### Résultat Attendu
- ✅ Le bot répond avec des résultats DuckDuckGo
- ✅ Format: Titre, Lien, Extrait
- ✅ 3-5 résultats retournés

---

## 📊 Comparaison Technique

| Critère | Google Search API | DuckDuckGo Scraping |
|---------|------------------|---------------------|
| **Coût** | Gratuit jusqu'à 100/jour | 100% gratuit |
| **Quota** | Limité | Illimité |
| **Setup** | Clé API + CSE ID requis | Aucun |
| **Maintenance** | Dépréciée en 2027 | Stable |
| **Qualité** | Excellente | Très bonne |
| **Rate Limiting** | Oui | Minimal |

---

## 🎯 Recommandations Futures

### Option 1: Continuer avec DuckDuckGo
- ✅ Simple, gratuit, fonctionne bien
- ⚠️ Scraping HTML peut casser si DDG change leur markup

### Option 2: Vertex AI Search (Google)
Alternative suggérée par Google après dépréciation:
- Requiert migration vers nouveau service
- Plus complexe à configurer
- Potentiellement payant

**RECOMMANDATION:** Rester avec DuckDuckGo scraping pour l'instant.

---

## 🔍 Contexte: Notification Google

L'image partagée par l'utilisateur indique:

> **Remarque:** L'API JSON Custom Search n'est plus disponible pour les nouveaux clients. Vertex AI Search est une alternative intéressante pour effectuer des recherches sur un maximum de 50 domaines.
> 
> Les clients existants de l'API JSON Custom Search ont jusqu'au **1er janvier 2027** pour passer à une autre solution.

Source: Console Google Custom Search

---

**Migration complétée avec succès.** 🚀
