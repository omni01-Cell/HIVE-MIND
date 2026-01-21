# 📜 Liste des Commandes et Capacités du Bot (V1)

Ce document référence l'intégralité des commandes disponibles, qu'elles soient déclenchées par texte (Regex) ou par l'Intelligence Artificielle.

---

## 🛠️ Commandes Développeur / Système (Préfixe ".")
Ces commandes sont rapides, sans IA, et servent à la maintenance ou au debug.

| Commande | Description | Permission |
| :--- | :--- | :--- |
| `.shutdown` | 🛑 Arrête immédiatement le processus du bot. | **Admin/Dev** |
| `.devcontact` | 📇 Envoie la fiche contact du développeur (+225...). | Tout le monde |

---

## 👥 Gestion de Groupe (Group Manager)
Commandes pour gérer les membres et la sécurité. L'IA peut les exécuter si tu lui demandes en langage naturel.

### Commandes IA (Langage Naturel)
*Exemple : "Bannis @Toto", "Mute tout le monde", "Change la description"*

| Action | Description | Exemple naturel |
| :--- | :--- | :--- |
| **Bannir** | Retire un utilisateur du groupe (Ban). | "Bannis @Jean car il spamme" |
| **Expulser (Kick)** | Expulse sans bannir (Avertissement fort). | "Vire @Jean (Kick simple)" |
| **Avertir (Warn)** | Ajoute un avertissement officiel. | "Mets un warn à @Pierre" |
| **Verrouiller** | Ferme le groupe (Admins only). | "Verrouille le groupe" |
| **Déverrouiller** | Rouvre le groupe. | "Ouvre le groupe" |
| **Mute (Chut)** | Empêche un membre de parler (Admin only). | "Mute @Pierre pour 10 minutes" |
| **Unmute** | Redonne la parole. | "Redonne la parole à @Pierre" |
| **Tag All** | Mentionne tout le monde. | "Tag tout le monde pour l'annonce" |
| **Promouvoir** | Promeut un membre Admin. | "Mets @Alice admin" |
| **Rétrograder** | Retire les droits Admin. | "Retire les droits de @Alice" |
| **Info Groupe** | Affiche les infos (Dernier scan). | "Donne-moi les infos du groupe" |

### 💻 SYSTEM (Super-Admins)
| Action | Description | Exemple |
| :--- | :--- | :--- |
| **Status** | Affiche CPU/RAM/Uptime. | "Status système" / `.sys` |
| **Shutdown** | Arrête le processus. | "Eteins-toi" / `.stop` |
| **Restart** | Redémarre (si géré par PM2). | "Reboot" / `.restart` |
| **Update** | Git pull du code. | "Mets-toi à jour" |

### Commandes Textuelles (Legacy / Rapide)
*Ces commandes sont parsées via `.task` pour contourner l'IA si besoin.*

| Commande | Format | Description |
| :--- | :--- | :--- |
| `.task ban` | `.task ban @user [raison]` | Bannissement direct |
| `.task mute` | `.task mute @user [durée_min]` | Mute temporaire |
| `.task unmute` | `.task unmute @user` | Unmute direct |
| `.task tagall` | `.task tagall [message]` | Tag tout le monde |

---

## 🎭 Interactions & Social (Social Intelligence)
Fonctionnalités pour rendre le bot vivant et interactif.

| Fonctionnalité | Description | Déclencheur |
| :--- | :--- | :--- |
| **Réponse Adaptative** | Le bot adapte son style (Citation/Tag) selon la vitesse du chat. | Automatique (Activité du groupe) |
| **Conversation Contextuelle** | Le bot répond sans qu'on le nomme si on est seul avec lui. | Automatique (Suivi de conversation) |
| **Réactions Émotionnelles** | Réagit par emoji (🤦‍♂️, 😂, ❤️) au lieu de parler. | Automatique (Jugement IA) |
| **Sondages** | Crée un vrai sondage WhatsApp. | "Lance un sondage : Pizza ou Sushi ?" |
| **Contact** | Envoie une fiche contact VCard. | "Envoie le contact de X..." |
| **Présence** | S'affiche "En ligne" ou "Écrit..." | Automatique |

---

## 🧠 Services & Mémoire
Services cognitifs pour enrichir l'expérience.

| Outil | Description | Exemple naturel |
| :--- | :--- | :--- |
| **Recherche Web** | Cherche sur DuckDuckGo (Actus, Météo, Faits). | "Qui a gagné le match ?" / "Météo Paris" |
| **Mémoire Long Terme** | Se souvient des faits passés. | "Qu'est-ce que je t'ai dit hier ?" |
| **Mémoire Groupe** | Connaît les membres et le contexte. | "Qui est admin ici ?" |

---

## 📝 Notes Techniques
- **Préfixe IA** : Aucun. Parlez naturellement "Erina, ..." ou mentionnez `@Erina`.
- **Préfixe Commande** : `.` (point) pour les commandes techniques (`.shutdown`).
- **Mode Solo** : Si vous parlez seul avec le bot, pas besoin de répéter son nom à chaque fois (pendant 2 min).

> *Dernière mise à jour : 18 Janvier 2026*
