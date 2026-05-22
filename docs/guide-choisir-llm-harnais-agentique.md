*Guide Pratique | Choisir le Bon LLM pour un Harnais Agentique*

**GUIDE PRATIQUE**

**Choisir le Bon LLM**

pour un Harnais Agentique

Comment identifier les benchmarks qui comptent vraiment,

interpreter les scores en termes concrets,

et eviter les pieges du "model shopping"

Mai 2026


# **Table des Matieres**
1\. L'Erreur Classique : Pourquoi le "Meilleur Modele" n'Existe Pas

2\. La Methode : 5 Etapes pour Identifier VOS Besoins

3\. Cartographie des Benchmarks : Ce Qui Existe et Ce Que Ca Mesure

4\. Le Decodeur : Que Signifient les Scores en Situation Reelle

5\. Les 6 Archetypes de Harnais et Leurs Profils de Besoins

6\. Construire Votre Grille de Selection

7\. La Strategie Multi-Modele : Pourquoi et Comment

8\. Les Pieges a Eviter

9\. Template d'Evaluation Pret a Remplir

10\. Ressources et Outils


# **1. L'Erreur Classique : Pourquoi le "Meilleur Modele" n'Existe Pas**
Vous construisez un framework agentique. Vous ouvrez un leaderboard. Vous voyez GPT-5.5 en tete. Vous l'integrez. Et ca ne marche pas comme prevu.

**Pourquoi ?**

Parce qu'un leaderboard mesure des capacites generales. Votre harnais a des besoins specifiques. Un modele qui score 60/100 en Intelligence Index peut etre parfait pour votre use-case s'il excelle sur les 2-3 benchmarks qui VOUS importent, et mediocre s'il est moyen partout.

**INSIGHT :** *Un harnais agentique n'est pas un chatbot. Il n'a pas besoin de repondre a des questions de PhD en physique. Il a besoin de suivre des instructions structurees, generer du code valide, et enchainer des actions sans se perdre. Ce sont des capacites tres specifiques, mesurables par des benchmarks tres specifiques.*
## **1.1 L'Analogie du Recrutement**
Choisir un LLM pour un harnais, c'est comme recruter un employe :

- Vous ne cherchez pas "la personne la plus intelligente du monde"
- Vous cherchez quelqu'un qui excelle sur les taches SPECIFIQUES du poste
- Un chirurgien brillant est un mauvais comptable, meme s'il est "plus intelligent"
- Un modele MMLU-champion qui ne sait pas suivre un format JSON est inutile pour votre agent

Ce guide vous apprend a rediger la "fiche de poste" de votre LLM.
## **1.2 Les 3 Questions Fondamentales**
**Avant tout benchmark, repondez a ceci :**

1. Que fait le LLM a chaque tour de boucle ? 
1. **(crash systeme vs degradation legere)**Quel est le cout d'un echec ? 
1. **(1x par tache vs 20x par tache)**A quelle frequence cette action se repete ? 

**La combinaison frequence x cout\_echec = votre priorite reelle.**


# **2. La Methode : 5 Etapes pour Identifier VOS Besoins**
## **Etape 1 : Decomposer en Fonctions Atomiques**
Listez TOUT ce que le LLM fait dans votre systeme. Pas les features marketing, les actions concretes :

|**Question**|**Exemple Concret**|**Benchmark Associe**|
| :-: | :-: | :-: |
|Genere-t-il du code executable ?|JavaScript sandbox, Python scripts|Coding Index, LiveCodeBench|
|Doit-il suivre un format strict ?|JSON tools, DSL custom, XML tags|IFBench|
|Interagit-il avec un terminal/CLI ?|Commandes bash, file system|Terminal-Bench Hard|
|Planifie-t-il des sous-taches ?|Decomposition d'objectifs|GDPval-AA, APEX-Agents|
|Doit-il etre factuel ?|Decisions basees sur des faits|AA-Omniscience|
|Raisonne-t-il sur un long contexte ?|Historique de conversation, docs|AA-LCR|
|Doit-il repondre vite ?|Chat temps-reel, streaming|TTFT, Throughput|
## **Etape 2 : Classifier par Criticite**
Pour chaque fonction, posez-vous : "Si le LLM echoue ICI, que se passe-t-il ?"

|**Niveau**|**Definition**|**Exemple**|
| :-: | :-: | :-: |
|**EXISTENTIEL**|Echec = le systeme est casse, non-fonctionnel|Tool call invalide -> crash de la boucle|
|**OPERATIONNEL**|Echec = degradation visible, retry necessaire|Code JS invalide -> fallback sequentiel (5x lent)|
|**QUALITE**|Echec = resultat sous-optimal mais fonctionnel|Hallucination -> tache inutile creee (nettoyable)|
## **Etape 3 : Ponderer par Frequence**
Un risque rare est moins grave qu'un risque constant :

**PIEGE COURANT :** Ne pas confondre "gravite maximale" et "priorite". Un crash nucleaire est grave mais rare. Un format JSON mal ferme est benin isolement mais catastrophique s'il arrive 3x sur 10 iterations.

**Formule de priorite :** Priorite = Criticite x Frequence\_d'appel

Un benchmark couvrant une action EXISTENTIELLE appelee 20x par tache est votre Priorite #1 absolue.
## **Etape 4 : Mapper sur les Benchmarks**
Une fois vos priorites identifiees, associez chaque besoin au benchmark le plus predictif (voir Chapitre 3 pour le catalogue complet).
## **Etape 5 : Definir vos Seuils**
Pour chaque benchmark retenu, definissez 3 seuils :

- Minimum Viable : en dessous, le systeme ne fonctionne pas
- Confortable : le systeme fonctionne bien au quotidien
- Optimal : performance maximale, aucun gaspillage

**CONSEIL :** Commencez par le seuil minimum. Si aucun modele ne l'atteint, c'est que votre seuil est irrealiste ou que vous devez compenser par architecture (guard-rails, retry logic, validation layer).


# **3. Cartographie des Benchmarks : Ce Qui Existe et Ce Que Ca Mesure**
Voici les benchmarks disponibles sur artificialanalysis.ai (reference principale de l'industrie) classes par pertinence pour les harnais agentiques :
## **3.1 Benchmarks CRITIQUES pour les Harnais Agentiques**
### **IFBench (Instruction Following Benchmark)**
**Ce que ca mesure :** La capacite a respecter des contraintes precises dans les instructions (format, longueur, mots interdits, casse, structure de sortie). 294 questions, 58 types de contraintes differentes.

**Pourquoi c'est critique :** Votre harnais injecte un system prompt avec des regles strictes. Chaque regle ignoree = un bug. Si votre DSL exige 'generate image' et le modele ecrit 'Generate Image' ou 'create image', la commande est rejetee.

**Echelle :** 0-100%. Median actuel : ~48%. Top : 82.9% (Grok 4.20). Les modeles courants oscillent entre 65-80%.
### **Coding Index (Artificial Analysis)**
**Ce que ca mesure :** Score composite de generation de code. Inclut la syntaxe, la logique, la capacite a produire du code executable sans erreur.

**Pourquoi c'est critique :** Si votre agent genere du code (tool calls JSON, scripts, DSL), chaque erreur de syntaxe = un appel perdu. Multiplie par 10-30 iterations = difference entre un agent rapide et un agent inutilisable.

**Echelle :** 0-100 points. Median : ~35. Top : 59.1 (GPT-5.5 xhigh).
### **Terminal-Bench Hard**
**Ce que ca mesure :** Capacite a accomplir des taches complexes via terminal (software engineering, admin systeme, data processing). 44 taches, evaluation pass/fail.

**Pourquoi c'est critique :** C'est le benchmark le plus PROCHE d'un agent reel. Il mesure exactement la boucle percevoir-agir-observer dans un environnement interactif avec etat persistant.

**Echelle :** 0-100%. Median : ~33%. Top : 60.6% (GPT-5.5 xhigh).
## **3.2 Benchmarks IMPORTANTS (Impact Operationnel)**
### **GDPval-AA (GDP-valuable tasks)**
**Ce que ca mesure :** 220 taches economiquement utiles dans 44 metiers reels. Evaluation Elo par comparaison par paires.

**Pertinence :** Si votre agent fait des "vrais" travaux (redaction, analyse, recherche, code), ce benchmark predit sa capacite a delivrer de la valeur concrete.

**Echelle :** Elo ~800-1800. Top : 1769 (GPT-5.5 xhigh). 1500+ = competent sur la plupart des taches pro.
### **APEX-Agents-AA**
**Ce que ca mesure :** Taches longues et complexes necessitant coordination entre applications (like un humain qui jongle entre email, tableur, et CRM).

**Pertinence :** Si votre harnais orchestre des sous-agents ou gere des workflows multi-outils, c'est votre benchmark de reference. Score top : 47.1%.
### **LiveCodeBench**
**Ce que ca mesure :** Generation de code EXECUTABLE. Pas juste syntaxiquement correct, mais qui passe les tests unitaires. 315 problemes de competitive programming.

**Pertinence :** Complementaire au Coding Index. Valide que le code genere FAIT ce qu'on demande, pas juste qu'il compile.

**Echelle :** 0-100% pass@1. Median : ~51%. Top : 91.7% (Gemini 3 Pro Preview).
### **Throughput (Tokens par Seconde)**
**Ce que ca mesure :** Vitesse de generation de tokens en sortie. Depend du modele ET du provider.

**Pertinence :** Iterations\_par\_minute = Throughput / tokens\_par\_iteration. A 30 tok/s avec 500 tokens/iteration = 3.6 iter/min. A 100 tok/s = 12 iter/min.

**Echelle :** 10-500+ tok/s. Median pour les modeles frontier : ~60 tok/s. Les rapides (Flash, OSS sur Groq) : 200+.
### **TTFT (Time to First Token)**
**Ce que ca mesure :** Latence avant que le modele commence a repondre. Inclut le routing reseau + le processing du prompt.

**Pertinence :** Pour les agents interactifs (chat, voice), chaque iteration commence par attendre le TTFT. Sur 15 iterations a 5s chacune = 75s d'attente pure.
## **3.3 Benchmarks SECONDAIRES (Nice-to-have)**
### **AA-Omniscience (Factualite et Hallucination)**
**Ce que ca mesure :** Capacite a repondre correctement OU a s'abstenir quand il ne sait pas. Penalise les hallucinations.

**Pertinence :** Important si votre agent prend des decisions autonomes basees sur ses "connaissances". Moins critique si toutes les infos viennent du contexte (RAG, memoire, outils).

**ATTENTION :** Ce benchmark est EXTREMEMENT difficile. Le meilleur score mondial est ~57% en accuracy et Index ~33/100. Ne demandez JAMAIS 88% - c'est physiquement impossible. Un Index >= 15 est deja bon.
### **AA-LCR (Long Context Reasoning)**
**Ce que ca mesure :** Maintien de la coherence et de la precision sur des contextes de ~100K tokens.

**Pertinence :** Si votre system prompt + historique depasse 30K tokens. Moins critique si vous gardez le contexte court via summarization.
## **3.4 Benchmarks NON PERTINENTS pour les Harnais**
Ces benchmarks mesurent des capacites academiques qui ne predisent PAS le succes d'un agent :

- MMLU-Pro : Connaissances generales de niveau master. Votre agent n'a pas besoin de connaitre l'histoire romaine.
- MATH-500 / AIME : Mathematiques olympiques. Sauf si votre agent est un tuteur de maths.
- GPQA Diamond : Questions de PhD en sciences. Aucun rapport avec du tool calling.
- HLE (Humanity's Last Exam) : Questions frontier academiques. Impressionnant mais inutile pour un agent.
- Global-MMLU-Lite : Multilingue academique. Pertinent uniquement si votre agent opere en 10+ langues.

**INSIGHT :** *Le Intelligence Index (score composite) est utile comme FILTRE INITIAL mais insuffisant comme critere de selection final. Un modele a 50/100 d'Intelligence peut etre meilleur pour votre harnais qu'un modele a 55/100 s'il score 80% en IFBench vs 65%.*


# **4. Le Decodeur : Que Signifient les Scores en Situation Reelle**
Les benchmarks donnent des pourcentages. Mais que signifie "75% en IFBench" quand votre agent execute 15 iterations ? Ce chapitre traduit les scores en consequences concretes.
## **4.1 IFBench : Le Predicateur #1 de Fiabilite**

|**Score**|**Signification Concrete**|**Impact sur un Harnais (10 iterations)**|
| :-: | :-: | :-: |
|**< 55%**|Le modele ignore ou reformule la moitie des contraintes. Creativite debridee mais incontrolable.|5+ violations par session. DSL custom inutilisable. Formats de sortie ignores regulierement.|
|**55-65%**|Respecte les contraintes simples (longueur, langue) mais echoue sur les combinees ("reponds en JSON sans utiliser le mot X").|3-4 violations par session. Necessite un parser tolerant et des retries frequents.|
|**65-75%**|Bon sur les regles individuelles, mais perd le fil quand plusieurs contraintes interagissent.|2-3 violations par session. Fonctionnel avec un Task Checker qui force les corrections.|
|**75-82%**|Haute fidelite. Respecte la casse, les formats, les interdictions. Echoue sur ~1 instruction complexe sur 5.|1-2 violations par session. Fiable pour la production. Les rares echecs sont rattrapables.|
|**> 82%**|Quasi-parfait. Meme les instructions imbriquees et contre-intuitives sont respectees.|0-1 violation par session. Mode autonome possible sans supervision humaine.|

**LE REVERS DE LA MEDAILLE :** Un score IFBench tres eleve (>82%) peut indiquer un modele TROP literal. Face a une instruction ambigue ou contradictoire, il appliquera betement plutot que de signaler le probleme. Ideal pour les DSL rigides, risque pour les taches creatives.
## **4.2 Coding Index : Le Facteur de Vitesse**

|**Score**|**Qualite du Code Genere**|**Impact Operationnel**|
| :-: | :-: | :-: |
|**< 35**|Syntaxe souvent cassee. Erreurs de typage. Variables non declarees. Import manquants.|Si votre agent genere du code, 40%+ des executions echouent. Mode sandbox inutilisable.|
|**35-45**|Syntaxe generalement correcte. Logique parfois fausse. Edge cases non geres.|Code simple OK (1-2 appels). Code multi-etapes (async, error handling) echoue ~30% du temps.|
|**45-55**|Code fonctionnel et idiomatique. Gere bien les patterns courants. Echoue sur l'algorithmique complexe.|Orchestration multi-outils fiable. Script generation robuste. PTC mode viable.|
|**> 55**|Code de qualite professionnelle. Gere les cas complexes, l'optimisation, les patterns avances.|Tout en PTC/single-shot. 1 aller-retour au lieu de 5. Cout reduit de 80%.|
## **4.3 Terminal-Bench Hard : L'Autonomie Reelle**

|**Score**|**Capacite Agentique Reelle**|**Ce que Votre Agent Peut Faire**|
| :-: | :-: | :-: |
|**< 25%**|Perd le contexte entre commandes. Ne comprend pas les workflows multi-etapes.|Commandes isolees uniquement. Pas d'enchainement. Assistant passif.|
|**25-40%**|Gere les taches lineaires (grep -> sed -> commit). Echoue sur le debugging et la recovery.|Scripting simple, file manipulation. Incapable de diagnostiquer une erreur seul.|
|**40-55%**|Workflows complets : debug, deploy, admin. Gere les erreurs et adapte sa strategie.|Agent autonome pour dev/ops. Peut gerer des sous-taches delegues par un planificateur.|
|**> 55%**|Quasi-humain sur les taches CLI. Strategie sophistiquee, adaptation, multi-tool.|Autonomie totale. WakeSystem (proactif) possible. Supervision minimale.|
## **4.4 AA-Omniscience Index : La Confiance**

|**Index**|**Comportement du Modele**|**Impact sur un Agent Autonome**|
| :-: | :-: | :-: |
|**< 0**|Hallucine plus qu'il ne sait. Invente des faits avec aplomb.|DANGEREUX en mode autonome. Cree des taches fantomes, cite des sources inexistantes.|
|**0-15**|Equilibre entre savoir et prudence. Dit parfois "je ne sais pas".|Utilisable avec guard-rails. Validation externe requise pour les decisions critiques.|
|**15-30**|Majoritairement factuel. S'abstient quand incertain.|Mode proactif acceptable. Les rares hallucinations sont detectables par pattern.|
|**> 30**|Excellent. Tres peu d'hallucinations. Calibration fine du doute.|Confiance haute. Agent autonome sans supervision constante.|
## **4.5 Performance (Throughput + TTFT) : L'UX**
La performance n'est pas un "nice-to-have". Elle definit l'utilisabilite reelle de votre agent :

|**Throughput**|**Temps / Iteration**|**15 iterations =**|**Verdict UX**|
| :-: | :-: | :-: | :-: |
|20 tok/s|~25 secondes|6+ minutes d'attente|Inutilisable en interactif|
|40 tok/s|~12 secondes|3 minutes d'attente|Acceptable pour background tasks|
|80 tok/s|~6 secondes|1\.5 minutes d'attente|Bon pour chat temps-reel|
|150+ tok/s|~3 secondes|45 secondes d'attente|Excellent. Multi-agent fluide|

*Note : 500 tokens/iteration est une estimation typique (thought + tool call + JSON). Ajustez selon votre usage.*


# **5. Les 6 Archetypes de Harnais et Leurs Profils**
Votre harnais entre probablement dans une de ces categories. Utilisez le profil correspondant comme point de depart :
## **Archetype A : L'Agent Conversationnel Avance**
Type : Chatbot intelligent avec outils (recherche, calcul, memoire). Ex: assistant personnel.

|**Benchmark Prioritaire**|**Seuil Min**|**Poids**|**Raison**|
| :-: | :-: | :-: | :-: |
|**IFBench**|>= 70%|30%|Format de reponse|
|**Throughput**|>= 60 tok/s|25%|UX conversationnelle|
|**AA-Omniscience**|Index >= 15|25%|Fiabilite des reponses|
|**TTFT**|< 2s|20%|Reactivite chat|
## **Archetype B : L'Agent Codeur / DevOps**
Type : Genere et execute du code. Debug, deploy, CI/CD. Ex: Cursor, Devin-like.

|**Benchmark Prioritaire**|**Seuil Min**|**Poids**|**Raison**|
| :-: | :-: | :-: | :-: |
|**Coding Index**|>= 52|30%|Code executable|
|**Terminal-Bench Hard**|>= 45%|30%|Workflows CLI|
|**LiveCodeBench**|>= 70%|20%|Logique correcte|
|**IFBench**|>= 65%|20%|Respect des specs|
## **Archetype C : L'Orchestrateur Multi-Agents (Swarm)**
Type : Decompose, delegue, synthetise. Gere des sous-agents specialises.

|**Benchmark Prioritaire**|**Seuil Min**|**Poids**|**Raison**|
| :-: | :-: | :-: | :-: |
|**GDPval-AA**|Elo >= 1600|25%|Planification complexe|
|**APEX-Agents-AA**|>= 30%|25%|Multi-tool long-horizon|
|**IFBench**|>= 75%|25%|Blueprints structurees|
|**AA-LCR**|Bon|25%|Contexte multi-agent|
## **Archetype D : L'Agent DSL / Domaine Specifique**
Type : Pilote un moteur via langage structure (multimedia, CAD, finance). Ex: AETHER, SQL agent.

|**Benchmark Prioritaire**|**Seuil Min**|**Poids**|**Raison**|
| :-: | :-: | :-: | :-: |
|**IFBench**|>= 78%|40%|Syntaxe exacte requise|
|**Coding Index**|>= 48|30%|Generation structuree|
|**AA-Omniscience**|Index >= 10|15%|Pas de commandes inventees|
|**Throughput**|>= 40 tok/s|15%|Boucles iteratives|
## **Archetype E : L'Agent Proactif / Autonome**
Type : Agit sans input humain. Surveille, decide, execute. Ex: monitoring, trading, scheduling.

|**Benchmark Prioritaire**|**Seuil Min**|**Poids**|**Raison**|
| :-: | :-: | :-: | :-: |
|**AA-Omniscience**|Index >= 20|35%|Pas d'actions fantomes|
|**Terminal-Bench Hard**|>= 45%|25%|Autonomie execution|
|**IFBench**|>= 75%|20%|Respect des limites|
|**GDPval-AA**|Elo >= 1500|20%|Decisions utiles|
## **Archetype F : Le Harnais Hybride (ex: HIVE-MIND)**
Type : Combine TOUS les archetypes. Conversation + Code + Swarm + DSL + Proactif.

**Besoin : Le modele le plus equilibre possible sur TOUTES les metriques critiques, ou une strategie multi-modele.**

**RECOMMANDATION :** Pour les harnais hybrides, la strategie multi-modele est presque toujours necessaire. Aucun modele ne maximise tout simultanement. Voir Chapitre 7.


# **6. Construire Votre Grille de Selection**
Prenez le template suivant et remplissez-le pour VOTRE harnais :
## **6.1 La Formule de Score**
**Score\_Harnais = Sum(Benchmark\_i x Poids\_i) / Sum(Poids\_i)**

Ou chaque score est normalise entre 0 et 1 :

- IFBench : score\_brut / 100
- Coding Index : score\_brut / 60 (car SOTA = ~59)
- Terminal-Bench : score\_brut / 61 (car SOTA = ~61%)
- Throughput : min(score\_brut / 100, 1.0)
- GDPval : (Elo - 1000) / 800
- Omniscience Index : (Index + 100) / 133 (car range = -100 a 33)
## **6.2 Exemple de Calcul**
Pour un harnais DSL (Archetype D) evaluant GPT-5.5 (xhigh) :

|**Benchmark**|**Brut**|**Normalise**|**Poids**|**Pondere**|**Seuil OK?**|
| :-: | :-: | :-: | :-: | :-: | :-: |
|**IFBench**|76%|0\.76|40%|0\.304|OUI (>78 ideal)|
|**Coding Index**|59\.1|0\.985|30%|0\.296|OUI|
|**Omniscience Idx**|~30|0\.977|15%|0\.147|OUI|
|**Throughput**|65 t/s|0\.65|15%|0\.098|OUI|
|**TOTAL**|||100%|**0.845**||
**Score final : 84.5% - Excellent candidat pour ce profil.**


# **7. La Strategie Multi-Modele : Pourquoi et Comment**
## **7.1 Le Probleme Fondamental**
Voici le trilemme des LLM pour agents :

|**Intelligence**|**Vitesse**|**Cout**|
| :-: | :-: | :-: |
|GPT-5.5 xhigh : Score max partout|65 tok/s, TTFT > 700ms|$4.35/1M tokens|
|Gemini 3.5 Flash : Score moyen|214 tok/s, TTFT ~420ms|$0.22/1M tokens|

**Vous ne pouvez pas avoir les trois. La solution : distribuer.**
## **7.2 Architecture en Tiers (Cascading)**
Assignez un modele par niveau de complexite :

|**Tier**|**Quand l'utiliser**|**Profil Modele**|**Exemples Mai 2026**|
| :-: | :-: | :-: | :-: |
|**S**|Taches complexes, planification, decisions critiques|Max Intelligence + IFBench. Cout eleve OK.|GPT-5.5, Gemini 3.1 Pro, Claude Opus 4.7|
|**A**|Taches standard, la majorite des requetes|Bon equilibre intelligence/vitesse.|GPT-5.4, Grok 4.3, Claude Sonnet 4.6|
|**B**|Taches simples, first-responder, routing|Rapide et pas cher. Intelligence suffisante.|Gemini 3.5 Flash, GPT-5.4 mini|
|**C**|Fallback ultime, keep-alive, healthcheck|Ultra-rapide, tres pas cher. Intelligence min.|gpt-oss-20B, Qwen3.5 4B|
## **7.3 Routing Intelligent**
Comment decider quel tier utiliser pour chaque requete :

- Complexite estimee (nombre de sous-taches, outils requis) -> Tier S si > 3 outils
- Mode PTC requis (code multi-etapes) -> Tier S/A uniquement
- Requete simple et directe -> Tier B
- Rate limit atteint sur Tier superieur -> Cascade vers tier inferieur
- Budget utilisateur proche de la limite -> Forcer Tier B/C
## **7.4 Guard-Rails Multi-Modele (Compensation)**
Quand un benchmark est faible pour TOUS les modeles (ex: AA-Omniscience), compensez par architecture :

- Validation croisee : 2 modeles differents doivent s'accorder pour les actions irreversibles
- RAG-grounded : Toute affirmation factuelle doit citer une source du contexte
- Retry avec feedback : Si le parser rejette une sortie, renvoyer l'erreur au modele + l'instruction violee
- Escalation : Si 2 retries echouent, escalader au Tier superieur


# **8. Les Pieges a Eviter**
## **Piege #1 : Se fier au Intelligence Index seul**
**Probleme :** L'Intelligence Index melange 10 benchmarks dans 4 categories (Agents 25%, Coding 25%, General 25%, Science 25%). Un modele qui score tres haut en maths mais mal en IFBench aura un bon Index mais sera terrible pour votre agent.

**Solution :** Utilisez l'Index comme PRE-FILTRE (>= 45) puis evaluez sur VOS benchmarks prioritaires.
## **Piege #2 : Demander des seuils impossibles**
**Probleme :** Fixer un seuil au-dessus du SOTA actuel (ex: Omniscience >= 88% quand le max est 57%). Resultat : vous ne selectionnez AUCUN modele et bloquez votre projet.

**Solution :** Toujours verifier le SOTA actuel avant de fixer un seuil. Votre minimum ne peut pas depasser ce qui existe. Si le SOTA ne suffit pas, compensez par architecture.
## **Piege #3 : Ignorer la difference Provider vs Modele**
**Probleme :** Le TTFT et le Throughput dependent autant du PROVIDER que du modele. Le meme Llama 4 405B fait 480 tok/s sur Groq et 80 tok/s sur Together.

**Solution :** Evaluez toujours les metriques de performance sur le provider que VOUS utiliserez. Les benchmarks generiques donnent des moyennes.
## **Piege #4 : Optimiser pour le benchmark au lieu du use-case**
**Probleme :** Un modele optimise pour IFBench peut devenir trop rigide et perdre en creativite ou en raisonnement exploratoire.

**Solution :** Testez toujours sur VOS prompts reels en plus des benchmarks. Les benchmarks predisent mais ne garantissent pas.
## **Piege #5 : Oublier le cout cumule**
**Probleme :** Un agent fait 15 iterations par tache, 50 taches par jour. A $4/1M tokens avec 2000 tokens/iteration : $4 x 0.002 x 15 x 50 = $6/jour. $180/mois. Pour UN user.

**Solution :** Calculez le cout REEL avec la formule : Cout/tache = (tokens\_in + tokens\_out) x iterations x prix\_par\_token. Integrez-le dans votre selection.
## **Piege #6 : Ne pas tester le mode reasoning vs non-reasoning**
**Probleme :** Beaucoup de modeles modernes ont un mode 'thinking/reasoning' qui ameliore la qualite mais multiplie le TTFT par 10-50x et les tokens par 3-5x.

**Solution :** Definissez quand activer le reasoning (Tier S uniquement ? taches > 3 sous-etapes ?) et quand le desactiver.


# **9. Template d'Evaluation Pret a Remplir**
Copiez ce template et remplissez-le pour votre harnais :
## **SECTION A - Identification du Harnais**

|**Nom du Harnais :**|*[Votre nom]*|
| :- | :- |
|**Archetype(s) :**|*[A / B / C / D / E / F - voir Chapitre 5]*|
|**Canaux de communication :**|*[Chat / Voice / API / Background / ...]*|
|**Iterations par tache (moyenne) :**|*[5 / 10 / 15 / 30]*|
|**Budget cible par tache :**|*[tokens ou $]*|
## **SECTION B - Fonctions du LLM**

|**Fonction**|**Frequence**|**Criticite**|**Benchmark**|**Seuil Min**|
| :-: | :-: | :-: | :-: | :-: |
|*[ex: Generer tool call JSON]*|*[Chaque tour]*|*[EXISTENTIEL]*|*[IFBench]*|*[>= 70%]*|
|[...]|[...]|[...]|[...]|[...]|
|[...]|[...]|[...]|[...]|[...]|
|[...]|[...]|[...]|[...]|[...]|
## **SECTION C - Grille de Selection**

|**Benchmark**|**Poids**|**Minimum**|**Confort**|**Optimal**|**SOTA**|**Mon seuil**|
| :-: | :-: | :-: | :-: | :-: | :-: | :-: |
|*[P1 : ...]*|[...%]|[...]|[...]|[...]|[...]|[...]|
|*[P1 : ...]*|[...%]|[...]|[...]|[...]|[...]|[...]|
|*[P2 : ...]*|[...%]|[...]|[...]|[...]|[...]|[...]|
|*[P3 : ...]*|[...%]|[...]|[...]|[...]|[...]|[...]|
## **SECTION D - Resultat**

|**Modele Candidat**|**Score Pondere**|**P1 tous OK ?**|**Decision**|
| :-: | :-: | :-: | :-: |
|[...]|[...]|[OUI/NON]|[SELECTIONNE / REJETE]|
|[...]|[...]|[OUI/NON]|[SELECTIONNE / REJETE]|


# **10. Ressources et Outils**
## **10.1 Ou Trouver les Scores**

|**Ressource**|**URL / Usage**|
| :-: | :-: |
|**Artificial Analysis (Reference)**|artificialanalysis.ai/leaderboards/models - Leaderboard principal avec filtres|
|**Benchmarks individuels**|artificialanalysis.ai/evaluations/[benchmark-name] - Scores detailles par bench|
|**Easy Benchmarks**|easy-benchmarks.com - Vue simplifiee et comparaisons rapides|
|**LLM Registry**|llm-registry.com - Scores avec historique et tendances|
|**Price Per Token**|pricepertoken.com/leaderboards - Scores + pricing combine|
|**LiveCodeBench officiel**|livecodebench.github.io - Scores de coding contamination-free|
## **10.2 Checklist Finale Avant Selection**
- Ai-je identifie mes 3 fonctions LLM les plus critiques ?
- Ai-je verifie le SOTA actuel pour chaque benchmark avant de fixer mes seuils ?
- Mon seuil minimum est-il en dessous du SOTA ? (sinon, aucun modele ne passera)
- Ai-je teste sur MES prompts reels, pas seulement les benchmarks ?
- Ai-je calcule le cout cumule (iterations x tokens x prix) ?
- Ai-je prevu un plan de fallback multi-modele si le Tier S est trop lent/cher ?
- Ai-je des guard-rails pour les benchmarks ou aucun modele n'est suffisant ?
- Ai-je defini quand utiliser le mode reasoning vs non-reasoning ?
## **10.3 Frequence de Re-evaluation**
Les leaderboards evoluent vite. Recommandation :

- Tous les 2 mois : Verifier si un nouveau modele depasse votre selection actuelle
- A chaque release majeure : Re-evaluer (nouveau GPT, Claude, Gemini = potentiel de progression)
- Jamais en production sans A/B test : Toujours shadow-test avant de switcher

**Ce guide represente l'etat de l'art en mai 2026. Les scores evolueront mais la METHODE reste valide : decomposer, prioriser, mapper, seuiller, tester.**
Page 
