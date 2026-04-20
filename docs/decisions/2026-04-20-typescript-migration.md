# Migration vers TypeScript et Application des Normes HIVE-MIND

**Auteur :** Antigravity  
**Date :** 2026-04-20  
**Statut :** Approuvé  
**Reviewers :** Christ-Leandre (USER)

---

## 1. Contexte et problème

Le projet HIVE-MIND a atteint une taille critique (plus de 130 fichiers, ~5000+ lignes de code Javascript), avec notamment un ordonnanceur central (`core/index.js`) qui accumule plus de 2000 lignes. Le Javascript libre montre ses limites pour maintenir la stabilité de ce projet, rendant les refactorisations risquées, le débogage complexe (erreurs de runtime courantes comme les fameux `undefined is not a function`), et l'intégration de nouvelles architectures SLM-V3 difficile.

Pour atteindre le niveau "Enterprise Production" respectant nos `user_global` rules (notamment SOLID, Clean Code, Layered Architecture et Zero Regression), une migration stricte vers TypeScript est devenue impérative.

## 2. Objectifs

### Ce que cette solution DOIT accomplir (must-have) :
- Éliminer l'ensemble des erreurs de type au runtime.
- Appliquer rigoureusement la **Règle 25** (mode strict sans exception : `strict: true`, pas de `any`).
- Démanteler le "God Object" `BotCore` (infraction à la **Règle 17** - Responsabilité Unique) en plusieurs sous-services dédiés (Transport, Routing, Context, etc.).
- Introduire `Zod` (ou équivalent) pour valider rigoureusement toutes les données des APIs externes au Runtime (**Règle 66**).

### Ce qu'elle ne cherche PAS à résoudre (out of scope) :
- Refondre entièrement la logique métier existante des plugins.
- Changer de moteur d'interaction principal (nous gardons Baileys et Supabase).

## 3. Proposition de solution

La migration sera découpée selon une **stratégie incrémentale ascendante (Bottom-Up)** pour éviter la paralysie (Big Bang) :
1. **Couche Infrastructure** : Installation de `typescript`, configuration stricte (`tsconfig.json`), et conservation du système de modules ESM pour préserver l'écosystème actuel. Utilisation de `tsx` pour l'exécution fluide en développement.
2. **Couche Fondations** : Migration des répertoires `/config` et `/utils`. Mise en place de schémas Zod pour blinder le runtime des données externes.
3. **Couche Services** : Conversion des classes existantes (`StateManager`, `UserService`) en TypeScript. Application poussée des principes SOLID.
4. **Couche Core** : Déconstruction du `core/index.js` en injectant un conteneur d'Injection de Dépendances (DI) propre, respectant la **Règle 21**. Modification du routeur pour un traitement asynchrone sécurisé, accompagné d'une propagation correcte des erreurs via retour de résultat typé (Result types ou try/catch isolés).
5. **Couche Extérieure** : Harmonisation des interfaces des `plugins` et `providers`.

## 4. Alternatives considérées

### Option A — Migration "Big Bang" (Tout d'un coup) *(rejetée)*
Migration complète de toute l'arborescence JS -> TS dans la même PR, en figeant le code pendant plusieurs jours.  
**Raison du rejet :** Projet trop grand. Risque majeur de régression en production, et complexité monstrueuse des conflits Git si l'équipe continue de travailler.

### Option B — JSDoc (Typage via commentaires) *(rejetée)*
Conserver les fichiers en `.js` natif mais s'appuyer massivement sur `/** @type { ... } */` via TypeScript en mode checkJs.  
**Raison du rejet :** Bien que non-intrusif, cela devient extrêmement verbeux et va à l'encontre des règles de "Clean Code" et ne fournit ni les Interfaces ni de garanties statiques aussi solides qu'un compilateur TS dédié. Également, l'architecture SLM-V3 cible nécessite des modélisations de `Result` et de polymorphisme difficiles à lier sous JSDoc.

## 5. Compromis et risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Conflits ESM vs CJS | Moyen | Élevé (Crash runtime fatal) | Conserver `type: module` dans package.json, forcer les extensions explicites `.js` dans les imports en `tsconfig`, config `module: ESNext` |
| Baisse temporaire de vélocité | Élevée | Moyen | Accepter ce ralentissement et réaliser la migration de façon Bottom-up pour que les fondations stabilisées accélèrent progressivement le reste du typage. |
| Perte inattendue de fonctionnalités (Plugins non typés) | Moyen | Moyen | Mettre en place la validation de schéma Zod dès l'entrée des données, implémenter un fallback sûr (`any` *temporaire* isolé ou `unknown` strict par défaut) pour les plugins obsolètes. |

## 6. Plan d'implémentation

- [ ] **Étape 0** — Sauvegarde de l'état actuel sur GitHub (Checkpoint de sécurité pour Rollback) — Antigravity/USER
- [ ] **Étape 1** — Cartographie (Blueprint) des dépendances des fichiers et fonctions pour éviter le code mort — Antigravity
- [ ] **Étape 2** — Configuration environnement (`package.json`, `tsconfig.json`) — Antigravity
- [ ] **Étape 3** — Déploiement validation Zod sur la couche de Configuration — Antigravity
- [ ] **Étape 4** — Migration des modules utilitaires (ex: `utils/`) — Antigravity
- [ ] **Étape 5** — Typage et décomposition des Singletons dans `services/` — Antigravity
- [ ] **Étape 6** — Refactorisation lourde du coeur (`core/index.js` divisé) — Antigravity
- [ ] **Étape 7** — Mise à jour de la CLI du projet pour supporter TypeScript — Antigravity
- [ ] **Étape 8** — Vérification E2E et Tests Unitaires — Antigravity
- [ ] **Étape 9** — Mise à jour des guides d'utilisation/documentation existante — Antigravity 

## 7. Questions ouvertes

- [ ] Devons-nous utiliser un bundler (type `esbuild` ou `tsup`) pour générer le livrable final en production, ou l'exécution via compilateur JIT/standard TS (ex: `tsx` / `node.js` après `tsc`) suffit-elle pour vos déploiements actuels sur serveur ?
