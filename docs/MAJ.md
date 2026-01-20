# 📅 Feuille de Route & Futures Mises à Jour (MAJ)

Ce document recense les améliorations techniques identifiées mais non encore implémentées, à prévoir pour les futures versions (v3.5+).

---

## 🚀 Priorité Haute : Gestion de l'Identité (Speaker Injection)

### Le Problème Actuel
Actuellement, l'historique des conversation (Working Memory) stocké dans Redis est "anonyme".
L'IA reçoit :
```
User: J'aime X
User: Je déteste X
```
Elle ne peut pas distinguer qui parle dans un groupe si ce n'est pas le message immédiat.

### La Solution Proposée (Hybrid Injection)
Modifier le format de stockage pour inclure le nom de l'auteur et un hash unique, **séparés**, pour éviter que l'IA ne mélange les deux dans sa réponse.

**Format Cible :**
```json
// Avant
{ "role": "user", "content": "Salut" }

// Après (Hybrid Injection - Format "Safe UX")
{ "role": "user", "content": "[Christ-Léandre] [A7X]: Salut" } 
```
*Note : On sépare `[Nom]` et `[Hash]` pour éviter que l'IA ne répète "Christ-Léandre #A7X" en s'adressant à l'utilisateur.*

### Étapes d'Implémentation
1.  **Working Memory** : Modifier `addMessage` pour accepter `senderName` et générer un Hash court (3 chars) du userJid.
2.  **Formatter** : Construire la chaîne `[Nom] [Hash]: Message`.
3.  **Core** : Passer les infos au service de mémoire.

---

## 🔧 Autres Améliorations Techniques


## ⏳ Gestion du Temps (RAG Temporel)

### Le Problème
L'IA reçoit des souvenirs en vrac :
- Souvenir A: "J'adore les pommes"
- Souvenir B: "Je suis devenu allergique aux pommes"
Sans notion de temps, elle ne sait pas quelle info prévaut (la plus récente). Elle risque de proposer une pomme.

### La Solution
Injecter le contexte temporel (Date relative ou absolue) dans chaque souvenir récupéré.

**Format Cible dans le Prompt :**
```
### 🧠 SOUVENIRS PERTINENTS
- [Il y a 6 mois] J'adore les pommes
- [Hier] Je suis devenu allergique aux pommes (CONTEXTE ACTUEL)
```

### Étapes d'Implémentation
1.  **Supabase** : S'assurer que les chunks vectoriels ont une colonne `created_at` indexée.
2.  **Memory Service** : Lors du `recall()`, récupérer cette date.
3.  **Prompt Builder** : Calculer la différence avec `Date.now()` et formater l'injection (ex: "Il y a X jours").