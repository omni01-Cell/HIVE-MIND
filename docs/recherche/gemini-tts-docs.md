# Gemini 3.1 Flash TTS Preview Documentation

Le modèle `gemini-3.1-flash-tts-preview` est un modèle text-to-speech spécialisé (sorti en avril 2026) offrant un haut niveau de contrôle sur la génération vocale.

## 1. Paramètres et Configuration de Base
Pour utiliser le modèle via l'API Gemini, il faut configurer `response_modalities` sur `AUDIO` et fournir une `speech_config`.

*   **Model ID:** `gemini-3.1-flash-tts-preview`
*   **Input Limit:** 8,192 tokens (texte).
*   **Output Limit:** 16,384 tokens (audio).
*   **Format Audio:** PCM audio à 24 kHz / 16-bit mono.
*   **Watermarking:** Tous les audios sont filigranés avec SynthID.

## 2. Mécanismes de Contrôle ("Director's Chair")
Il y a deux façons principales de contrôler la voix :

### A. Instructions de Haut Niveau (Notes du Réalisateur)
Vous pouvez donner des instructions en langage naturel pour définir le ton, l'accent et la voix.
*   **Style/Tone:** Exemple : "Deliver this warmly and slowly", "Professional narrator's tone", "Casual, conversational vibe".
*   **Accent:** Exemples : "British accent", "Southern US accent" (supporte +70 langues).

### B. Tags Audio Inline (Balises intégrées au texte)
Il est possible d'insérer des balises entre crochets `[tag]` directement dans le texte pour modifier la voix au milieu d'une phrase (plus de 200 tags disponibles).
*   **Émotions:** `[happy]`, `[excited]`, `[sad]`, `[angry]`, `[whispers]`, `[laughs]`, `[determination]`, `[awe]`, `[nervousness]`.
*   **Pacing (Rythme):** `[slow]`, `[fast]`.
*   **Pauses:** `[short pause]`, `[long pause]`.
*   **Non-verbal:** `[sigh]`, `[laughs]`.

⚠️ **Règle importante:** Les tags doivent être séparés par du texte ou de la ponctuation ; deux tags ne peuvent pas se suivre directement (ex: `[slow][whispers]` est invalide).

## 3. Voix et Langues
*   **Voix pré-définies:** 30 voix de base (ex: "Callirrhoe").
*   **Langues:** Support de plus de 70 langues et dialectes (Français, Hindi, Japonais, Allemand, etc.).
*   **Multi-Speaker:** Supporte jusqu'à deux locuteurs distincts dans la même génération audio (identifiables via les tags inline).

## 4. Exemple d'Implémentation (Node.js/REST)
Il faudra utiliser le SDK Google Gen AI (`@google/genai` ou `@google/generative-ai`) ou faire un appel REST avec ce payload :
```json
{
  "contents": [{
    "role": "user",
    "parts": [{"text": "[laughs] I did NOT expect that. [short pause] Can you believe it?"}]
  }],
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": {
      "voiceConfig": {
        "prebuiltVoiceConfig": {
          "voiceName": "Callirrhoe"
        }
      }
    }
  }
}
```

## 5. Limitations
*   Pas de streaming temps réel.
*   Pas de Tool Calling ou Caching sur ce modèle spécifique.
*   "Output Drift" possible sur de très longs clips.
