# MiniMax API Documentation

Complete documentation scraped from https://platform.minimax.io/docs/

---

## Table of Contents

1. [Quick Start Guide](#quick-start-guide)
2. [Models Overview](#models-overview)
3. [API Reference](#api-reference)
4. [Pricing](#pricing)
5. [Rate Limits](#rate-limits)
6. [FAQs](#faqs)
7. [Coding Plan](#coding-plan)
8. [Release Notes](#release-notes)
9. [Error Codes](#error-codes)

---

## Quick Start Guide

### Prerequisites

Before using the MiniMax API, you need to complete account registration and obtain an API Key.

1. **Register or Login**
   - Access MiniMax API Platform: https://platform.minimax.io/
   - Register or login to your account

2. **Create an API Key**
   - **Coding Plan**: Visit API Keys > Create Coding Plan Key (only supports MiniMax text models)
   - **Pay-as-you-go**: Visit API Keys > Create new secret key (supports all modality models)

3. **Recharge Account**
   - Access Billing/Balance page to top up if needed

### Integrate via SDK

Use the Anthropic SDK to quickly integrate with the MiniMax API and start calling the MiniMax-M2.1 model.

#### 1. Install Anthropic SDK

```bash
pip install anthropic
```

#### 2. Configure Environment Variables

```bash
export ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
export ANTHROPIC_API_KEY=${YOUR_API_KEY}
```

#### 3. Call API

```python
import anthropic

client = anthropic.Anthropic()
message = client.messages.create(
    model="MiniMax-M2.1",
    max_tokens=1000,
    system="You are a helpful assistant.",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Hi, how are you?"
                }
            ]
        }
    ]
)

for block in message.content:
    if block.type == "thinking":
        print(f"Thinking:\n{block.thinking}\n")
    elif block.type == "text":
        print(f"Text:\n{block.text}\n")
```

---

## Models Overview

### Text Models

#### MiniMax-M2.1
- **Parameters**: 230B total parameters with 10B activated per inference
- **Context Length**: 204,800 tokens
- **Features**:
  - Optimized for code generation and refactoring
  - Polyglot code mastery
  - Precision code refactoring
  - Enhanced reasoning
  - Output speed: approximately 60 tps

#### MiniMax-M2.1-lightning
- **Context Length**: 204,800 tokens
- **Features**:
  - Same performance as M2.1
  - Significantly faster inference (output speed: approximately 100 tps)
  - Polyglot code mastery
  - Precision code refactoring
  - Low latency

#### MiniMax-M2
- **Context Length**: 200k tokens
- **Maximum Output**: 128k tokens (including CoT)
- **Features**:
  - Agentic capabilities
  - Function calling
  - Advanced reasoning
  - Real-time streaming

### Audio Models

#### speech-2.6-hd
- **Features**: Ultimate Similarity, Ultra-High Quality
- **Languages**: 40 languages supported
- **Emotions**: 7 emotions supported

#### speech-2.6-turbo
- **Features**: Ultimate Value, Low latency
- **Languages**: 40 languages supported
- **Emotions**: 7 emotions supported

#### speech-02-hd
- **Features**: Stronger replication similarity, High quality voice generation
- **Languages**: 24 languages supported
- **Emotions**: 7 emotions supported

#### speech-02-turbo
- **Features**: Superior rhythm and stability, Low latency
- **Languages**: 24 languages supported
- **Emotions**: 7 emotions supported

### Video Models

#### MiniMax Hailuo 2.3
- **Type**: Text to Video & Image to Video
- **Features**: SOTA instruction following, Extreme physics mastery
- **Resolution & Duration**: 1080p 6s, 768p 6s, 10s
- **FPS**: 24 fps

#### MiniMax Hailuo 2.3Fast
- **Type**: Image to Video
- **Features**: Extreme physics mastery, Value and Efficiency
- **Resolution & Duration**: 1080p 6s, 768p 6s, 10s
- **FPS**: 24 fps

#### MiniMax Hailuo 02
- **Type**: Text to Video & Image to Video
- **Features**: SOTA instruction following, Extreme physics mastery
- **Resolution & Duration**: 1080p 6s, 768p 6s, 10s, 512p 6s, 10s
- **FPS**: 24 fps

### Music Models

#### Music-2.5
- **Type**: Text to Music
- **Features**:
  - Human-like Emotional Vocals
  - Enhanced Multi-Instrument Performance
  - Professional studio quality
  - Cohesive musical structure
  - Precision style control
  - Realistic, expressive vocals

#### Music-2.0
- **Type**: Text to Music
- **Features**:
  - Enhanced musicality
  - Natural vocals and smooth melodies
  - Human-like performance
  - Rich emotional expression
  - Enhanced tone control

---

## API Reference

### API Overview

MiniMax API capabilities include text, speech, video, image, music, and file management.

#### Get API Key

**Coding Plan**: Visit API Keys > Create Coding Plan Key to get your API Key (only supports MiniMax text models).

**Pay-as-you-go**: Visit API Keys > Create new secret key to get your API Key (supports all modality models).

#### Text Generation

The text generation API uses MiniMax M2.1, MiniMax M2.1 lightning, and MiniMax M2 to generate conversational content and trigger tool calls based on the provided context.

**Supported Models**:
- **MiniMax-M2.1**: 204,800 context window, powerful multi-language programming capabilities (output speed approximately 60 tps)
- **MiniMax-M2.1-lightning**: 204,800 context window, faster and more agile (output speed approximately 100 tps)
- **MiniMax-M2**: 204,800 context window, agentic capabilities, advanced reasoning

**Access Methods**:
- HTTP requests
- Anthropic SDK (Recommended)
- OpenAI SDK

#### Text to Speech (T2A)

**Supported Models**:
- speech-2.6-hd
- speech-2.6-turbo
- speech-02-hd
- speech-02-turbo
- speech-01-hd
- speech-01-turbo

**Available Interfaces**:
- HTTP T2A API
- WebSocket T2A API

**Supported Languages**: 40 languages worldwide including Chinese, English, Spanish, French, German, Japanese, Korean, and more.

#### Asynchronous Long-Text Speech Generation (T2A Async)

Supports asynchronous text-to-speech generation up to 1 million characters per request.

**Features**:
- Choose from 100+ system voices and cloned voices
- Customize pitch, speed, volume, bitrate, sample rate, and output format
- Retrieve audio metadata (duration, file size)
- Retrieve precise sentence-level timestamps (subtitles)
- Input text directly or via file_id

**Note**: The returned audio URL is valid for 9 hours (32,400 seconds).

**Use Case**: Converting entire books or other long texts into audio.

#### Voice Cloning

The API supports cloning from mono or stereo audio and can rapidly reproduce speech that matches the timbre of a provided reference file.

**Supported Models**: speech-2.6-hd, speech-2.6-turbo, speech-02-hd, speech-02-turbo

**Notes**:
- Using this API to clone a voice does not immediately incur a cloning fee
- The fee is charged the first time you synthesize speech with the cloned voice
- Voices produced are temporary
- To keep a cloned voice permanently, use it in any T2A speech synthesis API within 168 hours (7 days)

#### Voice Design

This API supports generating personalized custom voices based on user-provided voice description prompts.

**Notes**:
- Recommended to use speech-02-hd for best results
- Using this API to generate a voice does not immediately incur a fee
- The generation fee will be charged upon first use in speech synthesis
- Generated voices are temporary
- To keep a voice permanently, use it in any speech synthesis API within 168 hours (7 days)

#### Video Generation

This API supports generating videos based on user-provided text, images (including first frame, last frame, or reference images).

**Supported Models**:
- **MiniMax-Hailuo-2.3**: New video generation model with breakthroughs in body movement, facial expressions, physical realism, and prompt adherence
- **MiniMax-Hailuo-2.3-Fast**: New Image-to-video model for value and efficiency
- **MiniMax-Hailuo-02**: Supports higher resolution (1080P), longer duration (10s), and stronger adherence to prompts

**API Usage**:
Video generation is asynchronous and consists of three APIs:
1. Create Video Generation Task (Text to Video, Image to Video, Start/End to Video, Subject Reference to Video)
2. Query Video Generation Task Status
3. Download the Video File

#### Video Generation Agent

This API supports video generation tasks based on user-selected video agent templates and inputs.

**Video Agent Templates**:
- **Diving** (ID: 392747428568649728): Upload a picture to generate a video of the subject completing a perfect dive
- **Run for Life** (ID: 393769180141805569): Upload a photo of your pet and enter a type of wild beast to generate a survival video
- **Transformers** (ID: 397087679467597833): Upload a photo of a car to generate a transforming car mecha video
- **Still rings routine** (ID: 393881433990066176): Upload your photo to generate a video performing a perfect still rings routine
- **Weightlifting** (ID: 393498001241890824): Upload a photo of your pet to generate a video performing weightlifting
- **Climbing** (ID: 393488336655310850): Upload a picture to generate a video of sport climbing

#### Image Generation

This API supports image generation from text or references, allowing custom aspect ratios and resolutions.

**Model**: image-01

#### Music Generation

This API supports generating music from text prompts and lyrics.

**Supported Models**:
- **Music-2.5** (recommended)
- **Music-2.0**

**Features**:
- Text to Music
- Human-like Emotional Vocals
- Enhanced Multi-Instrument Performance
- Professional studio quality

#### File Management

**Supported File Formats**:
- **Document**: pdf, docx, txt, jsonl
- **Audio**: mp3, m4a, wav

**Capacity and Limits**:
- Total Capacity: 100GB
- Single Document Size: 512MB

**APIs**:
- Upload files
- List files
- Retrieve file information
- Retrieve file content
- Delete files

#### Official MCP

MiniMax provides official Model Context Protocol (MCP) server implementations:
- Python version: https://github.com/MiniMax-AI/MiniMax-MCP
- JavaScript version: https://github.com/MiniMax-AI/MiniMax-MCP-JS

Both support speech synthesis, voice cloning, video generation, and music generation.

### Compatible Anthropic API (Recommended)

Call MiniMax models using the Anthropic SDK.

**Quick Start**:

1. Install Anthropic SDK:
```bash
pip install anthropic
```

2. Configure Environment Variables:
```bash
export ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
export ANTHROPIC_API_KEY=${YOUR_API_KEY}
```

3. Call API:
```python
import anthropic

client = anthropic.Anthropic()
message = client.messages.create(
    model="MiniMax-M2.1",
    max_tokens=1000,
    system="You are a helpful assistant.",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Hi, how are you?"
                }
            ]
        }
    ]
)
```

**Supported Parameters**:
- `model`: Fully supported (MiniMax-M2.1, MiniMax-M2.1-lightning, MiniMax-M2)
- `messages`: Partial support (text and tool calls, no image/document input)
- `max_tokens`: Fully supported
- `stream`: Fully supported
- `system`: Fully supported
- `temperature`: Fully supported (Range: 0.0-1.0, recommended: 1)
- `tool_choice`: Fully supported
- `tools`: Fully supported
- `top_p`: Fully supported
- `metadata`: Fully Supported
- `thinking`: Fully Supported

**Ignored Parameters**: top_k, stop_sequences, service_tier, mcp_servers, context_management, container

**Messages Field Support**:
- `type="text"`: Fully supported
- `type="tool_use"`: Fully supported
- `type="tool_result"`: Fully supported
- `type="thinking"`: Fully supported
- `type="image"`: Not supported
- `type="document"`: Not supported

**Important Notes**:
- Only supports MiniMax-M2.1 and MiniMax-M2 models
- Temperature parameter range is (0.0, 1.0]
- Image and document inputs not currently supported

### Compatible OpenAI API

Call MiniMax models using the OpenAI SDK.

**Quick Start**:

1. Install OpenAI SDK:
```bash
pip install openai
```

2. Configure Environment Variables:
```bash
export OPENAI_BASE_URL=https://api.minimax.io/v1
export OPENAI_API_KEY=${YOUR_API_KEY}
```

3. Call API:
```python
from openai import OpenAI

client = OpenAI()
response = client.chat.completions.create(
    model="MiniMax-M2.1",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hi, how are you?"},
    ],
    extra_body={"reasoning_split": True},
)
```

**Important Notes**:
- Temperature parameter range is (0.0, 1.0], recommended value: 1.0
- Some OpenAI parameters are ignored (presence_penalty, frequency_penalty, logit_bias, etc.)
- Image and audio inputs not currently supported
- The `n` parameter only supports value 1
- Use `tools` parameter instead of deprecated `function_call`

### Text to Speech (T2A) HTTP API

**Endpoint**: POST /v1/t2a_v2

**Alternative Endpoint** (Reduced Time to First Audio): https://api-uw.minimax.io/v1/t2a_v2

**Authorization**: Bearer API_key

**Request Body**:
```json
{
  "model": "speech-2.6-hd",
  "text": "Text to convert to speech",
  "stream": false,
  "voice_setting": {
    "voice_id": "English_expressive_narrator",
    "speed": 1,
    "vol": 1,
    "pitch": 0
  },
  "audio_setting": {
    "sample_rate": 32000,
    "bitrate": 128000,
    "format": "mp3",
    "channel": 1
  },
  "pronunciation_dict": {
    "tone": [
      "Omg/Oh my god"
    ]
  },
  "language_boost": "auto",
  "voice_modify": {
    "pitch": 0,
    "intensity": 0,
    "timbre": 0,
    "sound_effects": "spacious_echo"
  },
  "output_format": "hex"
}
```

**Parameters**:
- `model`: Required. Options: speech-2.6-hd, speech-2.6-turbo, speech-02-hd, speech-02-turbo, speech-01-hd, speech-01-turbo
- `text`: Required. Text to convert to speech (max 10,000 characters)
- `stream`: Boolean, default false
- `voice_setting`: Voice configuration (voice_id, speed, vol, pitch)
- `audio_setting`: Audio configuration (sample_rate, bitrate, format, channel)
- `pronunciation_dict`: Custom pronunciation dictionary
- `language_boost`: Language boost setting (auto or specific language)
- `voice_modify`: Voice effects configuration
- `output_format`: hex or url (hex for streaming)

**Response**:
```json
{
  "data": {
    "audio": "<hex encoded audio>",
    "status": 2
  },
  "extra_info": {
    "audio_length": 11124,
    "audio_sample_rate": 32000,
    "audio_size": 179926,
    "bitrate": 128000,
    "word_count": 163,
    "invisible_character_ratio": 0,
    "usage_characters": 163,
    "audio_format": "mp3",
    "audio_channel": 1
  },
  "trace_id": "01b8bf9bb7433cc75c18eee6cfa8fe21",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

### Music Generation API

**Endpoint**: POST /v1/music_generation

**Request Body**:
```json
{
  "model": "music-2.5",
  "prompt": "Indie folk, melancholic, introspective, longing, solitary walk, coffee shop",
  "lyrics": "[verse]\nStreetlights flicker, the night breeze sighs\nShadows stretch as I walk alone\nAn old coat wraps my silent sorrow\nWandering, longing, where should I go\n[chorus]\nPushing the wooden door, the aroma spreads\nIn a familiar corner, a stranger gazes",
  "audio_setting": {
    "sample_rate": 44100,
    "bitrate": 256000,
    "format": "mp3"
  }
}
```

**Parameters**:
- `model`: Required. Options: music-2.5 (recommended), music-2.0
- `lyrics`: Required. Song lyrics (1-3500 characters for music-2.5, 10-3500 for others)
- `prompt`: Music description specifying style, mood, and scenario
- `stream`: Boolean, default false
- `output_format`: hex or url
- `audio_setting`: Audio output configuration

---

## Pricing

### Coding Plan

#### Monthly Plans

| Plan | Price | Prompts | Features |
|------|-------|---------|----------|
| Starter | $10/month | 100 prompts / 5 hours | Powered by MiniMax M2.1, for entry-level developers |
| Plus | $20/month | 300 prompts / 5 hours | Powered by MiniMax M2.1, 3x Starter plan usage |
| Max | $50/month | 1000 prompts / 5 hours | Powered by MiniMax M2.1, 10x Starter plan usage |

#### Yearly Plans

| Plan | Price | Prompts | Features |
|------|-------|---------|----------|
| Starter | $100/year | 100 prompts / 5 hours | Powered by MiniMax M2.1, for entry-level developers |
| Plus | $200/year | 300 prompts / 5 hours | Powered by MiniMax M2.1, 3x Starter plan usage |
| Max | $500/year | 1000 prompts / 5 hours | Powered by MiniMax M2.1, 10x Starter plan usage |

### Audio Subscription

| Category | Monthly | 3-Month (10% off) | Yearly (20% off) | Credits/Month |
|----------|---------|-------------------|------------------|---------------|
| Starter | $5 | $13.5 | $48 | 100,000 |
| Standard | $30 | $81 | $288 | 300,000 |
| Pro | $99 | $267 | $950 | 1,100,000 |
| Scale | $249 | $672 | $2,390 | 3,300,000 |
| Business | $999 | $2,697 | $9,590 | 20,000,000 |

### Video Packages

| Model | Resolution | Duration | Price |
|-------|------------|----------|-------|
| MiniMax-Hailuo-2.3-Fast | 768P | 6s | $0.19 |
| MiniMax-Hailuo-2.3-Fast | 768P | 10s | $0.32 |
| MiniMax-Hailuo-2.3-Fast | 1080P | 6s | $0.33 |
| MiniMax-Hailuo-2.3/02 | 768P | 6s | $0.28 |
| MiniMax-Hailuo-2.3/02 | 768P | 10s | $0.56 |
| MiniMax-Hailuo-2.3/02 | 1080P | 6s | $0.49 |
| MiniMax-Hailuo-02 | 512P | 6s | $0.10 |
| MiniMax-Hailuo-02 | 512P | 10s | $0.15 |

### Pay as You Go

#### Text Models

| Model | Input | Output | Prompt caching Read | Prompt caching Write |
|-------|-------|--------|-------------------|---------------------|
| MiniMax-M2.1 | $0.3/M tokens | $1.2/M tokens | $0.03/M tokens | $0.375/M tokens |
| MiniMax-M2.1-lightning | $0.3/M tokens | $2.4/M tokens | $0.03/M tokens | $0.375/M tokens |
| MiniMax-M2 | $0.3/M tokens | $1.2/M tokens | $0.03/M tokens | $0.375/M tokens |

#### Audio Models

| API | Model | Price |
|-----|-------|-------|
| T2A | speech-2.6-turbo, speech-02-turbo | $60/M characters |
| T2A | speech-2.6-hd, speech-02-hd | $100/M characters |
| Rapid Voice Cloning | speech-02-hd/turbo | $3 per voice |
| Voice Design | Voice Design | $3 per voice |

#### Music Models

| Model | Price |
|-------|-------|
| Music-2.5 | $0.03/up-to-5 minutes music |
| Music-2.0 | $0.03/up-to-5 minutes music |

#### Image Models

| Model | Price |
|-------|-------|
| image-01 | $0.0035 per image |

---

## Rate Limits

Rate limits are restrictions on the number of times a user can access services within a specified period.

### Text

| API | Model | RPM | TPM |
|-----|-------|-----|-----|
| Text API | MiniMax-M2.1, MiniMax-M2.1-lightning | 500 | 20,000,000 |
| Text API | MiniMax-M2 | 500 | 20,000,000 |

### Speech

| API | Model | RPM | TPM |
|-----|-------|-----|-----|
| T2A | speech-2.6-turbo/hd, speech-02-turbo/hd | 60 | 20,000 |
| Voice Cloning | — | 60 | — |
| Voice Design | — | 20 | — |

### Video

| API | Model | RPM |
|-----|-------|-----|
| Video Generation | 2.3 Series, 02 Series | 5 |

### Image

| API | Model | RPM | TPM |
|-----|-------|-----|-----|
| Image Generation | image-01 | 10 | 60 |

### Music

| API | Model | RPM | CONN |
|-----|-------|-----|------|
| Music Generation | Music-2.5, Music-2.0 | 120 | 20 |

**Rate Limit Types**:
- **RPM (Requests Per Minute)**: Maximum requests per minute
- **TPM (Tokens Per Minute)**: Maximum tokens processed per minute
- **CONN (Connections)**: Maximum concurrent connections

---

## FAQs

### About APIs

#### Q: Obtaining Your API Key
**A**: Go to Account > Settings > API Keys to create and manage your API keys. Do not share your API key with others or expose it in client-side code.

#### Q: Is the validity period of voice_id only 7 days?
**A**: The system-generated voice_id is initially inactive. If not activated in time, it will expire 7 days after generation. To ensure long-term validity, synthesize audio within 7 days via the T2A v2 or T2A Large interface.

#### Q: What languages does voice cloning support?
**A**: 
- For the original voice to be cloned: Any language can be used
- For the synthesized voice: 40 languages supported
- It's best for the original voice and target synthesis language to be the same

#### Q: How to query/delete voice_id and get public voices?
**A**: Use Delete Voice API to delete voice_ids and Get Voice API to query all available voice_ids under your account.

#### Q: What is the purpose of the data.status field in T2A v2 interface?
**A**: 
- Status 1: Streaming generation process is in progress
- Status 2: Synthesis has completed

### About Account

#### Q: How to fund your account?
**A**: Two ways: Online Payment and Bank Transfer. Find both options in Account > Billing > Balance.

#### Q: Balance alert?
**A**: Enable balance alert by setting a threshold in Account > Billing > Balance. You'll receive email notifications when balance falls below the threshold.

#### Q: Autobilling?
**A**: Enable Autobilling under Account > Billing > Balance. Configure a threshold and payment method for automatic top-ups.

---

## Coding Plan

The Coding Plan is a subscription package designed for AI-powered coding.

### Core Advantages

- **Powered by Latest MiniMax M2.1 Series Models**: All packages equipped with MiniMax M2.1 model
- **Extremely Cost-Effective**: Fixed subscription fee grants substantial number of prompts
- **1/10th the Price**: Just 1/10th the price of corresponding plans from providers like Claude

### Getting Started

1. **Subscribe**: Visit the Coding Plan Subscription page and choose your plan (Starter, Plus, Max)
2. **Get API Key**: Access Account/Subscription to get your Coding Plan API Key

### Subscription Plans

| Plan | Monthly | Yearly | Prompts/5 hours | Features |
|------|---------|--------|-----------------|----------|
| Starter | $10 | $100 | 100 | Entry-level developers |
| Plus | $20 | $200 | 300 | Professional developers |
| Max | $50 | $500 | 1000 | Power developers |

### Using in AI Coding Tools

After obtaining your API Key, configure it in your preferred AI coding tool:

Supported tools:
- Claude Code
- Cursor
- TRAE
- OpenCode
- Kilo Code
- Cline
- Roo Code
- Grok CLI
- Codex CLI
- Droid

### Reach the Usage Limit

When you reach the prompt limit within a 5-hour cycle:
1. **Switch to Pay-As-You-Go**: Replace the API Key with your standard API key
2. **Wait for Reset**: Quota automatically restores as the 5-hour window moves forward

---

## Release Notes

### Recent Model Releases

#### Jan. 16, 2026 - Music-2.5
- Released Music 2.5: "Direct the Detail. Define the Real."

#### Dec. 22, 2025 - MiniMax-M2.1
- Released MiniMax-M2.1
- Polyglot Programming Mastery, Precision Code Refactoring

#### Oct. 29, 2025 - Music-2.0
- Released Music 2.0
- Enhanced musical expression that makes every melody deeply emotional

#### Oct. 29, 2025 - Speech-2.6
- Released Speech 2.6
- More human and instantly responsive voice for your agent

#### Oct. 28, 2025 - MiniMax-Hailuo-2.3 & 2.3-Fast
- Released MiniMax-Hailuo-2.3 & 2.3-Fast
- Breakthroughs in body movement, facial expressions, physical realism, and prompt adherence

#### Oct. 27, 2025 - MiniMax-M2
- Released MiniMax-M2
- An Efficient Model for the Agentic Era
- Free API calls offer ended November 7, 2025

#### Sept. 11, 2025 - Music-1.5
- New music model released
- Supports 4-minute songs, getting back to the core of great sound

#### Aug. 6, 2025 - Speech-2.5
- Released next-generation speech synthesis model
- Broader language coverage and exceptionally high voice similarity

#### Jun. 20, 2025 - Music-1.5 (Beta)
- Released Music-1.5 (Beta)
- Next-generation music generation model supporting musical prompts and lyrics

#### Jun. 18, 2025 - MiniMax-Hailuo-02
- Released MiniMax Hailuo 02
- Next-generation video generation model with 1080p resolution and up to 10 seconds

#### Apr. 2, 2025 - Speech-02-turbo / Speech-02-hd
- Released the Speech-02 model series
- Hyper-realistic vocal performance with exceptional prosody and stability

#### Feb. 15, 2025 - Image-01
- Released the Image-01 model
- Supports text-to-image generation in multiple sizes

---

## Error Codes

| Error Code | Message | Solution |
|------------|---------|----------|
| 1000 | unknown error | Please retry your requests later |
| 1001 | request timeout | Please retry your requests later |
| 1002 | rate limit | Please retry your requests later |
| 1004 | not authorized / token not match | Check your API key |
| 1008 | insufficient balance | Check your account balance |
| 1024 | internal error | Please retry your requests later |
| 1026 | input new_sensitive | Please change your input content |
| 1027 | output new_sensitive | Please change your input content |
| 1033 | system error / mysql failed | Please retry your requests later |
| 1039 | token limit | Please retry your requests later |
| 1041 | conn limit | Please contact us if the issue persists |
| 1042 | invisible character ratio limit | Check input for invisible/illegal characters |
| 1043 | asr similarity check failed | Check file_id and text_validation |
| 1044 | clone prompt similarity check failed | Check clone prompt audio and prompt words |
| 2013 | invalid params | Check the request parameters |
| 20132 | invalid samples or voice_id | Check file_id, voice_id |
| 2037 | voice duration too short/long | Adjust the duration of your file |
| 2039 | voice clone voice id duplicate | Check voice_id for duplication |
| 2042 | You don't have access to this voice_id | Check if you're the creator |
| 2045 | rate growth limit | Avoid sudden request increases |
| 2048 | prompt audio too long | Keep prompt audio < 8s |
| 2049 | invalid api key | Check your API key |
| 2056 | usage limit exceeded | Wait for next 5-hour window |

---

**Documentation compiled from**: https://platform.minimax.io/docs/

**Last Updated**: January 17, 2026
