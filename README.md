# 🧠 HIVE-MIND V1 : L'IA Sociale & Autonome pour WhatsApp

![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)
![Type](https://img.shields.io/badge/Status-Agentic_Level_5-green.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## 📖 Sommaire
1. [Introduction](#-cest-quoi-hive-mind-)
2. [Les 3 Piliers](#-les-3-piliers-de-lintelligence-hive-mind)
3. [Fonctionnement (ReAct)](#-comment-ça-marche-le-cerveau)
4. [Modèles & APIs](#-modèles--apis-supportés)
5. [Guide d'Installation](#-guide-dinstallation)
6. [Structure du Projet](#-structure-du-projet)
7. [Sécurité & Avertissements](#-avertissements)

---

## 📖 C'est quoi HIVE-MIND ?

HIVE-MIND n'est pas un simple "chat-bot" qui répond à des questions. C'est un **Agent Autonome de Niveau 5**. 

Contrairement aux bots classiques qui attendent une commande, HIVE-MIND possède une **vie interne** : il réfléchit à ses erreurs, se fixe ses propres objectifs, et observe les conversations de groupe pour intervenir au bon moment, même si on ne lui parle pas directement.

Il est conçu pour être un membre à part entière d'une communauté WhatsApp, capable de modérer, d'aider, de chercher des informations et de tisser des liens logiques entre les connaissances qu'il acquiert.

---

## 🌟 Les 3 Piliers de l'Intelligence HIVE-MIND

### 🧠 1. Mémoire Multi-Couches
- **Mémoire Immédiate (Redis)** : Gestion du contexte en temps réel et vélocité du chat.
- **Mémoire Long Terme (Vecteurs)** : Souvenirs persistants et RAG (Retrieval-Augmented Generation).
- **Graphe Social** : Compréhension des relations entre utilisateurs et hiérarchie.

### 🧘 2. Conscience & Auto-Réflexion
- **Mode Rêve (Dreaming)** : Analyse nocturne des interactions pour l'auto-amélioration.
- **Boussole Morale** : Filtrage éthique des actions et vérification d'autorité.
- **Apprentissage par Feedback** : Adaptation dynamique via les réactions (emoji) des utilisateurs.

### 🚀 3. Proactivité Sociale
- **Social Cue Watcher** : Intervention autonome basée sur le sentiment ou les besoins détectés.
- **Auto-Gestion d'Objectifs** : Planification et exécution de tâches à long terme sans intervention humaine.

---

## 🛠️ Comment ça marche (Le Cerveau)

HIVE-MIND utilise le pattern **ReAct** (Reasoning + Acting) :
1. **Perception** : Analyse hybride du message, des souvenirs et de l'état émotionnel.
2. **Réflexion** : Génération d'une pensée interne invisible pour l'utilisateur.
3. **Action** : Utilisation dynamique d'outils (Search, Admin, Media, etc.).
4. **Observation** : Analyse des résultats et boucle de correction automatique.

---

## 🤖 Modèles & APIs Supportés

Doté du routeur **Zero-429**, le bot bascule intelligemment entre les modèles pour optimiser coûts et performances.

### 🧠 LLM (Cerveaux)
- **Google** : Gemini 3 Flash, 2.5 Flash, Gemma 2.
- **OpenAI** : GPT-5.2, GPT-5 Mini.
- **Anthropic** : Claude 4.5 Opus/Sonnet.
- **Open Source** : Mistral, Llama 3.3, DeepSeek (via GitHub/Groq).

### 🎙️ Audio & Voix
- **Transcription** : Groq Whisper-Large-v3 (<500ms).
- **Synthèse (TTS)** : 
    - **Minimax** : Voix HD clonée (de votre persona).
    - **Gemini TTS** : 30 voix natives multilingues.
    - **gTTS** : Fallback universel.

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

## 📂 Structure du Projet

```text
/core      -> Orchestration, logique ReAct, contexte.
/services  -> Mémoires (Redis/Vecteurs/Graph), Conscience, Goals.
/plugins   -> Catalogue d'outils et commandes.
/providers -> Adapters IA (Gemini, OpenAI, Mistral, etc.).
/persona   -> Profile, traits de caractère et prompts système.
/config    -> Configuration des modèles et scheduler.
```

---

## ⚠️ Avertissements
HIVE-MIND possède des capacités d'administration puissantes. Configurez impérativement vos **Super-Admins** dans la base de données pour sécuriser les fonctions critiques (Ban, Shutdown, Commandes système).

---
*HIVE-MIND V3 - L'étape ultime vers une IA compagne et proactive.*
