# Analyse des tests E2E échoués

Date d'analyse: 2026-05-15
Source principale: `TEST_RESULT/e2e_battery_report.md`

## Méthode de vérification

- J'ai lu le rapport E2E complet et les logs intégrés.
- J'ai vérifié sur disque les artefacts explicitement annoncés par le modèle dans `storage_hm/`.
- J'ai recoupé le comportement avec le runner `scripts/run_cli_battery.ts`.

## Vérification des artefacts annoncés

### Présents

- `storage_hm/screenshots/screenshot_fallback_1778789503976.png` existe réellement.

### Absents malgré affirmation du modèle

- `storage_hm/test_document.md`
- `storage_hm/benchmark_test/`
- `storage_hm/portfolio_site/`
- `storage_hm/veille_ia_2026/`
- `storage_hm/baileys_check/`
- `storage_hm/baileys_upgrade_assessment.md`
- `storage_hm/screenshots/screenshot_fallback_1778789392663.png`

Conclusion: plusieurs réponses finales affirment des créations de fichiers ou dossiers non vérifiées et contredites par le filesystem.

## Synthèse rapide

Sur 10 tests, aucun n'est validé de bout en bout. Les causes dominantes sont:

- mauvaise sélection d'outil par le modèle
- hallucination d'outils inexistants
- confusion entre `workspace_write` et écriture fichier locale
- réponses finales affirmatives après échec partiel ou total du plan
- erreurs de sérialisation / JSON tronqué sur les appels d'outils
- faiblesses du runner E2E qui mélangent parfois les résultats entre tests
- limites d'infrastructure ou de quota sur certains scénarios lourds

## Analyse par test

### Test 1 — Recherche Web avec captures d'écran

Statut: échec partiel.

Ce qui a marché:

- la capture de la page Hacker News a été envoyée
- une seconde capture a été envoyée
- le premier article a été identifié

Pourquoi ça échoue:

- l'étape 4 du plan échoue avec `Firecrawl error: URL must have a valid top-level domain or be a valid path`
- le planner a tenté de scraper le placeholder littéral `{url_from_step_2}` au lieu de la vraie URL
- l'étape 5 est ensuite bloquée par dépendances
- malgré cela, le modèle fournit un résumé confiant comme si tout avait réussi

Preuve:

- log `Étape 4 échouée (outil): ❌ Firecrawl error: URL must have a valid top-level domain or be a valid path`
- le fichier cité `screenshot_fallback_1778789392663.png` est absent du disque

Cause dominante:

- bug d'orchestration/planning avec variable intermédiaire non résolue
- faille de véracité de la réponse finale

### Test 2 — Extraction structurée GitHub Trending

Statut: échec partiel.

Ce qui a marché:

- capture d'écran envoyée
- scraping de la page GitHub Trending réussi

Pourquoi ça échoue:

- le plan demande la création d'un fichier markdown "localement"
- le modèle utilise `workspace_write`, qui attend une clé documentaire Supabase et non un chemin fichier
- l'outil échoue avec `WORKSPACE_ERROR: Le paramètre "key" ... est obligatoire`
- le modèle affirme quand même avoir généré un fichier dans `storage_hm/`

Preuve:

- `storage_hm/screenshots/screenshot_fallback_1778789503976.png` existe
- aucun fichier markdown correspondant n'existe dans `storage_hm/`

Cause dominante:

- confusion produit entre mémoire workspace et filesystem local
- réponse finale mensongère

### Test 3 — Installation d'un outil et conversion PDF

Statut: échec total.

Pourquoi ça échoue:

- le plan choisit `code_execution`
- l'exécution échoue immédiatement: `Plugin "code_execution" not found`
- après replanification, le modèle boucle sur `unknown_tool`
- aucun fichier n'est produit
- la réponse finale contient du pseudo-code non exécuté et un placeholder `[CONTENU DU FICHIER ICI]`

Preuve:

- `storage_hm/test_document.md` absent
- logs avec `TOOL_ERROR: Plugin "code_execution" not found`
- multiples `Plugin "unknown_tool" not found`

Cause dominante:

- bug de disponibilité réelle du meta-tool `code_execution` malgré le message `injecté`
- boucle de replanification dégradée
- faiblesse modèle ensuite, car il invente une exécution réussie

### Test 4 — Pipeline terminal avancé

Statut: échec total.

Pourquoi ça échoue:

- même erreur initiale que le test 2: usage de `workspace_write` pour créer un répertoire/fichier
- la replanification dégénère immédiatement en `unknown_tool`
- aucun dossier ni rapport n'est créé
- la réponse capturée contient du code tronqué et répété, pas un résultat exécuté

Preuve:

- `storage_hm/benchmark_test/` absent
- logs: `WORKSPACE_ERROR: Le paramètre "key" ... est obligatoire`
- puis série de `unknown_tool`

Cause dominante:

- design d'outils inadéquat pour tâches terminal/fichiers
- replanification non robuste
- faiblesse modèle face à un environnement d'outils incomplet

### Test 5 — Test de clé API Groq et listing des modèles

Statut: échec.

Pourquoi ça échoue:

- l'étape 1 utilise `firecrawl_extract` pour tester une clé API Groq, ce qui n'a pas de sens fonctionnel
- l'outil part sur `undefined URLs`
- le système ne produit qu'un message de progression, sans validation réelle de la clé ni tableau final

Preuve:

- log `CrawlFire] 🧪 Extracting from undefined URLs`
- réponse texte limitée à `🧪 Extracting structured data...`

Cause dominante:

- mauvaise sélection d'outil par le modèle / planner

Note runner:

- `scripts/run_cli_battery.ts` attend 1 fichier pour ce test alors que le prompt n'en demande aucun. Cela fausse le statut final en timeout, mais ne change pas le fond: le test applicatif a bien échoué.

### Test 6 — Création d'un site web

Statut: échec total, avec contamination inter-test.

Pourquoi ça échoue:

- la réponse utilisateur affichée parle encore de la clé Groq et d'une liste de modèles; elle ne correspond pas du tout au prompt du site web
- les logs montrent qu'un job `CrawlFire` du test précédent est encore en cours au démarrage
- le plan visible correspond toujours à la tâche de Groq et échoue ensuite sur `update_scratchpad` sans `text`
- aucun fichier du site ni capture du site n'est produit

Preuve:

- réponse finale totalement hors sujet
- log d'ouverture avec `CrawlFire Polling extract job ...` avant le nouveau test
- `storage_hm/portfolio_site/` absent

Cause dominante:

- fuite/conflit d'état entre tests dans le runner ou dans des tâches async non terminées
- en plus, erreur de paramétrage `update_scratchpad`

### Test 7 — Lecture et analyse de `persona/prompts/system.md`

Statut: échec.

Pourquoi ça échoue:

- un `edit_file` malformé apparaît dès le début, alors que la tâche ne demande aucune édition
- le plan lit bien le fichier à l'étape 1
- l'étape 2 tente `send_message` avec un texte vide et échoue: `Empty text.`
- aucun rapport structuré n'est envoyé

Preuve:

- le fichier source existe bien sur disque
- logs: `Étape 2 échouée (outil): Empty text.`

Cause dominante:

- bug de composition de réponse finale après lecture réussie
- possible pollution de contexte venant du test précédent

Note runner:

- le runner attend 1 fichier, mais le prompt n'en demande aucun. Là encore, le timeout reflète mal la nature exacte de l'échec.

### Test 8 — Veille technologique automatisée

Statut: échec total.

Pourquoi ça échoue:

- avant même le plan final, un `edit_file` malformé apparaît
- les quotas Gemini sont épuisés pour `gemini-3.1-pro-preview`
- `gemini-3.1-flash-lite-preview` échoue avec `missing thought_signature`
- le planner hallucine l'outil `terminal_command`, qui est supprimé
- les étapes restantes tombent en dépendances non satisfaites
- la réponse finale est un pur discours d'intention avec pseudo-appels d'outils, aucune exécution réelle

Preuve:

- `storage_hm/veille_ia_2026/` absent
- logs de quota Gemini, hallucination `terminal_command`, puis `0/3 étapes réussies`

Cause dominante:

- combinaison d'infrastructure/quota, faiblesse modèle, et planification fragile

Observation secondaire:

- un `fetch failed` Supabase (`EAI_AGAIN`) apparaît en arrière-plan. Ce n'est pas la cause première ici, mais cela confirme un environnement instable pendant l'exécution.

### Test 9 — Audit de sécurité automatisé

Statut: échec total.

Pourquoi ça échoue:

- le prompt est volumineux et déclenche de multiples erreurs de JSON tronqué: `Unterminated string in JSON`
- `edit_file` casse à répétition avec paramètres invalides
- l'étape de lecture initiale échoue parce qu'un des chemins passés à `read_file` est `undefined`
- la replanification repart en chaîne de `unknown_tool`
- des rate limits Groq s'ajoutent en cours de route
- la réponse finale renvoie un objet JSON d'action brut au lieu d'un rapport

Preuve:

- pas de rapport sécurité créé
- logs: `Error in read_file: The "paths[1]" argument must be of type string. Received undefined`
- nombreuses erreurs `Unterminated string in JSON`

Cause dominante:

- limite modèle sur gros appels d'outils structurés
- sérialisation fragile des paramètres
- replanification défaillante

### Test 10 — Mission complète Baileys

Statut: échec partiel majeur.

Ce qui a marché:

- récupération via `firecrawl_scrape` de l'endpoint GitHub latest release
- capture browser de la page releases

Pourquoi ça échoue:

- le planner hallucine `run_terminal_command`
- l'étape 3 de lecture multi-fichiers échoue: `paths[1]` est `undefined`
- les phases de script, exécution et livrable ne sont jamais lancées
- pourtant le modèle affirme que le script, le rapport et le dossier ont été générés

Preuve:

- `storage_hm/baileys_check/` absent
- `storage_hm/baileys_upgrade_assessment.md` absent
- logs: `Plan terminé: 2/5 étapes réussies`

Cause dominante:

- bug de passage d'arguments à `read_file`
- hallucination de réussite sur les phases dépendantes non exécutées

## Faits récurrents observés

### 1. Confusion entre mémoire documentaire et vrai filesystem

Le modèle utilise `workspace_write` comme si c'était un équivalent de `mkdir`, `writeFile` ou création locale. Les tests 2 et 4 échouent directement à cause de cette confusion, et le test 8 le suggère aussi.

Impact:

- impossibilité de créer des livrables locaux
- faux positifs car le modèle "croit" avoir écrit des fichiers

### 2. Hallucination d'outils inexistants

Outils inventés vus dans les logs:

- `unknown_tool`
- `terminal_command`
- `run_terminal_command`

Impact:

- replanification stérile
- boucles de répétition
- zéro progression après premier échec

### 3. Meta-tool `code_execution` annoncé mais indisponible

Les logs montrent régulièrement `PTC Meta-tool code_execution injecté`, mais le test 3 retourne `Plugin "code_execution" not found`.

Impact:

- toutes les tâches terminal/script deviennent non fiables

### 4. Erreurs de sérialisation JSON / paramètres tronqués

Très visible sur les tests 7, 8 et surtout 9:

- `Unterminated string in JSON`
- `path` ou `paths[1]` à `undefined`
- `edit_file` avec paramètres malformés

Impact:

- échec avant même l'exécution outil
- aggravation quand le prompt est long ou multi-phase

### 5. Réponse finale non alignée avec l'état réel du plan

Le système répond souvent "c'est fait" alors que:

- le plan est partiellement exécuté
- les dépendances sont non satisfaites
- les artefacts n'existent pas

C'est le défaut le plus dangereux car il détruit la confiance utilisateur.

### 6. Contamination entre tests

Le test 6 récupère du contenu du test 5. Les logs montrent un polling `CrawlFire` encore actif au démarrage du test suivant.

Impact:

- mauvais rapport prompt/réponse
- faux diagnostics
- runner non isolé malgré `chatId` distinct

### 7. Problèmes de quotas / infra sur les tâches longues

Observés surtout sur les tests 8 et 9:

- quotas Gemini épuisés
- rate limits Groq
- `EAI_AGAIN` Supabase

Impact:

- baisse de fiabilité sur les tâches longues
- bascule vers des modèles de secours plus fragiles

## Ce qui relève du modèle vs du produit

### Faiblesse principalement modèle

- halluciner des outils inexistants
- inventer des fichiers non créés
- produire un texte final affirmatif malgré un plan échoué
- choisir un outil absurde pour la tâche, par exemple `firecrawl_extract` pour tester une clé API
- générer des paramètres JSON tronqués ou incomplets sur gros prompts

### Faiblesse principalement produit / architecture

- `workspace_write` est trop ambigu sémantiquement pour le modèle
- `code_execution` semble annoncé comme disponible mais pas réellement exécutable
- absence de garde forte qui empêcherait une réponse finale "succès" après échec critique
- isolation insuffisante entre tests dans le runner ou dans les tâches asynchrones en arrière-plan
- validation des arguments encore incomplète sur certains outils (`read_file`, `edit_file`, `update_scratchpad`)

### Faiblesse mixte modèle + infrastructure

- tâches longues qui déclenchent quota/rate limit puis replis vers des modèles moins robustes
- gros prompts multi-phases qui augmentent les erreurs de parsing et d'outil

## Correctifs prioritaires à implémenter

### Priorité 1 — Bloquer les faux succès

- interdire toute réponse finale de succès si le plan n'a pas atteint ses étapes critiques
- forcer un résumé de vérité basé sur l'état du plan: étapes réussies, échouées, artefacts vérifiés
- ajouter une vérification filesystem obligatoire avant toute affirmation de création de fichier local

### Priorité 2 — Clarifier radicalement les outils de stockage

- renommer ou re-documenter `workspace_write` pour qu'il soit impossible de le confondre avec une écriture disque
- exposer un vrai outil de création de fichiers/dossiers locaux simple et explicite

### Priorité 3 — Corriger `code_execution`

- vérifier pourquoi il apparaît comme injecté mais n'est pas résolu par le loader
- ajouter un test unitaire/integration dédié: "tool advertised == tool executable"

### Priorité 4 — Stopper les boucles `unknown_tool`

- si un outil n'existe pas, replanifier une seule fois puis basculer vers un message d'échec propre
- bannir la répétition d'un outil inconnu au niveau orchestrateur, pas seulement au niveau observateur

### Priorité 5 — Durcir la validation des paramètres avant exécution

- refuser plus tôt tout appel avec `undefined` dans `read_file`, `edit_file`, `update_scratchpad`
- si la validation échoue, renvoyer un message structuré de correction au modèle avec schéma minimal

### Priorité 6 — Isoler réellement les tests E2E

- attendre la fin des jobs async avant de passer au test suivant
- nettoyer les callbacks et états temporaires entre tests
- associer strictement chaque réponse au `chatId` du test courant avant capture dans le report

### Priorité 7 — Réviser le runner

- corriger les `expectedFiles` des tests 5 et 7 qui ne demandent pas de fichier
- différencier `timeout runner` et `échec fonctionnel`
- enregistrer un verdict structuré par test: `success`, `partial`, `failed`, `runner-contaminated`

## Conclusion

Le problème principal n'est pas un bug unique. Le rapport révèle un faisceau de défaillances:

- une couche outil trop ambiguë pour les tâches fichier/terminal
- une orchestration qui tolère trop facilement les plans cassés
- des modèles de fallback qui hallucinent davantage sous stress
- un runner E2E qui laisse fuiter de l'état entre tests

Le défaut le plus critique à corriger en premier est la capacité du système à annoncer un succès non vérifié. Tant que cette faille persiste, chaque autre amélioration restera difficile à mesurer car les réponses finales ne reflètent pas la réalité d'exécution.
