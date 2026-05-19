# Analyse du Codebase : Liens manquants, Code oublié et Dette Technique

Ce rapport a été généré via l'analyse du graphe de dépendances (Graphify) et la vérification des récentes modifications structurelles.

## 1. Code Oublié / Dette Technique (RÉSOLU ✅)

Suite au plan de migration vers VIGIL + RALPH + FinOps (`runtime_infra.txt`), les éléments oubliés ont été corrigés :

*   ~~**Fichiers obsolètes non supprimés** : `services/finops/CostTracker.ts`, `services/moralCompass.ts`, `services/agentic/MultiAgent.ts`~~ -> **Supprimés**
*   ~~**Logique Manquante (Anti-Laziness / RALPH)** : La boucle ReAct dans `core/index.ts` ne vérifiait pas la paresse.~~ -> **Implémenté et branché**
*   ~~**Imports Morts (Orphelins)** : `services/index.ts` exportait encore `moralCompass`.~~ -> **Nettoyé**
*   ~~**Fichier Mort** : `core/schedulerHandlers.ts`~~ -> **Supprimé**

## 2. Modules Orphelins (Totalement isolés dans le Graphe)

D'après le graphe `graphify`, ces fichiers n'ont ni appels sortants (ils n'importent rien) ni appels entrants (personne ne les importe). Ils sont potentiellement des restes de refactorings ou des fichiers d'index non utilisés :

*   `core/handlers/index.ts`
*   `services/index.ts`
*   `services/browser/index.ts`
*   `utils/index.ts`
*   `types/untyped-modules.d.ts`
*   `persona/prompts/system.md` (Bien que lu dynamiquement par Node.js avec `fs.readFileSync`, il n'est pas "importé" sémantiquement dans l'AST, d'où son isolation).

## 3. Code Non Référencé (Unreachable)

Ces fichiers importent des dépendances (ils ont des arrêtes sortantes) mais **aucun autre fichier du projet ne les importe ou ne les appelle**. Ce sont soit des points d'entrée (comme `index.ts`), soit du code mort :

*   `test_live.js` / `test_live.mjs` (Scripts de test probablement utilisés à la main).
*   `core/cli.ts` : Aucune trace d'importation dans l'orchestrateur principal.
*   `core/transport/ink/App.tsx` & `InkCLIAdapter.tsx` : Composants UI CLI potentiellement dépréciés ou non branchés au système principal.
*   `core/context/contextBuilder.ts` & `TieredContextLoader.ts` : À vérifier si ces modules de contexte V3 sont correctement instanciés ou s'ils sont chargés dynamiquement de manière invisible à l'AST.

## 4. Placeholders et Logiques en attente

Outre les éléments déjà listés dans `mock.md` (MailboxWatcher, dailyGreeting, fakeContext, etc.), l'analyse révèle la présence de fonctions liées à la gestion des Placeholders :

*   **`services/envResolver.ts`** possède la fonction `._isPlaceholder()` qui est chargée de détecter si une variable d'environnement (ex: `${OPENAI_KEY}`) a bien été remplacée par l'utilisateur.
*   Le graphe montre une omniprésence de mocks dans les dossiers `tests/` (`mockTransport()`, `chatMock()`, `mockShellExecute`, etc.), ce qui est normal pour une suite de tests, mais confirme que certaines intégrations réelles reposent encore sur des interfaces en cours de consolidation.
