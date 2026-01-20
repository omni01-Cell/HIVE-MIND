# 📋 Tests du Bot - Checklist Complète
> **Dernière mise à jour :** 18 Janvier 2026
> Ce document regroupe tous les tests à effectuer après chaque modification.

---

# 🔊 Voice System (Janvier 2026)

## 1. TTS Fallback (VoiceProvider)
### Test 1.1 - Chaîne de fallback
**Action :** Envoyer un vocal au bot.
**Vérifier :**
- [ ] Logs indiquent fallback si Minimax HS (`✅ TTS réussi via gemini...` ou `gtts`).
- [ ] Réception d'un PTT (micro bleu).

### Test 1.2 - Format vocal WhatsApp (PTT)
**Vérifier :**
- [ ] Icône micro bleu (pas note de musique).
- [ ] Vitesse lecture modifiable.

## 2. Modes de Transcription
### Test 2.1 - Vérifier mode
**Action :** `.voice status` -> Réponse attendue.

### Test 2.2 - Mode Restricted
**Action :** Vocal sans répondre au bot -> Ignoré.
**Action :** Vocal en répondant au bot -> Transcrit.

### Test 2.3 - Mode Full
**Action :** `.voice full` -> Vocal "Erina, bonjour" -> Transcrit.
**Action :** Vocal sans nom -> Ignoré.

## 3. Permissions Audio par Groupe
### Test 3.1 - Status par défaut
**Action :** `.audio.status` -> "Tout le monde".

### Test 3.2 - Bloquer non-admins
**Action :** `.mute.audio_for_none`
**Vérifier :** Non-admin ignoré, Admin OK.

### Test 3.3 - Bloquer tout le monde
**Action :** `.mute.audio_for_all` -> Personne ne passe.

### Test 3.4 - Reset
**Action :** `.allow.audio_for_all`.

## 4. Plugin text_to_speech
### Test 4.1 - Déclenchement manuel
**Action :** "Erina, dis bonjour avec ta voix" -> Utilise l'outil `text_to_speech`.

## 5. Cas d'erreur Audio
### Test 5.1 - Tous providers HS
**Action :** Couper clés API.
**Vérifier :** Fallback texte gracieux.

---

# 🛡️ Sécurité & Modération

## 6. Anti-Delete (Message Revocation Guard)
### Test 6.1 - Status
**Action :** `.antidelete status`.

### Test 6.2 - Activation
**Action :** `.antidelete on` -> Confirmé.

### Test 6.3 - Fonctionnement
**Action :** Supprimer un message.
**Vérifier :** Bot reposte le message supprimé.

### Test 6.4 - Historique
**Action :** `.deleted`.

### Test 6.5 - Désactivation
**Action :** `.antidelete off`.

### Test 6.6 - Via IA
**Action :** "Erina, active l'anti-suppression".

## 7. Ghost Tagging
### Test 7.1 - Admin Tag
**Action :** Admin envoie `tagall`.
**Vérifier :** Message "Tag All" + Notifications pour tous.

### Test 7.2 - User Tag (Interdit)
**Action :** User lambda envoie `tagall`.
**Vérifier :** Réaction ❌, pas de tag.

### Test 7.3 - Via IA
**Action :** "Erina, notifie tout le monde".

## 8. Commandes de Groupe (IA)
### Test 8.1 - Unmute
**Action :** "Redonne la parole à @User".

### Test 8.2 - Promote
**Action :** "Mets @User admin".

### Test 8.3 - Demote
**Action :** "Retire admin à @User".

### Test 8.4 - Info
**Action :** "Infos du groupe".

## 9. Commandes Legacy (.task)
### Test 9.1 - Ban
**Action :** `.task ban @User`.
### Test 9.2 - Mute
**Action :** `.task mute @User 10`.
### Test 9.3 - Unmute
**Action :** `.task unmute @User`.
### Test 9.4 - Tagall
**Action :** `.task tagall Message`.

---

# 🎨 Formatage & UX

## 10. Formatage WhatsApp
### Test 10.1 - Gras
**Action :** Générer texte riche.
**Vérifier :** `**` devient `*` proprement.

### Test 10.2 - Titres
**Action :** Demander un plan.
**Vérifier :** `# Titre` devient `*TITRE*`.

### Test 10.3 - Liens
**Action :** Demander un lien.
**Vérifier :** Format `Texte (URL)`.

## 11. Démarrage & UX
### Test 11.1 - ASCII Art
**Vérifier :** Logo couleur + Nom bot.

### Test 11.2 - Progress Bar
**Vérifier :** Animation fluide.

### Test 11.3 - Modules
**Vérifier :** Liste checklist verte.

## 12. Identité Dynamique
### Test 12.1 - Nom Profile
**Vérifier :** Nom correspond à `profile.json`.

### Test 12.2 - Détection Nom
**Action :** "Erina", "Nakiri", "Erina Nakiri" déclenchent le bot.

### Test 12.3 - Changement Nom
**Action :** Changer JSON -> Relancer -> Vérifier tout.

---

# 🧠 Intelligence & Social

## 13. Mentions Fuzzy
### Test 13.1 - Exacte
**Action :** "Mentionne @Pierre".

### Test 13.2 - Approximative
**Action :** "Dis bonjour à Seb".

### Test 13.3 - Introuvable
**Action :** Nom bidon -> Pas de crash.

## 14. Vélocité
### Test 14.1 - Calme
**Vérifier :** Réponse simple.
### Test 14.2 - Actif
**Vérifier :** Citation.
### Test 14.3 - Chaos
**Vérifier :** Citation + Mention.

## 15. Conversation Contextuelle
### Test 15.1 - Suivi
**Action :** Parler sans mentionner nom < 2min.
### Test 15.2 - Interruption
**Action :** Tiers parle -> Bot arrête de suivre A.

## 16. Interactions Humaines
### Test 16.1 - Présence
**Vérifier :** "En ligne".
### Test 16.2 - Réactions
**Action :** "Like ce message".
### Test 16.3 - Jugement
**Action :** Dire une bêtise -> Réaction 🤦‍♂️.

## 17. Fonctions Natives
### Test 17.1 - Sondage
**Action :** "Lance un sondage Pizza vs Sushi".
### Test 17.2 - Contact
**Action :** "Envoie contact de X".

## 18. Agent Autonome
### Test 18.1 - Multi-step
**Action :** Question complexe (ex: "Age de X + Age de Y").
**Vérifier :** Plusieurs boucles de pensée, réponse finale agrégée.

## 19. Smart Router
### Test 19.1 - Code
**Action :** "Fonction Python..." -> Modèle Code.
### Test 19.2 - Créatif
**Action :** "Poème..." -> Modèle Generalist.

## 20. Recherche Web
### Test 20.1 - Actu
**Action :** "Dernières nouvelles foot".

---

# 🛠️ Maintenance & Outils

## 21. RAG (Terminal CLI)
### Test 21.1 - Status
**Cmd :** `doc status`.
### Test 21.2 - Ingest
**Cmd :** `doc ingest`.
### Test 21.3 - Clear
**Cmd :** `doc clear`.

## 22. Graceful Degradation
### Test 22.1 - Crash Outil
Simuler erreur -> Bot explique problème sans crasher.

## 23. Commandes Dev
### Test 23.1 - Dev Contact
Cmd : `.devcontact`.
### Test 23.2 - Shutdown
Cmd : `.shutdown`.

---

# 📊 Tableau de Bord (Résumé)

| # | Fonctionnalité | Status |
|---|----------------|--------|
| **1. Voice System** | | |
| 1.1 | TTS Fallback (Minimax -> Gemini -> GTTS) | ⬜ |
| 1.2 | Format vocal WhatsApp (PTT) | ⬜ |
| **2. Transcription** | | |
| 2.1 | .voice status | ⬜ |
| 2.2 | Mode Restricted (Reply only) | ⬜ |
| 2.3 | Mode Full (Détection nom "Erina") | ⬜ |
| **3. Permissions Audio** | | |
| 3.1 | .audio.status | ⬜ |
| 3.2 | .mute.audio_for_none | ⬜ |
| 3.3 | .mute.audio_for_all | ⬜ |
| 3.4 | .allow.audio_for_all | ⬜ |
| **4. Plugin TTS** | | |
| 4.1 | Outil text_to_speech explicite | ⬜ |
| **5. Robustesse Audio** | | |
| 5.1 | Fallback texte si TTS échoue | ⬜ |
| **6. Anti-Delete** | | |
| 6.1 | .antidelete status | ⬜ |
| 6.2 | .antidelete on | ⬜ |
| 6.3 | Détection et repost message supprimé | ⬜ |
| 6.4 | .deleted (Historique) | ⬜ |
| 6.5 | .antidelete off | ⬜ |
| 6.6 | Contrôle via IA | ⬜ |
| **7. Ghost Tagging** | | |
| 7.1 | Tagall Admin (Succès) | ⬜ |
| 7.2 | Tagall User (Échec/Punition) | ⬜ |
| 7.3 | Tagall via IA | ⬜ |
| **8. Group Commandes (IA)** | | |
| 8.1 | Unmute via IA | ⬜ |
| 8.2 | Promote via IA | ⬜ |
| 8.3 | Demote via IA | ⬜ |
| 8.4 | Group Info via IA | ⬜ |
| **9. Commandes Legacy** | | |
| 9.1 | .task ban | ⬜ |
| 9.2 | .task mute | ⬜ |
| 9.3 | .task unmute | ⬜ |
| 9.4 | .task tagall | ⬜ |
| **10. Formatage WhatsApp** | | |
| 10.1| Conversion gras (** -> *) | ⬜ |
| 10.2| Conversion titres (# -> *MAJ*) | ⬜ |
| 10.3| Conversion liens [Txt](Url) | ⬜ |
| **11. Démarrage & UX** | | |
| 11.1| Logo ASCII HIVE-MIND | ⬜ |
| 11.2| Progress Bar | ⬜ |
| 11.3| Statut Modules | ⬜ |
| **12. Identité Dynamique** | | |
| 12.1| Nom dans ASCII | ⬜ |
| 12.2| Détection textuelle (Erina/Nakiri) | ⬜ |
| 12.3| Changement dynamique de nom | ⬜ |
| **13. Mentions Fuzzy** | | |
| 13.1| Mention exacte (@Pierre) | ⬜ |
| 13.2| Mention diminutif (@Seb) | ⬜ |
| 13.3| Mention introuvable | ⬜ |
| **14. Vélocité** | | |
| 14.1| Mode Calme (Texte) | ⬜ |
| 14.2| Mode Actif (Citation) | ⬜ |
| 14.3| Mode Chaos (Citation + Mention) | ⬜ |
| **15. Conversation Context.** | | |
| 15.1| Suivi conversation | ⬜ |
| 15.2| Interruption par tiers | ⬜ |
| **16. Interactions Humaines** | | |
| 16.1| Présence "En ligne" | ⬜ |
| 16.2| Réactions explicites | ⬜ |
| 16.3| Réaction jugement (IA) | ⬜ |
| **17. Fonctions Natives** | | |
| 17.1| Sondages (Polls) | ⬜ |
| 17.2| Envoi Contact (VCard) | ⬜ |
| **18. Agent Autonome** | | |
| 18.1| Raisonnement Multi-step | ⬜ |
| **19. Smart Router** | | |
| 19.1| Classif. Code | ⬜ |
| 19.2| Classif. Creative | ⬜ |
| **20. Recherche Web** | | |
| 20.1| Actu / Météo | ⬜ |
| **21. RAG (Terminal CLI)** | | |
| 21.1| doc status | ⬜ |
| 21.2| doc ingest | ⬜ |
| 21.3| doc clear | ⬜ |
| **22. Graceful Degradation** | | |
| 22.1| Crash Outil -> Message Erreur | ⬜ |
| **23. Commandes Dev** | | |
| 23.1| .devcontact | ⬜ |
| 23.2| .shutdown | ⬜ |
