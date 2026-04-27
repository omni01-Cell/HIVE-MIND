# 🧠 HIVE-MIND V3 : Agent IA Social, Autonome & Omni-Channel

![Version](https://img.shields.io/badge/Version-3.0.0-blue.svg)
![Type](https://img.shields.io/badge/Status-Agentic_Level_5-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## 📖 Sommaire
1. [Introduction](#-cest-quoi-hive-mind-)
2. [Piliers Architecturaux](#-les-piliers-architecturaux-de-lintelligence)
3. [Fonctionnement (ReAct & Swarm)](#-comment-ça-marche-le-cerveau)
4. [Modèles & APIs](#-modèles--apis-supportés)
5. [Guide d'Installation](#-guide-dinstallation)
6. [Structure du Projet](#-structure-du-projet)
7. [Sécurité & Avertissements](#-avertissements)

---

## 📖 C'est quoi HIVE-MIND ?

HIVE-MIND n'est pas un simple "chat-bot" qui répond à des questions. C'est un **Agent Autonome de Niveau 5** totalement écrit en TypeScript strict.

Contrairement aux bots classiques qui attendent une commande, HIVE-MIND possède une **vie interne permanente** (WakeSystem) : il réfléchit en arrière-plan, se fixe ses propres objectifs, et observe les conversations pour intervenir de manière asynchrone, même sans être sollicité.

Désormais **Omni-Channel** (WhatsApp, Discord, Telegram, CLI TUI), il est capable d'orchestrer dynamiquement ses propres sous-agents (Swarm Architecture) et d'exécuter du code de façon autonome via un environnement sécurisé (Programmatic Tool Calling).

---

## 🌟 Les Piliers Architecturaux de l'Intelligence

### 🧠 1. Mémoire Omni-Channel & Identité
- **Identité Unifiée** : Gestion des utilisateurs cross-plateforme via base de données centralisée.
- **Mémoire Immédiate (Redis)** : Gestion du contexte en temps réel et haute vélocité.
- **Mémoire Sémantique (Vecteurs)** : Souvenirs persistants et RAG (Retrieval-Augmented Generation).

### 🧘 2. Conscience & GWT (Global Workspace Theory)
- **WakeSystem & Inner Monologue** : L'agent dispose d'une boucle d'exécution asynchrone qui lui permet de "penser" et d'agir en arrière-plan (utilisation du tag silencieux `SILENT_HM`).
- **Context Loader (GWT)** : Système de prompts dynamiques intégrant l'identité, l'état de conscience et la zone d'exécution en temps réel.
- **Apprentissage par Feedback** : Adaptation dynamique selon l'historique et les corrections.

### 🚀 3. Orchestration Swarm & PTC
- **SubAgentEngine** : Capacité de générer et piloter dynamiquement des sous-agents spécialisés (Shopping, Deep Research, etc.).
- **Programmatic Tool Calling (PTC)** : Exécution de scripts ultra-rapide validée par SafeScript (AST Validator) dans une VM Sandbox sécurisée.

---

## 🛠️ Comment ça marche (Le Cerveau)

HIVE-MIND utilise un pattern **ReAct avancé** (Reasoning + Acting) couplé à une architecture Swarm :
1. **Perception** : Analyse hybride multi-canaux, souvenirs et état émotionnel (GWT).
2. **Réflexion** : Génération d'une pensée interne invisible (`<think>` et monologue interne).
3. **Action Rapide / Complexe** : Routage intelligent entre actions rapides (FastPath PTC) ou déploiement de sous-agents (Swarm).
4. **Observation & Auto-Correction** : Analyse continue des résultats avec auto-réparation des erreurs syntaxiques.

---

## 🤖 Modèles & APIs Supportés

Doté du Smart Router **Zero-429** et d'une intégration native avec **OpenRouter**, le bot bascule intelligemment et en temps réel entre les fournisseurs selon la criticité (S/A/B/C tier) et les capacités requises.

### 🧠 LLM (Cerveaux)
- **Google** : Gemini 3.1 Flash (Primary Agentic), Gemini 3.1 Flash-Lite, Gemini Live 2.5 (Native Audio).
- **Minimax** : Minimax m2.5 (Tier S pour PTC et Swarm).
- **Anthropic & OpenAI** : Claude 3.5 Sonnet, GPT-4o.
- **Open Source** : Mistral, Llama 3.1, Qwen (via OpenRouter/Groq).

### 🎙️ Audio & Multimédia
- **Reconnaissance Visuelle & Audio native** : Support du Voice-to-Voice natif (Gemini Live) pour les channels vocaux.
- **Transcription** : Groq Whisper-Large-v3.
- **Web Search** : Google AI Search via SerpApi (Standard, Chat, New modes).

---

## 🚀 Guide d'Installation

### � Spécifications Minimum
| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| **OS** | Windows 10+ / Linux / macOS | Debian/Ubuntu |
| **Node.js** | **18.x LTS** | 20.x LTS |
| **RAM** | 512 MB | 1 GB+ |
| **Hébergement** | VPS (5$/mois) | Oracle Free Tier |

### 🌐 Services Requis (Free Tiers)
- **[Supabase](https://supabase.com)** : Base de données & Mémoire vectorielle.
- **[Redis (Upstash)](https://upstash.com)** : Cache & Contexte éphémère.
- **[Gemini API](https://aistudio.google.com)** : IA principale.

### ⚙️ Configuration
1. **Supabase** : Déployez les schémas SQL du dossier `/supabase`.
2. **Environnement** : Copiez `.env.example` en `.env` et remplissez vos clés.
3. **Installation** : 
   ```bash
   npm install
   ```
4. **Lancement** :
   ```bash
   npm run dev
   ```
   *Scannez le QR Code généré avec votre application WhatsApp.*

---

## 📂 Structure du Projet (TypeScript)

```text
/core      -> Orchestration globale, Smart Router, Core Hub.
/services  -> Mémoires (Redis/Supabase), Agentic Swarm (/agentic), PTC & Sandbox (/ptc), Conscience (WakeSystem).
/plugins   -> Outils natifs (Web Search, File Edit, etc.) et commandes.
/providers -> Adapters IA et Transporteurs Omni-Channel (WhatsApp, CLI, Telegram, Discord).
/persona   -> Contextes dynamiques GWT et identité.
/.GCC      -> Git-Context-Controller : Mémoire persistante du développement.
/Sandbox1  -> Environnement de confinement pour l'exécution PTC.
```

---

## ⚠️ Avertissements
HIVE-MIND possède des capacités d'administration puissantes. Configurez impérativement vos **Super-Admins** dans la base de données pour sécuriser les fonctions critiques (Ban, Shutdown, Commandes système).

---
*HIVE-MIND V3 - L'étape ultime vers une IA compagne et proactive.*
