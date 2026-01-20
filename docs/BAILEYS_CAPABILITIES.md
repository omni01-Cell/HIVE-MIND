# Capabilities du Module Baileys

Ce document liste l'ensemble des fonctionnalités offertes par la bibliothèque `@whiskeysockets/baileys` pour l'interaction avec WhatsApp Web. Ces fonctionnalités pourront être implémentées progressivement dans le bot.

## 1. Connexion et Authentification
- [x] **Multi-Device Support:** Support complet de la fonctionnalité multi-appareils de WhatsApp.
- [x] **Authentification Flexible:** Gestion de l'état d'authentification (sessions) avec stockage personnalisé (fichier JSON, base de données, etc.). (Via `useMultiFileAuthState`)
- [x] **QR Code / Pairing Code:** Connexion via scan de QR code ou code de jumelage (Pairing Code). (QR Code implémenté)
- [x] **Session Restoration:** Restauration automatique des sessions après redémarrage.

## 2. Gestion des Messages
- [x] **Envoi de Messages Texte:** Envoi de messages simples. (`sendText`)
- [x] **Envoi de Médias:** Support des images, vidéos, audios, documents, stickers et GIFs. (`sendMedia`, `sendSticker`)
- [ ] **Messages Vocaux:** Envoi de notes vocales (PTT).
- [ ] **Messages Éphémères:** Support des messages qui disparaissent.
- [ ] **Réactions:** Ajouter des réactions (emojis) aux messages.
- [x] **Citations (Quoted Messages):** Répondre à un message spécifique. (Supporté dans `sendText` option `reply` et `_normalizeMessage`)
- [ ] **Transfert (Forwarding):** Transférer des messages.
- [ ] **Suppression:** Supprimer des messages (pour soi ou pour tout le monde).
- [ ] **Édition:** Modifier des messages envoyés.
- [x] **Mention:** Mentionner des utilisateurs spécifiques (`@jid`). (Supporté dans `sendText` et détection)
- [ ] **Vue Unique (View Once):** Envoi de médias en vue unique.
- [ ] **Sondages (Polls):** Création et gestion de sondages.

## 3. Gestion des Groupes
- [ ] **Création de Groupes:** Créer de nouveaux groupes.
- [x] **Gestion des Participants:** Ajouter, retirer, promouvoir (admin) ou rétrograder des participants. (Partiellement implémenté: `banUser` pour retirer, événements écoutés)
- [ ] **Modification des Infos du Groupe:** Changer le sujet (titre), la description et l'image du groupe.
- [ ] **Paramètres du Groupe:** Restreindre qui peut envoyer des messages ou modifier les infos.
- [ ] **Invitations:** Obtenir ou révoquer le lien d'invitation, rejoindre via lien.
- [ ] **Code d'Invitation:** Révoquer/Générer des codes d'invitation.
- [ ] **Quitter/Archiver:** Quitter ou archiver des groupes.

## 4. Gestion des Contacts et du Profil
- [x] **Récupération des Contacts:** Obtenir la liste des contacts et leurs statuts. (Via `contacts.upsert` mais limité au mapping interne)
- [ ] **Blocage/Déblocage:** Bloquer ou débloquer des utilisateurs.
- [ ] **Photo de Profil:** Récupérer ou mettre à jour la photo de profil (personnel ou groupe).
- [ ] **Statut (About):** Mettre à jour le statut textuel.
- [x] **Présence:** Mettre à jour le statut de présence (en ligne, en train d'écrire, enregistrement audio). (`setPresence`)

## 5. Fonctionnalités Avancées
- [x] **Écoute d'Événements:** Système robuste d'événements pour écouter les nouveaux messages, les mises à jour de statut, les connexions, etc.
- [x] **Historique des Chats:** Synchronisation de l'historique des discussions. (`syncFullAppState: true`)
- [ ] **Lecture des Reçus:** Marquer les messages comme lus ou non lus.
- [ ] **Mise en Sourdine (Mute):** Mettre en sourdine des chats ou groupes.
- [ ] **Épinglage (Pin):** Épingler des chats en haut de la liste.
- [ ] **Étiquettes (Labels):** Gestion des étiquettes (pour WhatsApp Business).
- [ ] **Listes de Diffusion (Broadcast):** (Support limité/déprécié selon les versions, à vérifier).

## 6. Surveillance et Confidentialité
- [ ] **Mises à Jour de Profil:** Détecter quand un contact change sa photo ou son statut.
- [ ] **Stories/Statuts:** Voir et répondre aux statuts (stories) des contacts.
- [ ] **Paramètres de Confidentialité:** Gérer les paramètres de confidentialité (qui peut voir la photo, le statut, etc.).

## Références
- **NPM:** [npmjs.com/package/@whiskeysockets/baileys](https://www.npmjs.com/package/@whiskeysockets/baileys)
- **GitHub:** [github.com/WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
- **Documentation:** [baileys.wiki](https://baileys.wiki)
