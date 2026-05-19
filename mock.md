# Liste des Mocks et Placeholders en attente d'implémentation

*(Mis à jour suite à l'analyse Graphify)*

Ce document recense les éléments simulés (mocks) et les zones réservées (placeholders) dans le code de production de HIVE-MIND-RAILWAY qui nécessitent une implémentation finale ou un remplacement.

## 1. MailboxWatcher (Simulation d'événements externes)
- **Fichier** : `services/events/MailboxWatcher.ts`
- **Description** : Actuellement, le système simule la réception d'un e-mail ou d'une alerte système en injectant un faux événement toutes les 30 minutes via un `setInterval`.
- **Action requise** : Remplacer ce mock par une véritable intégration asynchrone (par exemple, un endpoint Express pour recevoir des Webhooks, ou un client IMAP pour lire de vrais e-mails).

## 2. Job Scheduler : dailyGreeting (Placeholder)
- **Fichiers** : `core/handlers/schedulerHandler.ts` et `core/index.ts`
- **Description** : Le job planifié pour envoyer un message matinal (`dailyGreeting`) est vide. Il contient le commentaire `// Placeholder - Envoyer un message matinal aux groupes actifs` et fait uniquement un `console.log`.
- **Action requise** : Coder la logique pour récupérer la liste des groupes actifs, générer un message matinal pertinent via le LLM, et l'envoyer via le module de transport.

## 3. Réflexion Spontanée : fakeContext (Simulation de message)
- **Fichiers** : `core/handlers/schedulerHandler.ts` et `core/index.ts` (job `spontaneousReflection`)
- **Description** : Pour réveiller un groupe inactif, le système génère un faux message utilisateur (`fakeContext`) provenant de `system@internal` pour forcer le LLM à répondre.
- **Action requise** : Créer un vrai mécanisme de "Proactive Trigger" au niveau de l'orchestrateur pour que l'agent puisse initier la parole de lui-même, sans avoir besoin d'usurper sa propre file de messages entrants.

## 4. Transport Baileys : fakeRawMessage
- **Fichier** : `core/transport/baileys.ts`
- **Description** : Utilisation d'un objet `fakeRawMessage` pour emballer les événements internes du bot (comme ceux générés par le système de Wake/Sleep) afin de satisfaire le typage strict de Baileys (qui attend un véritable `WAMessage` venant du réseau).
- **Action requise** : Améliorer l'abstraction des événements (Standardized BotEvent) pour séparer complètement les messages WhatsApp du réseau des événements internes du système.

## 5. Initialisation des Plugins : Placeholder
- **Fichier** : `plugins/tools/send_sticker/index.ts`
- **Description** : Contient un commentaire indiquant que les données démarrent avec un placeholder (`// Built dynamically at init — starts with a placeholder`).
- **Action requise** : Vérifier que le chargement dynamique du buffer ou des assets des stickers écrase bien ce placeholder correctement en production.

## 6. Variables d'environnement : Placeholders textuels
- **Fichiers** : `services/envResolver.ts` et `config/keyResolver.ts`
- **Description** : Le système a des méthodes spécifiques pour détecter si des identifiants API sont encore des placeholders comme `VOTRE_CLE_ICI` ou `${OPENAI_KEY}` au lieu de la vraie valeur.
- **Action requise** : S'assurer que le workflow d'onboarding administrateur guide bien l'utilisateur pour qu'il remplace ces placeholders dans son fichier `.env` ou son Dashboard.
