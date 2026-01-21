# 🔧 Corrections du Système Vocal - 21 Janvier 2026

> **Session de débogage intensive** sur le système de transcription vocale et les commandes textuelles.

---

## 📋 Problèmes Signalés

1. **Commande `.mute.audio_for_none` ne fonctionne pas**
   - Log : `[TextMatcher] ✓ Pattern trouvé: undefined (plugin: admin)`
   
2. **Vocaux transcrits mais non traités par l'IA**
   - Log : `[DEBUG] ✗ Bot NON mentionné` même en reply au bot
   
3. **Modes restricted/full ne doivent pas s'appliquer en PV**

4. **Commandes status ne renvoient rien**

5. **Erreur "plugin admin_pv_audio non trouvé"**

---

## 🔍 Analyse & Corrections

### 1. Bug TextMatcher : `undefined` au lieu du nom de commande

**Fichier** : `plugins/loader.js`

**Diagnostic** :
```javascript
// Le code cherchait "handler" mais les plugins utilisent "name"
console.log(`Pattern trouvé: ${matcher.handler}`); // ❌ handler = undefined
return { name: matcher.handler, args };
```

**Cause** : Dans `plugins/admin/index.js`, les textMatchers utilisent la propriété `name`, mais `loader.js` cherchait `matcher.handler`.

**Solution** : Supporter les deux formats pour la compatibilité.
```javascript
const handlerName = matcher.name || matcher.handler;
console.log(`Pattern trouvé: ${handlerName}`);
return { name: handlerName, args };
```

---

### 2. Bug Quoted Reply : Vocaux non détectés comme reply au bot

**Fichier** : `core/transport/baileys.js`

**Diagnostic** : Le `contextInfo` n'était extrait que pour les messages texte, images et vidéos, pas pour les **audios**.

```javascript
// AVANT (ligne 485-488)
const contextInfo = msg.message?.extendedTextMessage?.contextInfo
    || msg.message?.imageMessage?.contextInfo
    || msg.message?.videoMessage?.contextInfo
    || null;  // ❌ Manque audioMessage!
```

**Cause** : Sans `audioMessage.contextInfo`, le `quotedMsg` était toujours `null` pour les vocaux.

**Solution** :
```javascript
const contextInfo = msg.message?.extendedTextMessage?.contextInfo
    || msg.message?.imageMessage?.contextInfo
    || msg.message?.videoMessage?.contextInfo
    || msg.message?.audioMessage?.contextInfo  // ✅ Ajouté
    || null;
```

---

### 3. Refactoring : Logique PV vs Groupe pour les vocaux

**Fichier** : `core/transport/baileys.js`

**Besoin** :
- En **PV** : Transcription directe, pas de modes `restricted`/`full`
- En **Groupe** : Logique complète avec modes et permissions

**Architecture implémentée** :
```javascript
if (isAudio && transcriptionService) {
    if (!isGroup) {
        // ========== PV ==========
        // Vérifier si globalement désactivé par Global Admin
        const pvAudioDisabled = await workingMemory.isPvAudioDisabled();
        if (!pvAudioDisabled) {
            // Transcription directe
        }
    } else {
        // ========== GROUPE ==========
        // Logique complète : modes + permissions
    }
}
```

**Nouvelles fonctions Redis** (`services/workingMemory.js`) :
- `isPvAudioDisabled()` : Vérifie le flag global
- `setPvAudioDisabled(bool)` : Modifie le flag (Global Admin)

---

### 4. Nouvelles commandes Global Admin pour les PV

**Fichier** : `plugins/admin/index.js`

**Commandes ajoutées** :
| Commande | Action |
|----------|--------|
| `.pv.audio.status` | Voir le statut (accessible à tous) |
| `.pv.audio.off` | Désactiver les vocaux PV (Global Admin) |
| `.pv.audio.on` | Réactiver les vocaux PV (Global Admin) |

**TextMatcher ajouté** :
```javascript
{
    pattern: /^\.pv\.audio\.(on|off|status)$/i,
    name: 'admin_pv_audio',
    extractArgs: (match) => ({ action: match[1].toLowerCase() })
}
```

**Handler ajouté** :
```javascript
case 'admin_pv_audio':
    return await this._setPvAudio(args.action, sender);
```

---

### 5. Bug : Commandes groupe bloquées en PV

**Fichier** : `plugins/admin/index.js`

**Modification** de `_setAudioPermission` :
```javascript
async _setAudioPermission(permission, groupJid, isGroup) {
    // VÉRIFICATION: Cette commande ne fonctionne qu'en groupe
    if (!isGroup) {
        return {
            success: false,
            message: `❌ Cette commande ne fonctionne qu'en **groupe**.\n\n` +
                `Pour gérer les vocaux en PV, utilisez:\n` +
                `• \`.pv.audio.status\` ...`
        };
    }
    // ... suite de la logique
}
```

---

### 6. Bug : Résultats des commandes non envoyés

**Fichier** : `core/index.js`

**Diagnostic** :
```javascript
// AVANT (ligne 458-464)
if (result && result.message) {
    // Ne faisait RIEN ! Juste un commentaire...
}
```

**Cause** : Le code détectait le résultat mais ne l'envoyait jamais.

**Solution** :
```javascript
if (result && result.message) {
    await this.transport.sendText(chatId, result.message);
}
```

---

### 7. Bug : TextMatchers non mappés dans toolToPlugin

**Fichier** : `plugins/loader.js`

**Diagnostic** : Quand `pluginLoader.execute('admin_pv_audio', ...)` était appelé, le loader cherchait dans `toolToPlugin` mais les textMatchers n'y étaient pas enregistrés.

```javascript
// Dans execute()
const pluginName = this.toolToPlugin.get(toolName) || toolName;
// toolToPlugin.get('admin_pv_audio') → undefined
// Fallback: plugins.get('admin_pv_audio') → undefined aussi !
```

**Solution** : Mapper les noms des textMatchers lors du chargement.
```javascript
for (const matcher of plugin.textMatchers) {
    this.textMatchers.push({ ...matcher, pluginName: plugin.name });
    
    // NOUVEAU: Mapper le handler vers le plugin
    const handlerName = matcher.name || matcher.handler;
    if (handlerName) {
        this.toolToPlugin.set(handlerName, plugin.name);
    }
}
```

---

## 🔍 Analyse & Corrections

### 9. Audio Natif (Gemini Live)

**Besoin** : Réduire la latence et préserver les émotions dans les échanges vocaux.

**Solution** : Implémentation hybride (Cascade par défaut, Natif en option).

**Architecture** :
- **Entrée** : OGG (WhatsApp) -> PCM 16kHz (Converter)
- **Traitement** : WebSocket bidirectionnel (Gemini Live API)
- **Capabilities** : Streaming Audio + Function Calling (Tools) + Interruptions
- **Sortie** : PCM -> OGG -> WhatsApp Voice Note

**Fichiers Créés/Modifiés** :
- `services/audio/geminiLiveProvider.js` : Client WebSocket
- `services/audio/audioConverter.js` : Wrapper ffmpeg
- `core/transport/baileys.js` : Bypass transcription si mode natif
- `core/index.js` : Pipeline natif (Audio -> Live -> Audio)

**Configuration** :
```json
"audio_strategy": {
    "prefer_native": false, // Activer ici
    "fallback_to_cascade": true,
    "native_voice": "Aoede"
}
```

### 8. Vision d'Images (Multimodal)

**Besoin** : Le bot doit pouvoir voir les images :
- Envoyées directement (avec ou sans texte)
- Dans les messages cités (quoted reply)

**Modifications** :

**Fichier** : `core/transport/baileys.js`
- **quotedMsg** enrichi avec `hasImage`, `hasVideo`, `mediaType`
- Nouvelle méthode `downloadQuotedMedia()` pour télécharger les images des quoted

**Fichier** : `core/index.js`
- Refactoring du bloc multimodal pour gérer plusieurs images
- Téléchargement des images directes ET quoted
- Contexte de quote enrichi (IMAGE / VIDÉO / texte)
- Nouvelle variable `isImageForBot` pour déclencher sur images sans texte

```javascript
// Exemple: Détection image pour le bot
const isImageForBot = hasImage && (isPrivate || mentionsBot || isReplyToBot);
```

---

## 📊 Fichiers Modifiés

| Fichier | Type de modification |
|---------|---------------------|
| `plugins/loader.js` | 2 corrections (handler + mapping) |
| `core/transport/baileys.js` | 2 corrections (contextInfo + PV logic) |
| `core/index.js` | 1 correction (sendText) |
| `plugins/admin/index.js` | 3 ajouts (commandes PV + vérification groupe) |
| `services/workingMemory.js` | 2 ajouts (isPvAudioDisabled, setPvAudioDisabled) |
| `docs/TESTS.md` | Mise à jour avec nouveaux tests |

---

## 🧪 Tests Recommandés

### Groupe
- [ ] `.voice status` → Affiche le mode
- [ ] `.voice restricted` → Change le mode
- [ ] `.audio.status` → Affiche les permissions
- [ ] `.mute.audio_for_none` → Bloque non-admins

### PV
- [ ] `.pv.audio.status` → Affiche le statut
- [ ] `.pv.audio.off` (Global Admin) → Désactive
- [ ] `.pv.audio.on` (Global Admin) → Réactive
- [ ] Vocal en PV → Transcrit directement

### Général
- [ ] Vocal en reply au bot → Transcrit
- [ ] Vocal avec nom du bot → Transcrit (mode full)

---

## 💡 Leçons Apprises

1. **Cohérence des conventions** : `name` vs `handler` - toujours vérifier les noms de propriétés entre modules.

2. **Mapping bidirectionnel** : Quand on ajoute un système (textMatchers), s'assurer qu'il est intégré à tous les lookups nécessaires (toolToPlugin).

3. **Extraction exhaustive** : Pour les messages WhatsApp, le `contextInfo` peut venir de plusieurs types de messages - penser à tous les cas (audio, image, video, text).

4. **Envoi explicite** : Ne pas supposer qu'un résultat sera automatiquement envoyé - toujours vérifier le flux complet jusqu'à l'utilisateur.

---

*Rédigé par Claude (Antigravity) - Session de debugging du 21 Janvier 2026*
