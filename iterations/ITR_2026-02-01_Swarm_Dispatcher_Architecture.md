# 📄 Technical Design Document & Implementation Roadmap
**Project**: HIVE-MIND Swarm Dispatcher (Parallel Concurrency)
**Date**: 2026-02-01
**Author**: Lead Architect Agent
**Status**: APPROVED FOR DEV

---

## 1. Executive Summary
Ce document détaille l'implémentation du **Swarm Dispatcher**, une couche d'orchestration conçue pour paralléliser le traitement des messages WhatsApp. Il vise à découpler le temps de traitement de chaque utilisateur (JID Isolation) tout en protégeant l'intégrité du système (Resource Guard) et la cohérence des conversations (Sequential consistency within JID).

---

## 2. Architecture & Design Pattern

### 2.1 The "Lane" Metaphor
Le système fonctionne comme un péage d'autoroute intelligent :
1.  **Fast Lane** : Commandes prioritaires (`!ping`, `!stop`) -> *Passe immédiatement*.
2.  **Regular Lanes** : Chaque conversation (JID) est une voie unique. Les voitures (messages) s'y suivent à la queue leu leu (FIFO).
3.  **Traffic Control** : Si l'autoroute (RAM/CPU) est saturée, le feu passe au rouge à l'entrée du péage pour les nouvelles voies.

### 2.2 Data Structures
*   `accessMap`: `Map<string, Promise>` — Mutex par JID.
*   `metrics`: `Object` — Monitoring temps réel (Active Threads, RAM Usage).

---

## 3. Implementation Roadmap (Phased)

### 🟢 Phase 1: Core Dispatcher Logic (Isolation)
**Objectif** : Implémenter la structure de classe capable de sérialiser les tâches par clé (JID) et de paralléliser les clés différentes.

*   **Action Items** :
    1.  Créer `core/concurrency/SwarmDispatcher.js`.
    2.  Implémenter `dispatch(jid, task)`.
    3.  Intégrer le pattern "Promise Chaining" pour la sérialisation par JID.
    
*   **Definition of Done (DoD)** :
    *   Le module exporte une classe singleton.
    *   2 tâches lancées sur le MÊME JID s'exécutent **l'une après l'autre**.
    *   2 tâches lancées sur des JID DIFFÉRENTS s'exécutent **en même temps**.

*   **Validation Method** :
    *   *Script de Test* : Lancer `dispatch('A', sleep(100))` et `dispatch('A', log('Done'))`. 'Done' doit apparaître après 100ms. Lancer `dispatch('B', log('DoneB'))`. 'DoneB' doit apparaître immédiatement, sans attendre A.

---

### 🟢 Phase 2: Resource Guard (Adaptive Throttling)
**Objectif** : Empêcher le système de crasher sous la charge en limitant le nombre de "Workers" simultanés selon la RAM disponible.

*   **Action Items** :
    1.  Importer `os`.
    2.  Créer la méthode privée `_canAcceptNewWorker()`.
    3.  Implémenter la logique : `MaxConcurrency = FreeRAM / 250MB`.
    4.  Si refus -> `await delay(500ms)` et retry (Backpressure).

*   **Definition of Done (DoD)** :
    *   Le Dispatcher refuse ou met en attente une tâche si `ActiveWorkers >= MaxLimit`.
    *   La RAM libre est vérifiée avant chaque nouveau thread.

*   **Validation Method** :
    *   *Log Check* : `console.log` affichant `[Swarm] Throttling active (Active: 10, FreeRAM: 120MB)`.
    *   *Stress Test Simulation* : Forcer `MaxLimit = 1` et envoyer 5 requêtes de JIDs différents. Vérifier qu'elles se finissent une par une.

---

### 🟢 Phase 3: Priority Handling (Fast-Lane)
**Objectif** : Garantir que les commandes système ne sont jamais bloquées.

*   **Action Items** :
    1.  Implémenter `isFastPath(content)`.
    2.  Logique : Regex `/^!(ping|menu|help|stop)/i`.
    3.  Dans `dispatch`, si `isFastPath` est vrai -> Bypass du `_canAcceptNewWorker`.

*   **Definition of Done (DoD)** :
    *   Une commande `!ping` envoyée pendant une surcharge système (100% CPU usage simulé) est traitée sans délai.

*   **Validation Method** :
    *   Lancer une "Heavy Task" (boucle 10s). Envoyer `!ping` par un autre JID. Le "Pong" doit arriver avant la fin des 10s.

---

### 🟢 Phase 4: Integration (The Switch)
**Objectif** : Remplacer l'ancien système par le Swarm dans le transport réel.

*   **Action Items** :
    1.  Initialiser `swarm` dans `core/transport/baileys.js` (start).
    2.  Remplacer `main.handleMessage(msg)` par `swarm.dispatch(...)`.
    3.  Ajouter logs de traçabilité `[JID:1234]` via contexte ou préfixe.

*   **Definition of Done (DoD)** :
    *   Le bot démarre sans erreur.
    *   Les messages WhatsApp réels sont traités.
    *   Les logs montrent `[Swarm] Dispatching...`.

*   **Validation Method** :
    *   *Prod Sim* : Envoyer un message depuis WhatsApp. Vérifier les logs.

---

## 4. Rollback Plan
Si Phase 4 échoue (blocage total) :
*   Restaurer l'appel direct `main.handleMessage(msg)` dans `baileys.js`.
*   Désactiver l'import `SwarmDispatcher`.

---
**Reviewer**: USER
**Developer**: Antigravity
