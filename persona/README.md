# 🎭 Persona Configuration

Ce dossier contient la configuration de la personnalité du bot.

## 📁 Structure

```
persona/
├── profile.json      # Configuration principale
├── prompts/
│   ├── system.md     # Prompt système
│   └── refusal.md    # Template de refus
└── README.md         # Ce fichier
```

## ⚙️ Configuration du `profile.json`

### Champs obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | **Nom du bot (MAX 2 mots).** Ex: "Erina Nakiri", "Luna", "Max AI" |
| `role` | string | Rôle/description courte |
| `traits` | string[] | Traits de personnalité |

### ⚠️ IMPORTANT : Le champ `name`

Le nom **doit contenir au maximum 2 mots** pour la détection vocale et textuelle.

**Exemples valides :**
- `"Erina Nakiri"` → Détection: Erina, Nakiri, Erina Nakiri
- `"Luna"` → Détection: Luna
- `"Max AI"` → Détection: Max, AI, Max AI

**Exemples invalides :**
- `"Super Bot Assistant Pro"` → ❌ Trop de mots (seuls les 2 premiers seront utilisés)

### Auto-génération des variantes

Le système génère automatiquement :

1. **Variantes textuelles** : Pour la détection de mention dans les messages WhatsApp
   - Exemple: `["Erina", "Nakiri", "Erina Nakiri", "erina", "nakiri"]`

2. **Variantes vocales** : Pour la détection dans les transcriptions audio (erreurs STT courantes)
   - Exemple: `["erina", "elina", "et rina", "erinah", ...]`

### Personnalisation avancée

Si vous avez besoin de variantes spécifiques supplémentaires, vous pouvez les ajouter manuellement dans `config/config.json` sous `voice_transcription.name_variants`.

## 🔧 Comment changer le nom du bot

1. Modifiez `name` dans `profile.json`
2. Relancez le bot
3. Le nom sera automatiquement mis à jour dans :
   - L'affichage ASCII au démarrage
   - La détection des mentions textuelles
   - La détection vocale (transcription)
   - Le prompt système
