

# Spécifications Fonctionnelles Détaillées (SFD) : Architecture Omni-Reflex
**Auteur** : Architecte Logiciel Senior & Business Analyst
**Date** : 25 Janvier 2026
**Projet** : HIVE-MIND Refactoring Phase 3

---

## 1. Résumé Exécutif
L'objectif business est de transformer HIVE-MIND en un service "Top Performer" capable de rivaliser avec les meilleurs agents IA du marché en termes de latence et de pertinence. La solution repose sur l'architecture **Omni-Reflex**, qui unifie l'action et la connaissance sans compromis.

## 2. Objectifs Business & KPIs
*   **Performance (L0)** : Réponse < 2s pour les interactions simples.
*   **Fiabilité (RAG)** : 0 "trous de mémoire" grâce à l'injection systématique du contexte pertinent.
*   **Efficience (Token Ops)** : Réduction des appels API redondants par un cache intelligent.
*   **User Experience (UX)** : Suppression des messages de "planification" inutiles pour l'utilisateur final.

---

## 3. Architecture Fonctionnelle : Le Modèle Omni-Reflex

### 3.1 Unification du Moteur (Single-Core Policy)
Le choix technologique est arrêté sur **Kimi for Coding** (version stable). Il devient le moteur unique de décision, éliminant le surcoût cognitif lié au routage dynamique (Classifier).

### 3.2 L'Omni-Context (Chargement Parallèle)
Le système doit garantir que chaque message est traité avec une vision 360° de l'environnement :
1.  **Couche Identité** : Qui parle ? (Droits, rôle, historique record).
2.  **Couche Sociale** : Où ? (Mission du groupe, membres actifs).
3.  **Couche Sémantique** : De quoi parle-t-on ? (RAG - Recherche vectorielle contextuelle).
4.  **Couche Émotionnelle** : Quel est l'état actuel ? (Sentiment analysis persistant).

---

## 4. Spécifications du Flux Opérationnel

### 4.1 Réception & Hydratation (Entrée)
- Le bot intercepte le message.
- Lancement de `ParallelContextLoader` : réalise l'extraction simultanée de toutes les couches de l'Omni-Context.
- **Règle métier** : Si un chargement de couche échoue, le bot continue avec des données dégradées mais ne stoppe pas le flux.

### 4.2 Le "One-Pass" Decision (Traitement)
- Kimi reçoit l'Omni-Context + Consigne Système "Action-First".
- **Sortie autorisée** : Texte direct OU Appel d'outil JSON (Schema strict).
- **Interdiction** : L'IA ne doit pas expliquer son intention de planification sauf si explicitement requis par une tâche de fond.

### 4.3 Escalade Cognitive (Traitement Avancé)
- Si l'IA détecte une complexité nécessitant plus de 3 étapes (ex: rédaction d'un audit complet), elle active l'outil `background_planner`.
- Un feedback immédiat est envoyé à l'utilisateur via le transport WhatsApp.

---

## 5. Plan d'Itération Détaillé (Roadmap Technique)

Le projet sera découpé en itérations progressives pour limiter les risques de régression.

### Itération 1 : Fondations Hyper-Sync
- [ ] Refactorisation du `ServiceContainer` pour supporter l'injection de dépendances non-bloquante.
- [ ] Création du `OmniContextBuilder` (Standardisation de l'injection DB/Redis/RAG).
- [ ] Mise en place du `JSONGuard` pour Kimi.

### Itération 2 : Mutation du Core (Omni-Reflex)
- [ ] Suppression de la méthode legacy `_classifyComplexity`.
- [ ] Migration du flux principal de `core/index.js` vers le modèle Single-Pass.
- [ ] Intégration de la boucle de protection contre les répétitions d'outils.

### Itération 3 : Optimisation & Polissage
- [ ] Implémentation du caching Redis pour les requêtes "Fast-Path".
- [ ] Fine-tuning des instructions système (Thought Control).
- [ ] Tests de charge et mesure de latence réelle (Audit Performance).

---

## 6. Critères d'Acceptabilité (Definition of Done)

Chaque itération ne sera considérée comme "terminée" que si elle remplit les critères suivants :

### Itération 1 : Fondations Hyper-Sync
- [ ] Le `OmniContextBuilder` retourne l'objet de contexte complet en moins de 300ms.
- [ ] Le RAG n'est appelé qu'une seule fois par message entrant.
- [ ] `JSONGuard` est capable de réparer un JSON mal formé (ex: guillemets simples, texte parasite autour).

### Itération 2 : Mutation du Core
- [ ] `core/index.js` ne contient plus aucune référence aux modèles de classification.
- [ ] Une requête utilisateur simple (ex: "Salut") ne déclenche aucun appel d'outil inutile.
- [ ] Le système de protection bloque une boucle infinie d'outils en moins de 5 itérations.

### Itération 3 : Optimisation
- [ ] Temps de réponse total (TTFT - Time To First Token) < 1.5s sur les messages texte simples.
- [ ] Le bot "se souvient" d'un fait mentionné 5 messages plus tôt sans re-planification.
- [ ] Absence de régressions sur les plugins existants (Crawlfire, Group Manager).

---

## 7. Analyse des Risques & Remédiations
*   **Risque** : Consommation accrue de tokens due à l'Omni-Context.
    - *Remédiation* : Algorithme de sélection sémantique strict (Top-K limité à 3 pour le RAG).
*   **Risque** : Latence du RAG (Embedding + Search).
    - *Remédiation* : Utilisation d'une base vectorielle optimisée et asynchrone.

---
*Fin du document SFD*
