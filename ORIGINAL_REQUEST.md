# Original User Request

## Initial Request — 2026-07-05T03:34:55Z

Massive code review, audit, and refactoring of the HIVE-MIND codebase to resolve all bugs, optimize performance, harden security, clean up design/style, and upgrade all outdated dependencies and code to be fully compatible with Node.js LTS.

Working directory: /home/omni/Code/HIVE-MIND-RAILWAY
Integrity mode: development

## Requirements

### R1. Audit Complet et Correction des Bugs
- Analyser l'ensemble du code source pour identifier et corriger les bugs existants.
- Optimiser les performances (détecter les fuites de mémoire, optimiser les requêtes lourdes, éviter les synchronisations bloquantes).
- Renforcer la sécurité (sécuriser l'écriture de fichiers contre le path traversal, s'assurer que les secrets ne fuient pas dans les logs, valider les entrées utilisateurs).
- Améliorer le style et le design du code (respecter les principes SOLID, assurer la modularité des composants, typage strict TypeScript).

### R2. Migration Node.js LTS (v22+)
- Mettre à jour la configuration du projet pour cibler explicitement Node.js v22 LTS (et supérieur).
- Remplacer les mécanismes dépréciés ou obsolètes par des équivalents natifs modernes supportés par Node.js LTS (ex: utiliser le `fetch` global natif au lieu de la dépendance `undici`, configurer le chargement natif de fichier `.env` via `--env-file` si possible).
- Configurer le champ `"engines": { "node": ">=22.0.0" }` dans `package.json`.

### R3. Mise à niveau et Nettoyage des Dépendances
- Mettre à jour les dépendances principales (`package.json`) vers leurs dernières versions majeures stables (ex: `@google/genai`, `@supabase/supabase-js`, `redis`, `pino`, etc.) en effectuant la refactorisation associée pour adapter le code aux nouvelles API.
- Nettoyer les dépendances inutiles ou obsolètes (ex: `dotenv` si remplacé par le chargement natif, `undici` si remplacé par le fetch natif).
- **Contrainte de sécurité** : Geler le paquet `@whiskeysockets/baileys` sur sa version v6 stable actuelle pour éviter les ruptures de protocole WhatsApp Baileys.

## Acceptance Criteria

### Compilateur et Linter
- [ ] Le projet compile sans erreurs ni avertissements avec TypeScript via la commande `npx tsc --noEmit`.
- [ ] Le linter s'exécute sans erreurs ni avertissements via `npx eslint . --ext .js,.ts`.

### Validation des Tests
- [ ] Tous les tests Jest (unitaires, intégration, E2E) s'exécutent avec 100% de succès.
- [ ] La suite de tests ne produit aucun avertissement lié à des API dépréciées des packages mis à jour.

### Intégrité et Stabilité
- [ ] L'application démarre correctement en mode de développement (`npm run dev`) et l'interface utilisateur TUI (`npm run tui`) démarre sans crash.
