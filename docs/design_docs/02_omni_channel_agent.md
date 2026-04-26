# Design Document : Architecture Omni-Channel & Dual Rendering

## 1. Contexte & Vision Globale
Initialement conçu comme un framework de bot WhatsApp, HIVE-MIND évolue vers un **Agent Autonome Omni-Channel**. Le défi principal est de découpler le "Cerveau" (Logique d'intelligence et personnalité neutre) de "l'Interface" (Formatage, rendu visuel, sécurité selon la plateforme de diffusion).

Cette refonte s'inspire fortement des meilleures pratiques de conception extraites de **Claude Code** (Anthropic), notamment pour la gestion asynchrone des CLI/TUI et l'implémentation du pattern du "Double Rendu".

## 2. Détection d'Environnement et Headless Mode
Afin d'éviter le lancement intempestif de l'interface graphique (TUI/CLI) sur un serveur, nous utilisons une variable d'environnement (`APP_ENV`).

- **Local (`APP_ENV=local`)** : Instancie et lance l'interface TUI/CLI interactive.
- **Server (`APP_ENV=server`)** : Lance le programme en mode "Headless" (silencieux), qui écoute uniquement les requêtes via Webhooks ou API (WhatsApp, Discord, etc.).

*Extrait théorique du point d'entrée (`main.ts`) :*
```typescript
if (process.env.APP_ENV === "local") {
    startTUIInterface(agent);
} else {
    startHeadlessServer(agent);
}
```

## 3. Le Pattern du "Double Rendu" (Dual Rendering)
Conformément à l'approche de Claude Code, l'agent IA produit une réponse structurée, mais cette réponse n'est pas formatée directement pour une plateforme.

L'agent renvoie un **Objet de Réponse Universel (Universal Response Object)** qui sert de pivot. Cet objet contient le strict nécessaire, et chaque canal va exploiter les attributs dont il a besoin.

```typescript
interface UniversalResponse {
    data: any;              // Données brutes (JSON, état interne)
    markdown: string;       // Texte complet pour CLI/Telegram/Discord
    plain_text: string;     // Texte filtré, court et neutre (sans formatage avancé)
    visual?: any;           // Composants UI interactifs (React/Ink)
}
```

## 4. Logique d'Aiguillage (Interface Manager & Adaptateurs)
Au lieu d'avoir un "System Prompt" unique qui tente de deviner la plateforme de sortie, le formatage final est délégué à des **Adaptateurs**.

- **Interface Abstraite (`BaseInterface`)** : Chaque canal hérite de cette classe et implémente la méthode `send()`.
- **`WhatsAppAdapter`** :
    - Filtre le markdown complexe.
    - Effectue un nettoyage (*Sanitizer*) strict pour retirer les chemins absolus locaux et les commandes bash (sécurité).
    - Convertit la syntaxe riche vers la syntaxe restreinte de WhatsApp (ex: `*gras*`).
    - Gère la troncature de texte pour éviter les limites de caractères ("Lire la suite").
- **`CLIAdapter` / `TUIAdapter`** :
    - Utilise une bibliothèque de rendu de terminal riche (ex: `chalk`, `ink` ou `blessed`).
    - Implémente le rendu asynchrone par générateurs (`async *call()`) pour afficher des spinners et barres de progression.
    - Transforme les outils en blocs interactifs (Double Rendu: UI vs LLM).
- **`DiscordAdapter`** :
    - Emballe les éléments visuels dans des "Embeds".

## 5. Neutralisation du Prompt Core ("Cerveau") et Injection Dynamique
Le "Cerveau" (le modèle LLM) ne doit pas être "conscient" de sa propre limitation de canal dans son *core prompt*.

### A. Neutralisation
- Suppression des directives WhatsApp spécifiques du fichier de profil persona (`profile.json` ou `CLAUDE.md`).
- Le système parle et se comporte de manière neutre (Markdown standard).

### B. "Context Snippets" (Injection au moment du prompt)
Pour ajuster subtilement le comportement selon la source de la requête de l'utilisateur, un contexte dynamique (`<env>`) est injecté au moment de l'appel LLM :

- *Si l'entrée vient de WhatsApp* : `<env>canal: whatsapp. Directive: Réponds de manière très concise, sans blocs de code complexes.</env>`
- *Si l'entrée vient de la CLI* : `<env>canal: terminal local. Directive: Tu peux utiliser des structures de logs techniques et des outils Bash.</env>`

## 6. Architecture des Outils (Inspiré de Claude Code)
Chaque outil de l'agent implémentera deux méthodes distinctes pour répondre aux besoins du LLM vs de l'humain :
- `formatForLLM(result)` : Crée un texte brut, souvent tronqué (Tête et Queue pour sauver des tokens).
- `formatForUser(result)` : Crée un rendu esthétique pour l'utilisateur (CLI ou Webhook formaté).
