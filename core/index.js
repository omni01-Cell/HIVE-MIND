// core/index.js
// Orchestrateur principal du bot - Cerveau central

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import dns from 'dns';
import { dirname, join } from 'path';

// FORCE IPv4 : Résout les problèmes de fetch failed vers Kimi/Cloudflare sous Node 17+
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { orchestrator } from './orchestrator.js';
import { eventBus, BotEvents } from './events.js';
import { baileysTransport } from './transport/baileys.js';
import { pluginLoader } from '../plugins/loader.js';
import { providerRouter } from '../providers/index.js';
import { scheduler } from '../scheduler/index.js';
import { db } from '../services/supabase.js';
import { factsMemory } from '../services/memory.js';
import { semanticMemory } from '../services/memory.js';
import { workingMemory } from '../services/workingMemory.js';
import { isStorable } from '../utils/helpers.js';
import { startupDisplay } from '../utils/startup.js';
import { botIdentity } from '../utils/botIdentity.js';
import { extractNumericId, jidMatch, formatForDisplay } from '../utils/jidHelper.js';
// DTC Phase 1: Nouveaux services unifiés
// DTC Phase 1: Nouveaux services unifiés importés uniquement pour l'enregistrement DI initial
// DTC Phase 1: Nouveaux services unifiés importés uniquement pour l'enregistrement DI initial
import { userService } from '../services/userService.js';
import { groupService } from '../services/groupService.js';
import { adminService } from '../services/adminService.js';
import { consciousness } from '../services/consciousnessService.js';
import { agentMemory } from '../services/agentMemory.js';
import { actionMemory } from '../services/memory/ActionMemory.js';
import { GeminiLiveProvider } from '../services/audio/geminiLiveProvider.js';
import { VoiceProvider } from '../services/voice/voiceProvider.js';
import { quotaManager } from '../services/quotaManager.js';

// Group Manager (filtrage hybride)
let filterProcessor = null;
try {
    const groupManager = await import('../plugins/group_manager/index.js');
    filterProcessor = groupManager.default.processor;
} catch (e) {
    console.warn('[Core] Group Manager non chargé:', e.message);
}

// DTC Refactor: Inclusion du ServiceContainer
import { container } from './ServiceContainer.js';
import { cli } from './cli.js'; // Interface Ligne de Commande

// Refactoring: Import des handlers modulaires
import { SchedulerHandler, GroupHandler } from './handlers/index.js';
import { buildContext } from './context/contextBuilder.js';

// DTC Phase 1: Les admins globaux sont maintenant dans Supabase via adminService
// Le chargement se fait de manière asynchrone dans init()

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger le persona
let persona;
try {
    persona = JSON.parse(
        readFileSync(join(__dirname, '..', 'persona', 'profile.json'), 'utf-8')
    );
} catch {
    persona = { name: 'Bot', traits: [], interests: [] };
}

// Charger le prompt système
let systemPrompt;
let refusalPrompt; // Nouveau
try {
    systemPrompt = readFileSync(
        join(__dirname, '..', 'persona', 'prompts', 'system.md'), 'utf-8'
    );
    // Charger le template de refus s'il existe
    refusalPrompt = readFileSync(
        join(__dirname, '..', 'persona', 'prompts', 'refusal.md'), 'utf-8'
    );
} catch {
    systemPrompt = 'Tu es un assistant amical.';
    refusalPrompt = 'Tu es {{name}}. Refuse poliment car: {{reason}}.';
}

/**
 * Noyau principal du bot
 */
class BotCore {
    constructor() {
        this.transport = baileysTransport;
        this.isReady = false;

        // [FEEDBACK FIRST] Constantes pour réponse rapide < 30s
        this.FEEDBACK_TIMEOUT_MS = 25000; // 25 secondes max avant accusé de réception
        this.QUICK_ACKNOWLEDGMENTS = [
            "Je réfléchis... 🤔",
            "Laisse-moi 2 secondes... 💭",
            "Je cherche ça... 🔍",
            "Hmm, intéressant... 🧐",
            "Un instant... ⏳"
        ];
    }


    /**
     * Initialise tous les composants
     */
    async init() {
        // Afficher le logo HIVE-MIND
        startupDisplay.showLogo();

        // Vérifier le lock de shutdown temporaire
        const lockPath = join(__dirname, '..', '.shutdown_lock');
        if (existsSync(lockPath)) {
            const wakeUpTime = parseInt(readFileSync(lockPath, 'utf-8'));
            if (Date.now() < wakeUpTime) {
                const remainingMinutes = Math.ceil((wakeUpTime - Date.now()) / 60000);
                console.log(`💤 Bot en sommeil pour encore ${remainingMinutes} minutes.`);
                process.exit(0);
            } else {
                // Temps écoulé, on supprime le lock
                unlinkSync(lockPath);
            }
        }

        // 0. DTC Refactor: Initialiser le ServiceContainer (Config)
        startupDisplay.loading('config');
        try {
            await container.init();
            startupDisplay.success('config');
        } catch (e) {
            startupDisplay.error('config', e.message);
        }

        // Redis & Supabase (via container)
        startupDisplay.loading('redis');
        try {
            const redisHealth = await workingMemory.checkHealth();
            if (redisHealth.status === 'connected' || redisHealth.status === 'healthy') {
                startupDisplay.success('redis', 'connected');
            } else {
                startupDisplay.error('redis', redisHealth.error || `Status: ${redisHealth.status}`);
            }
        } catch (e) {
            startupDisplay.error('redis', e.message);
        }

        startupDisplay.loading('supabase');
        try {
            // Test via checkHealth
            const supaHealth = await db.checkHealth();
            if (supaHealth.status === 'connected') {
                startupDisplay.success('supabase', 'service_role');
            } else {
                startupDisplay.error('supabase', supaHealth.error || 'non connecté');
            }
        } catch (e) {
            startupDisplay.error('supabase', e.message);
        }

        // Register local services
        this._initServices();

        // 1. Charger les plugins
        startupDisplay.loading('plugins');
        try {
            const loadedPlugins = await pluginLoader.loadAll();
            const pluginCount = loadedPlugins?.size || loadedPlugins?.length || 0;
            startupDisplay.success('plugins', `${pluginCount} loaded`);
        } catch (e) {
            startupDisplay.error('plugins', e.message);
        }

        // 2. Enregistrer les handlers d'événements
        this._registerHandlers();

        // 3. Initialiser le scheduler
        startupDisplay.loading('scheduler');
        try {
            scheduler.init();
            startupDisplay.success('scheduler');
        } catch (e) {
            startupDisplay.error('scheduler', e.message);
        }

        // 4. DTC Phase 1: Initialiser le service d'admins globaux
        startupDisplay.loading('admin');
        try {
            await adminService.init();
            startupDisplay.success('admin');
        } catch (e) {
            startupDisplay.error('admin', e.message);
        }

        // 5. [LEVEL 5] Initialiser le Feedback et Auto-Apprentissage
        startupDisplay.loading('reflection');
        try {
            const { feedbackService } = await import('../services/feedbackService.js');
            feedbackService.init();
            startupDisplay.success('reflection', 'feedback active');
        } catch (e) {
            startupDisplay.error('reflection', e.message);
        }

        // 6. Connecter le transport
        startupDisplay.loading('transport');
        try {
            await this.transport.connect();
            startupDisplay.success('transport', 'WhatsApp');
        } catch (e) {
            startupDisplay.error('transport', e.message);
        }

        // 6. Configurer les callbacks
        this.transport.onMessage((msg) => this._onMessage(msg));
        this.transport.onGroupEvent((event) => this._onGroupEvent(event));

        this.isReady = true;
        startupDisplay.complete(persona.name);
    }

    /**
     * Enregistre les services dans le conteneur DI
     */
    _initServices() {
        // Enregistrer les services dans le DI Container
        container.register('userService', userService);
        container.register('groupService', groupService);
        container.register('adminService', adminService);
        container.register('workingMemory', workingMemory);
        container.register('memory', semanticMemory); // 'memory' = Semantic RAG
        container.register('facts', factsMemory);     // 'facts' = Explicit Facts
        container.register('consciousness', consciousness); // [CONSCIOUSNESS]

        // [LEVEL 5] Services de Reflection et Morale
        import('../services/dreamService.js').then(m => container.register('dream', m.dreamService));
        import('../services/moralCompass.js').then(m => container.register('moralCompass', m.moralCompass));

        // [AUDIO] Providers
        container.register('voiceProvider', new VoiceProvider(config.voice, quotaManager));
        container.register('geminiLiveProvider', new GeminiLiveProvider());

        // Injecter le container dans le transport
        this.transport.setContainer(container);
    }

    /**
     * Enregistre les handlers pour l'orchestrateur
     */
    _registerHandlers() {
        // Initialiser les handlers modulaires
        this.schedulerHandler = new SchedulerHandler(this.transport);
        this.schedulerHandler.setMessageHandler(this._handleMessage.bind(this));

        this.groupHandler = new GroupHandler(this.transport);
        this.groupHandler.setWelcomeHandler(this._handleGroupWelcome.bind(this));

        // Enregistrement des handlers dans l'orchestrateur
        orchestrator.registerHandler('message', async (event) => {
            await this._handleMessage(event);
        });

        orchestrator.registerHandler('scheduled', async (event) => {
            // Déléguer au handler modulaire
            await this.schedulerHandler.handleJob(event);
        });

        orchestrator.registerHandler('proactive', async (event) => {
            await this._handleProactive(event);
        });

        orchestrator.registerHandler('group_event', async (event) => {
            // Déléguer au handler modulaire
            await this.groupHandler.handleEvent(event);
        });
    }

    /**
     * Callback sur réception de message
     */
    async _onMessage(message) {
        if (!message.text?.trim()) return;

        // [GOAL SEEKING] Tracker l'activité du groupe
        if (message.isGroup) {
            workingMemory.trackGroupActivity(message.chatId).catch(() => { });
        }

        // VERIFICATION MUTE (Silence)
        // Si l'utilisateur est mute dans ce groupe, on ignore totalement
        if (message.isGroup) {
            const isMuted = await workingMemory.isMuted(message.chatId, message.sender);
            if (isMuted) {
                console.log(`[Core] Message ignoré (User Muted): ${message.sender} dans ${message.chatId}`);
                return;
            }
        }

        orchestrator.enqueue({
            type: 'message',
            chatId: message.chatId,
            data: message,
            priority: 1
        });
    }

    _onGroupEvent(event) {
        orchestrator.enqueue({
            type: 'group_event',
            chatId: event.groupId,
            data: event,
            priority: 3
        });
    }

    /**
     * (Module 3) Logique de Bienvenue & Roadmap
     */
    async _handleGroupWelcome(event) {
        const { groupId, participants, action } = event.data;
        if (action !== 'add') return;

        // 1. Récupérer la config du groupe
        const config = await db.getGroupConfig(groupId);

        // 2. Message de bienvenue personnalisé ou défaut
        const welcomeTemplate = config?.welcome_message || `Bienvenue @user !`;

        for (const participant of participants) {
            const userJid = participant;
            const userName = userJid.split('@')[0];

            const message = welcomeTemplate
                .replace('@user', `@${userName}`);

            await this.transport.sendText(groupId, message, {
                mentions: [userJid]
            });
        }
    }

    /**
     * (Fix 1) Détermine si le bot est sollicité
     */
    _isBotMentioned(message, text) {
        // 1. MP (Message Privé)
        if (!message.isGroup) return true;

        // 2. Récupérer TOUS les identifiants du bot (JID téléphone + LID)
        const rawBotId = this.transport.sock?.user?.id;
        const botLid = this.transport.sock?.user?.lid;
        const botPhoneId = extractNumericId(rawBotId);
        const botLidId = extractNumericId(botLid);

        const mentionedJids = message.mentionedJids || [];

        // DEBUG: Afficher les valeurs
        console.log(`[DEBUG Mention] botPhoneId=${botPhoneId}, botLidId=${botLidId}, mentionedJids=${JSON.stringify(mentionedJids)}, text="${text.substring(0, 50)}"`);

        // 2a. Vérifier si le bot est mentionné via son numéro de téléphone OU son LID
        for (const jid of mentionedJids) {
            if (jidMatch(jid, rawBotId) || jidMatch(jid, botLid)) {
                console.log('[DEBUG] ✓ Détecté via mentionedJids (jidMatch)');
                return true;
            }
        }

        // 2b. Fallback: JID visible dans le texte
        if (botPhoneId && text.includes(botPhoneId)) {
            console.log('[DEBUG] ✓ Détecté via texte contenant phoneId');
            return true;
        }
        if (botLidId && text.includes(botLidId)) {
            console.log('[DEBUG] ✓ Détecté via texte contenant LID');
            return true;
        }

        // 3. Réponse à un message du bot (Quoted)
        if (message.quotedMsg) {
            console.log(`[DEBUG QuotedMsg] sender=${message.quotedMsg.sender}, text="${message.quotedMsg.text?.substring(0, 30)}..."`);
        }

        if (message.quotedMsg?.sender) {
            if (jidMatch(message.quotedMsg.sender, rawBotId) || jidMatch(message.quotedMsg.sender, botLid)) {
                console.log('[DEBUG] ✓ Détecté via quotedMsg (jidMatch)');
                return true;
            }
        }

        // 4. Mention par Nom (dynamique via botIdentity)
        if (botIdentity.isMentioned(text)) {
            console.log('[DEBUG] ✓ Détecté via nom (botIdentity)');
            return true;
        }

        console.log('[DEBUG] ✗ Bot NON mentionné');
        return false;
    }

    /**
     * Traite un message
     */
    async _handleMessage(event) {
        const message = event.data;
        const { chatId, sender, senderName, text, isGroup } = message;

        if (chatId === 'status@broadcast' || chatId?.endsWith('@broadcast')) {
            return; // Silently ignore
        }

        console.log(`[${isGroup ? 'G' : 'P'}] ${senderName}: ${text.substring(0, 50)}...`);

        // ========== VELOCITY TRACKING (Adaptive Reply System) ==========
        // Tracker ce message pour le calcul de vélocité du chat
        if (isGroup) {
            workingMemory.trackMessage(chatId, sender).catch(() => { });
        }

        // ======== IDENTITY LINKING (Aggressive) ========
        // Lier le LID au JID si disponible (Critique pour que le bot reconnaisse les admins)
        // ======== IDENTITY LINKING (Aggressive) ========
        // Lier le LID au JID si disponible via le message brut
        if (message.sender && message.raw) {
            try {
                const userService = container.get('userService');
                if (userService) {
                    const rawKey = message.raw.key || {};
                    // Dans les groupes modernes, key.participant est souvent le LID
                    // message.sender est normalisé, donc ça dépend de Baileys

                    const candidate1 = message.sender;
                    const candidate2 = rawKey.participant;

                    if (candidate1 && candidate2 && candidate1 !== candidate2) {
                        let jid = null;
                        let lid = null;

                        if (candidate1.endsWith('@s.whatsapp.net')) jid = candidate1;
                        if (candidate1.endsWith('@lid')) lid = candidate1;

                        if (candidate2.endsWith('@s.whatsapp.net')) jid = candidate2;
                        if (candidate2.endsWith('@lid')) lid = candidate2;

                        if (jid && lid) {
                            // On a trouvé une paire JID/LID !
                            console.log(`[Identity] 🔗 LINK DÉTECTÉ: ${jid} ↔ ${lid}`);
                            userService.registerLid(jid, lid).catch(() => { });
                        }
                    }
                }
            } catch (e) {
                console.warn('[Identity] Erreur linking:', e.message);
            }
        }

        // ======== COMMANDES TEXTUELLES PLUGINS (ex: .shutdown, .devcontact) ========
        // Le système générique permet à tout plugin de définir des commandes textuelles
        const textCommand = pluginLoader.findTextHandler(text, message);
        if (textCommand) {
            console.log(`[Core] ⌨️ Commande textuelle détectée: ${textCommand.name}`);

            // Exécution directe via le plugin concerné
            // Le loader s'occupe de router vers le bon plugin execute()
            const result = await pluginLoader.execute(textCommand.name, textCommand.args, {
                transport: this.transport,
                message,
                chatId,
                sender,
                isGroup
            });

            // Si le plugin retourne un message, on l'envoie
            if (result && result.message) {
                await this.transport.sendText(chatId, result.message);
            }
            return; // On arrête le flux ici, pas d'IA si c'est une commande
        }

        // ======== COMMANDES .TASK (Group Manager) ========
        if (text.toLowerCase().startsWith('.task') && isGroup) {
            const groupManager = pluginLoader.get('group_manager');
            if (groupManager) {
                const parsed = groupManager.parseTextCommand(text);
                if (parsed) {
                    console.log(`[Core] Commande .task détectée: ${parsed.name}`);
                    const result = await groupManager.execute(parsed.args, {
                        transport: this.transport,
                        message,
                        chatId,
                        sender
                    }, parsed.name);

                    await this.transport.sendText(chatId, result.message);
                    return; // Arrêt ici, pas d'IA
                }
            }
        }

        // ======== FILTRAGE GROUPE (avant IA, économique) ========
        if (isGroup && filterProcessor) {
            try {
                const filterResult = await filterProcessor.process(message, this.transport);
                if (filterResult?.action) {
                    console.log(`[Filter] Action exécutée: ${filterResult.action}`);
                    // Le message a été traité par le filtre, on n'appelle pas l'IA
                    return;
                }
            } catch (e) {
                console.error('[Filter] Erreur:', e.message);
            }
        }

        // (Fix 1) Utilisation de la nouvelle méthode de détection
        const mentionsBot = this._isBotMentioned(message, text);
        const isPrivate = !isGroup;

        // NOUVEAU: Détecter si c'est une image adressée au bot
        const hasImage = message.mediaType === 'image';
        const hasQuotedImage = message.quotedMsg?.hasImage;
        const isImageForBot = hasImage && (isPrivate || mentionsBot || message.quotedMsg?.sender === this.transport.sock?.user?.id);

        // ========== CONTEXTUAL CONVERSATION (Follow-up Mode) ==========
        // Si l'utilisateur est le dernier à avoir parlé au bot (et qu'on est en mode solo/calme)
        // On considère qu'il parle toujours au bot, même sans mention
        let isContextualReply = false;

        if (isGroup && !mentionsBot) {
            const lastInteraction = await workingMemory.getLastInteraction(chatId);
            const velocity = await workingMemory.getChatVelocity(chatId);

            // Si c'est le même utilisateur, il y a moins de 2 min, et personne d'autre n'est actif
            if (lastInteraction &&
                lastInteraction.user === sender &&
                (Date.now() - lastInteraction.timestamp) < 120000 && // 2 minutes
                velocity.uniqueSenders <= 1
            ) {
                console.log(`[Core] 🗣️ Conversation Suivie détectée (User: ${senderName})`);
                isContextualReply = true;
            }
        }

        let hasInterest = false;
        if (!mentionsBot && !isPrivate && !isContextualReply && !isImageForBot) {
            const interests = persona.interests || [];
            hasInterest = interests.some(topic => text.toLowerCase().includes(topic.toLowerCase()));

            // Si aucun critère n'est rempli, on ignore
            if (!hasInterest) return;
        }

        // DTC Phase 1: Enregistrer l'interaction via userService (unifie LowDB + Supabase)
        await userService.recordInteraction(sender, senderName, isGroup ? chatId : null);

        // 2. Tracking Groupe (Stats Spécifiques) - NOUVEAU
        if (isGroup) {
            // Pas besoin d'attendre (fire and forget)
            const groupService = container.get('groupService');
            groupService.trackActivity(chatId, sender).catch(console.error);
        }

        // 1. Mémoire de travail (Redis) avec identification speaker pour les groupes
        if (isGroup) {
            const speakerHash = await userService.getSpeakerHash(sender);
            await workingMemory.addMessage(chatId, 'user', text, speakerHash, senderName);
        } else {
            await workingMemory.addMessage(chatId, 'user', text);
        }

        // 2. Mémoire sémantique
        if (isStorable(text, 'user')) {
            // Mémoire Sémantique (RAG) via DI
            const memory = container.get('memory');
            memory.store(chatId, text, 'user', { msgId: message.id }).catch(console.error);
        }

        // Indicateur de frappe
        await this.transport.setPresence(chatId, 'composing');

        // [FEEDBACK FIRST] Variables de contrôle pour la réponse rapide
        let feedbackTimeoutId = null;
        const feedbackState = { sent: false };

        try {
            // ========== GESTION AUDIO NATIF (Gemini Live) ==========
            // Si le message a été marqué par Baileys comme devant utiliser le mode natif
            if (message.useNativeAudio) {
                console.log('[Core] 🎙️ Traitement Audio Natif (Gemini Live)');

                if (container.has('geminiLiveProvider')) {
                    const geminiLive = container.get('geminiLiveProvider');
                    const config = container.get('config'); // RécupConfig
                    const shortTermContext = await workingMemory.getContext(chatId);

                    // Constuire le contexte (pour le system prompt)
                    const context = await this._buildContext(chatId, message, shortTermContext);

                    // Tools sélection
                    // On charge les outils génériques car on a pas encore le texte
                    const relevantTools = await pluginLoader.getRelevantTools("conversation générale", 5, 0.5);

                    // Définir l'executor pour que le Provider puisse appeler les tools du Bot
                    geminiLive.toolExecutor = async (name, args) => {
                        console.log(`[Core] 🛠️ Exécution tool via Live: ${name}`);
                        // On réutilise _executeTool du Core
                        return await this._executeTool(name, args, context);
                    };

                    // Appel Streaming vers Gemini Live
                    const response = await geminiLive.processAudioWithTools({
                        audioBuffer: message.audioBuffer,
                        systemPrompt: context.systemPrompt,
                        tools: relevantTools,
                        conversationHistory: context.messages.slice(-5), // Limite contexte audio
                        voice: config.models?.voice_provider?.audio_strategy?.native_voice || 'Aoede'
                    });

                    // 1. Envoyer la réponse AUDIO
                    if (response.audioFile) {
                        try {
                            // On envoie le fichier audio (converti en OGG par le provider ou baileys?)
                            // Wait, geminiLiveProvider save en PCM actuellement.
                            // Il faut le convertir en OGG ici ou dans le provider.
                            // Le provider renvoie 'audioFile' (PCM). Baileys sendVoice attend un OGG/MP3 souvent.
                            // Baileys sendVoice: { audio: { url: path }, mimetype: 'audio/mp4', ptt: true }
                            // Il faut convertir PCM -> OGG/MP3. 

                            // Import dynamique du converter
                            const converter = await import('../services/audio/audioConverter.js');
                            const fs = await import('fs');
                            const path = await import('path');

                            const outputOgg = response.audioFile.replace('.pcm', '.ogg');
                            await converter.convertPcmToOgg(response.audioFile, outputOgg);

                            await this.transport.sendVoice(chatId, outputOgg);

                            // Nettoyage
                            setTimeout(() => {
                                try { fs.unlinkSync(response.audioFile); } catch (e) { }
                                try { fs.unlinkSync(outputOgg); } catch (e) { }
                            }, 10000);

                        } catch (e) {
                            console.error('[Core] ❌ Erreur envoi vocal natif:', e.message);
                        }
                    } else if (response.transcribedText) {
                        // Fallback texte si pas d'audio généré
                        await this.transport.sendText(chatId, response.transcribedText);
                    }

                    // 2. Stocker en mémoire (texte transcrit par Gemini)
                    if (response.transcribedText) {
                        await workingMemory.addMessage(chatId, 'assistant', response.transcribedText);
                    }

                    return; // Fin du traitement natif, on arrête ici.
                } else {
                    console.warn('[Core] ⚠️ Flag useNativeAudio actif mais provider manquant. Fallback cascade.');
                }
            }

            // ========== GESTION MULTIMODALE (Images) ==========
            let userContent = text;
            const imageBlocks = []; // Stocke les images à envoyer à l'IA

            // 1. Image directe envoyée par l'utilisateur
            if (message.mediaType === 'image') {
                try {
                    console.log('[Core] 📷 Téléchargement image directe...');
                    const buffer = await this.transport.downloadMedia(message);
                    const base64 = buffer.toString('base64');
                    imageBlocks.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
                    console.log('[Core] ✅ Image directe téléchargée');
                } catch (e) {
                    console.error('[Core] ❌ Erreur téléchargement image directe:', e.message);
                }
            }

            // 2. Image dans le message cité (quoted)
            if (message.quotedMsg?.hasImage) {
                try {
                    console.log('[Core] 📷 Téléchargement image du quoted message...');
                    // Télécharger l'image du quoted via le message brut
                    const quotedBuffer = await this.transport.downloadQuotedMedia(message);
                    if (quotedBuffer) {
                        const quotedBase64 = quotedBuffer.toString('base64');
                        imageBlocks.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${quotedBase64}` } });
                        console.log('[Core] ✅ Image quoted téléchargée');
                    }
                } catch (e) {
                    console.error('[Core] ❌ Erreur téléchargement image quoted:', e.message);
                }
            }

            // Construire le contenu multimodal si on a des images
            if (imageBlocks.length > 0) {
                userContent = [
                    { type: 'text', text: text || 'Que vois-tu sur cette image ?' },
                    ...imageBlocks
                ];
            }

            // ========== CONTEXTE DE MESSAGE CITÉ (Quote Context) ==========
            // Intégrer le contexte du message cité pour que l'IA comprenne le contexte
            if (message.quotedMsg) {
                const quotedParticipant = message.quotedMsg.sender?.split('@')[0] || 'Inconnu';
                let quoteBlock = '';

                if (message.quotedMsg.hasImage && !message.quotedMsg.text) {
                    quoteBlock = `\n\n[Contexte - En réponse à une IMAGE envoyée par @${quotedParticipant}]`;
                } else if (message.quotedMsg.hasImage && message.quotedMsg.text) {
                    quoteBlock = `\n\n[Contexte - En réponse à une IMAGE avec légende de @${quotedParticipant} : "${message.quotedMsg.text}"]`;
                } else if (message.quotedMsg.hasVideo) {
                    quoteBlock = `\n\n[Contexte - En réponse à une VIDÉO de @${quotedParticipant}${message.quotedMsg.text ? ` : "${message.quotedMsg.text}"` : ''}]`;
                } else if (message.quotedMsg.text) {
                    quoteBlock = `\n\n[Contexte - En réponse à un message de @${quotedParticipant} : "${message.quotedMsg.text}"]`;
                }

                if (quoteBlock) {
                    if (Array.isArray(userContent)) {
                        // Cas Multimodal : on l'ajoute au bloc texte
                        const textBlock = userContent.find(b => b.type === 'text');
                        if (textBlock) textBlock.text += quoteBlock;
                    } else {
                        // Cas Texte simple
                        userContent += quoteBlock;
                    }
                }
            }


            // [AGENTIC SWITCH] Classification précoce pour choisir la stratégie
            // On le fait AVANT le RAG et le contexte lourd pour une meilleure réactivité
            const complexity = await this._classifyComplexity(typeof text === 'string' ? text : "");

            // 3. Récupération du contexte hybride
            const shortTermContext = await workingMemory.getContext(chatId);
            const context = await this._buildContext(chatId, message, shortTermContext);

            // [SENTIENCE] Récupérer le niveau d'agacement pour la sélection d'outils
            const annoyanceLevel = await consciousness.getAnnoyance(chatId, message.sender);
            const forceModeration = annoyanceLevel > 50;

            if (forceModeration) {
                console.log(`[Sentience] 😠 Agacement élevé (${annoyanceLevel}), injection forcée des outils de modération.`);
            }

            // Phase 2 RAG: Sélection dynamique des outils pertinents
            const relevantTools = await pluginLoader.getRelevantTools(
                typeof userContent === 'string' ? userContent : text, // Texte de la requête
                5,  // Limite d'outils pertinents
                10, // Fallback: envoyer les 10 premiers si RAG échoue
                { forceModeration } // Options: Forcer les outils de modération
            );

            // [AGENTIC CORE] Boucle de Réflexion (ReAct Pattern)
            // L'IA peut enchaîner les outils avant de répondre.

            // [ACTION MEMORY] Vérifier s'il y a une action en cours
            const activeActionContext = await actionMemory.formatForPrompt(chatId);
            let systemPromptWithAction = context.systemPrompt;
            if (activeActionContext) {
                systemPromptWithAction += `\n${activeActionContext}`;
                console.log('[ActionMemory] 🔄 Action en cours injectée dans le prompt');
            }

            const conversationHistory = [
                { role: 'system', content: systemPromptWithAction },
                ...context.history,
                { role: 'user', content: userContent }
            ];

            // ========== [FEEDBACK FIRST] Garantie de réponse < 30 secondes ==========
            // On wrap tout le traitement IA dans une promesse et on race contre un timeout
            // feedbackState est défini plus haut pour être accessible dans le catch

            // Construire les options de réponse maintenant (pour le fallback aussi)
            let replyOptions = {};
            if (isGroup) {
                const strategy = await workingMemory.getReplyStrategy(chatId, message);
                if (strategy.useQuote && message.raw) {
                    replyOptions.reply = message.raw;
                }
                if (strategy.useMention && sender) {
                    replyOptions.mentions = [sender];
                }
            }

            // Timeout qui envoie un accusé de réception
            feedbackTimeoutId = setTimeout(async () => {
                if (!feedbackState.sent) {
                    const ack = this.QUICK_ACKNOWLEDGMENTS[Math.floor(Math.random() * this.QUICK_ACKNOWLEDGMENTS.length)];
                    console.log(`[FeedbackFirst] ⏰ Timeout atteint (${this.FEEDBACK_TIMEOUT_MS}ms), envoi accusé: "${ack}"`);
                    await this.transport.sendText(chatId, ack, replyOptions);
                    feedbackState.sent = true;
                    // Réactiver l'indicateur de frappe pour montrer qu'on continue à travailler
                    await this.transport.setPresence(chatId, 'composing');
                }
            }, this.FEEDBACK_TIMEOUT_MS);

            // On désactive la boucle lourde si c'est une requête standard, 
            // mais on garde les outils dispo pour des actions simples (ex: réactions)
            let finalResponse = null;
            let keepThinking = true;
            let iterations = 0;
            const MAX_ITERATIONS = 10;
            let usedFamily = null;



            if (complexity === 'STANDARD') {
                console.log(`[Agent] ⚡ Fast-Path: Traitement Standard (Outils inclus)`);
                // Pour le mode STANDARD, on force une famille ultra-rapide (Groq) pour court-circuiter le Smart Router L3
                const response = await providerRouter.chat(conversationHistory, {
                    family: 'groq',
                    tools: relevantTools
                });

                finalResponse = response.content;

                // [FALLBACK] Détecter les "hallucinations" de tool calls textuels dans le mode Standard
                if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
                    const toolRegex = /(?:print\()?(?:sys_interaction\.)?([a-zA-Z0-9_]+)\(([\s\S]*?)\)/g;
                    let match;
                    const extractedCalls = [];
                    while ((match = toolRegex.exec(response.content)) !== null) {
                        try {
                            const name = match[1];
                            const argsStr = match[2];
                            let args = {};
                            if (argsStr.includes('=')) {
                                const pairs = argsStr.split(',').map(p => p.trim());
                                pairs.forEach(p => {
                                    const [k, v] = p.split('=').map(x => x.trim().replace(/^["']|["']$/g, ''));
                                    if (k && v) args[k] = v;
                                });
                            } else {
                                try { args = JSON.parse(argsStr); } catch (e) { }
                            }
                            if (name) {
                                extractedCalls.push({
                                    id: `std_hal_${Date.now()}`,
                                    type: 'function',
                                    function: { name, arguments: JSON.stringify(args) }
                                });
                            }
                        } catch (e) { }
                    }
                    if (extractedCalls.length > 0) {
                        console.log(`[Agent] 🕵️ Tool calls textuels détectés en Standard: ${extractedCalls.length}`);
                        response.toolCalls = extractedCalls;
                    }
                }

                // Exécuter les outils s'il y en a, mais une seule fois
                if (response.toolCalls && response.toolCalls.length > 0) {
                    console.log(`[Agent] 🛠️ Exécution outils en mode Standard: ${response.toolCalls.length}`);
                    for (const toolCall of response.toolCalls) {
                        try {
                            await this._executeTool(toolCall, message);
                        } catch (e) {
                            console.error(`[Agent] ❌ Échec outil Standard:`, e.message);
                        }
                    }
                }

                // Fin du traitement pour le mode Standard
                keepThinking = false;
            } else {
                console.log('[Agent] 🧠 Pas-à-pas: Traitement Agentique');
            }

            // [EXPLICIT PLANNER] Seulement si AGENTIC
            if (keepThinking) {
                const { planner } = await import('../services/agentic/Planner.js');
                const needsPlanning = await planner.needsPlanning(
                    typeof userContent === 'string' ? userContent : text,
                    relevantTools
                );

                if (needsPlanning) {
                    console.log('[Planner] 📋 Tâche complexe détectée, création d\'un plan...');
                    const plan = await planner.plan(
                        typeof userContent === 'string' ? userContent : text,
                        { tools: relevantTools, chatId, message }
                    );

                    if (plan) {
                        const executionLog = await planner.execute(plan, {
                            executeToolFn: this._executeTool.bind(this),
                            chatId,
                            message
                        });
                        const analysis = await planner.review(executionLog);

                        const summaryPrompt = `Le plan d'action a été exécuté.\nObjectif: ${plan.goal}\nRésultats: ${JSON.stringify(executionLog.results).substring(0, 1000)}\n\nGénère une réponse conversationnelle résumant ce qui a été fait.`;
                        const summaryResponse = await providerRouter.chat([
                            ...conversationHistory,
                            { role: 'user', content: summaryPrompt }
                        ], { family: usedFamily });

                        finalResponse = summaryResponse.content;
                        await actionMemory.completeAction(chatId, { success: analysis.success });
                        keepThinking = false;
                    }
                }
            }

            while (keepThinking && iterations < MAX_ITERATIONS) {
                iterations++;

                // Appel à l'IA avec l'historique accumulé
                const response = await providerRouter.chat(conversationHistory, {
                    tools: relevantTools,
                    family: usedFamily // Utiliser le même cerveau pour tout le thread
                });

                // Sauvegarder la famille utilisée au premier tour
                if (!usedFamily) usedFamily = response.usedFamily;

                // [FALLBACK] Détecter les "hallucinations" de tool calls textuels (ex: Kimi qui écrit du code)
                if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
                    const toolRegex = /(?:print\()?(?:sys_interaction\.)?([a-zA-Z0-9_]+)\(([\s\S]*?)\)/g;
                    let match;
                    const extractedCalls = [];

                    while ((match = toolRegex.exec(response.content)) !== null) {
                        try {
                            const name = match[1];
                            const argsStr = match[2];

                            // Tenter d'extraire les arguments (format 'emoji="✨"' ou JSON)
                            let args = {};
                            if (argsStr.includes('=')) {
                                // Format clé=valeur
                                const pairs = argsStr.split(',').map(p => p.trim());
                                pairs.forEach(p => {
                                    const [k, v] = p.split('=').map(x => x.trim().replace(/^["']|["']$/g, ''));
                                    if (k && v) args[k] = v;
                                });
                            } else {
                                try { args = JSON.parse(argsStr); } catch (e) { }
                            }

                            if (name) {
                                extractedCalls.push({
                                    id: `hallucinated_${Date.now()}_${extractedCalls.length}`,
                                    type: 'function',
                                    function: { name, arguments: JSON.stringify(args) }
                                });
                            }
                        } catch (e) { /* On ignore si mal formé */ }
                    }

                    if (extractedCalls.length > 0) {
                        console.log(`[Agent] 🕵️ Tool calls textuels détectés et convertis: ${extractedCalls.length}`);
                        response.toolCalls = extractedCalls;
                    }
                }

                if (response.toolCalls && response.toolCalls.length > 0) {
                    console.log(`[Agent] 🛠️ Étape ${iterations}: L'IA appelle ${response.toolCalls.length} outil(s)`);

                    // 1. Ajouter la "pensée" de l'assistant à l'historique
                    // Important: inclure les tool_calls pour que l'IA sache ce qu'elle a demandé
                    conversationHistory.push({
                        role: 'assistant',
                        content: response.content || null,
                        tool_calls: response.toolCalls
                    });

                    // 2. Exécuter les outils
                    const { getToolFeedback } = await import('../utils/messageSplitter.js');

                    for (const toolCall of response.toolCalls) {
                        const toolName = toolCall.function.name;

                        try {
                            // [MULTI-AGENT] Critique pour actions critiques
                            const { multiAgent } = await import('../services/agentic/MultiAgent.js');
                            if (multiAgent.needsCritique(toolCall, context)) {
                                console.log(`[MultiAgent] 🕵️ Action critique détectée: ${toolName}`);
                                const critique = await multiAgent.critique(toolCall, {
                                    chatId,
                                    sender: message.sender,
                                    senderName: message.senderName,
                                    isGroup: message.isGroup,
                                    authorityLevel: context.authority?.level || 0
                                });

                                if (!critique.approved) {
                                    console.warn(`[MultiAgent] 🛑 Action refusée par Critic: ${critique.concerns.join('. ')}`);
                                    conversationHistory.push({
                                        role: 'tool',
                                        tool_call_id: toolCall.id,
                                        name: toolName,
                                        content: JSON.stringify({
                                            success: false,
                                            error: true,
                                            message: `ACTION_REFUSÉE_PAR_CRITIC: ${critique.concerns.join('. ')}. Alternative suggérée: ${critique.alternative || 'aucune'}`
                                        })
                                    });
                                    continue;
                                }
                            }

                            // [LEVEL 5] Boussole Morale Dynamique
                            const moralCompass = container.get('moralCompass');
                            if (moralCompass) {
                                console.log(`[MoralCompass] 🧭 Évaluation de l'action: ${toolName}`);
                                const evaluation = await moralCompass.evaluate(toolCall, {
                                    chatId,
                                    sender: message.sender,
                                    senderName: message.senderName,
                                    isGroup: message.isGroup,
                                    authorityLevel: context.authority?.level || 0
                                });

                                if (!evaluation.allowed) {
                                    console.warn(`[MoralCompass] 🛑 Action refusée: ${evaluation.reason}`);
                                    conversationHistory.push({
                                        role: 'tool',
                                        tool_call_id: toolCall.id,
                                        name: toolName,
                                        content: JSON.stringify({
                                            success: false,
                                            error: true,
                                            message: `ACTION_REFUSÉE_PAR_LA_BOUSSOLE_MORALE: ${evaluation.reason}`
                                        })
                                    });
                                    continue;
                                }
                            }

                            const toolResult = await this._executeTool(toolCall, message);

                            // Important: l'IA a besoin de voir le résultat JSON pur
                            const stringResult = JSON.stringify(toolResult);

                            // 3. Ajouter le résultat à l'historique
                            conversationHistory.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: toolName,
                                content: stringResult
                            });

                            console.log(`[Agent] ✅ Résultat ${toolName} reçu (${stringResult.length} chars)`);

                            // UX Agentique: Petit feedback visuel si c'est long
                            if (iterations > 1) {
                                await this.transport.setPresence(chatId, 'composing');
                            }

                            // [EPISODIC MEMORY] Log de l'action réussie
                            const actionLog = await db.logAction(chatId, toolName, toolCall.function.arguments, toolResult, true);

                            // [POST-ACTION EVALUATION] Évaluer l'action pour apprentissage continu
                            if (actionLog?.id) {
                                const { actionEvaluator } = await import('../services/agentic/ActionEvaluator.js');
                                actionEvaluator.evaluate({
                                    id: actionLog.id,
                                    tool: toolName,
                                    params: JSON.parse(toolCall.function.arguments),
                                    result: toolResult,
                                    duration_ms: 0, // TODO: measure
                                    chatId,
                                    timestamp: Date.now()
                                }).catch(e => console.error('[Eval] Error:', e.message));
                            }

                            // Cas spécial: Si un outil demande d'arrêter ou échoue fatalement ?
                            // Pour l'instant on laisse l'IA gérer l'erreur (Graceful Degradation)

                        } catch (execErr) {
                            console.error(`[Agent] ❌ Erreur critique exécution outil ${toolName}:`, execErr);

                            // [EPISODIC MEMORY] Log de l'action échouée
                            db.logAction(chatId, toolName, toolCall.function.arguments, null, false, execErr.message);

                            // [SELF-HEALING] On renvoie l'erreur détaillée à l'IA pour qu'elle corrige
                            conversationHistory.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: toolName,
                                content: JSON.stringify({
                                    success: false,
                                    error: true,
                                    message: `Tool Execution Failed: ${execErr.message}. Please analyze the error, self-correct your parameters or strategy, and try again.`
                                })
                            });
                        }
                    }

                    // On continue la boucle pour que l'IA analyse ces résultats
                    continue;

                } else {
                    // 4. L'IA n'a plus d'outils à appeler, c'est la réponse finale
                    console.log(`[Agent] 🏁 Fin de réflexion à l'étape ${iterations}.`);

                    // DEBUG: Voir ce que le provider retourne
                    console.log(`[Agent Debug] response.content type: ${typeof response.content}, value: "${String(response.content).substring(0, 100)}"`);
                    console.log(`[Agent Debug] response keys: ${Object.keys(response).join(', ')}`);

                    finalResponse = response.content;
                    keepThinking = false;
                }
            }

            // Sécurité boucle infinie
            if (!finalResponse && iterations >= MAX_ITERATIONS) {
                finalResponse = "J'ai trop réfléchi et je me suis perdu en chemin... (Boucle infinie détectée)";
                console.warn('[Agent] ⚠️ MAX_ITERATIONS reached');
            }

            // [AGENTIC] Fallback si l'IA n'a rien répondu mais a bouclé
            if (!finalResponse && iterations > 0) {
                finalResponse = "J'ai terminé ma réflexion, mais je n'ai pas trouvé de réponse textuelle appropriée.";
                console.log('[Agent] ⚠️ Réponse vide après réflexion, application du fallback.');
            }

            // --- Post-Processing (Commandes Textuelles Fallback) ---
            if (finalResponse) {
                // Parser les commandes textuelles via le système de matchers décentralisé
                // Chaque plugin déclare ses propres patterns (textMatchers) - voir plugins/loader.js
                const parsedCommand = pluginLoader.findTextHandler(finalResponse, {
                    ...message,
                    botJid: this.transport.sock?.user?.id // Passer l'ID du bot pour filtrer les mentions
                });
                if (parsedCommand) {
                    console.log(`[Core] Commande textuelle détectée dans réponse IA: ${parsedCommand.name}`);
                    // (Logique identique à avant pour l'exécution cmd textuelle)
                    let toolResult;
                    try {
                        toolResult = await pluginLoader.execute(
                            parsedCommand.name,
                            parsedCommand.args,
                            { transport: this.transport, message, chatId, sender }
                        );
                        if (toolResult.success) {
                            // On remplace la réponse de l'IA par le résultat de la commande
                            finalResponse = toolResult.message;
                        }
                    } catch (cmdErr) {
                        console.error(`[Core] ⚠️ Text Command Fallback Error:`, cmdErr.message);
                    }
                }
            }


            // Délai naturel
            await this._naturalDelay();

            // [VOICE LOGIC] Si le message d'origine était vocal ou si demandé
            if (message.isTranscribed || text.toLowerCase().includes('réponds par vocal')) {
                try {
                    // Utiliser le VoiceProvider unifié (avec fallback Minimax -> Gemini -> GTTS)
                    const voiceProvider = container.get('voiceProvider');
                    if (voiceProvider) {
                        console.log('[Core] 🗣️ Génération réponse vocale...');
                        const ttsResult = await voiceProvider.textToSpeech(finalResponse);

                        if (ttsResult && ttsResult.filePath) {
                            // Envoyer la note vocale via sendVoiceNote (PTT)
                            await this.transport.sendVoiceNote(chatId, ttsResult.filePath, {
                                duration: Math.min(finalResponse.length * 40, 3000)
                            });
                            console.log(`[Core] ✓ Réponse vocale envoyée (${ttsResult.provider})`);

                            // On n'envoie PAS le texte pour éviter le doublon (Simulated Voice Mode)
                            await this.transport.setPresence(chatId, 'paused');

                            // Stockage mémoire
                            await workingMemory.addMessage(chatId, 'assistant', finalResponse);
                            if (isStorable(finalResponse, 'assistant')) {
                                const memory = container.get('memory');
                                memory.store(chatId, finalResponse, 'assistant', { msgId: message.id }).catch(console.error);
                            }
                            return; // FIN TRAITEMENT
                        } else {
                            console.warn('[Core] ⚠️ VoiceProvider n\'a pas retourné de fichier audio');
                        }
                    }
                } catch (voiceError) {
                    console.error('[Core] ❌ Echec réponse vocale, fallback texte:', voiceError.message);
                    // Fallback vers envoi texte normal ci-dessous
                }
            }

            // Envoyer la réponse TEXTE (Standard ou Fallback)
            if (!finalResponse || finalResponse.trim() === '') {
                console.warn('[Core] ⚠️ Réponse vide, annulation envoi');
                return;
            }

            // [AGENTIC] Nettoyage de la pensée interne (Invisible pour l'utilisateur)
            // Supporte <think>, <thought>, <thinking> (DeepSeek, Gemini, etc.)
            const thoughtRegex = /<(think|thought|thinking)>[\s\S]*?<\/\1>/gi;
            if (thoughtRegex.test(finalResponse)) {
                const thoughts = finalResponse.match(thoughtRegex);
                console.log('[Agent] 🧠 Pensée détectée et filtrée:', thoughts ? thoughts.length : 0);

                finalResponse = finalResponse.replace(thoughtRegex, '').trim();

                // Si après nettoyage il ne reste rien, mais qu'il y a eu de l'activité
                if (!finalResponse) {
                    if (iterations > 0) {
                        finalResponse = "*(Réflexion terminée sans réponse textuelle)*";
                    } else {
                        // Cas rare: Le modèle n'a renvoyé QUE de la pensée sans tool call ni réponse
                        return;
                    }
                }
            }

            if (!finalResponse) return;

            // ========== [FEEDBACK FIRST] Nettoyer le timeout et envoyer la réponse ==========
            clearTimeout(feedbackTimeoutId);
            feedbackState.sent = true; // Empêcher l'envoi de l'accusé de réception tardif

            // [MESSAGE SPLITTING] Découper les messages longs en plusieurs parties
            const { splitMessage } = await import('../utils/messageSplitter.js');
            const messageParts = splitMessage(finalResponse, 1500);

            for (let i = 0; i < messageParts.length; i++) {
                // Quote seulement sur la première partie (replyOptions déjà défini plus haut)
                await this.transport.sendText(chatId, messageParts[i], i === 0 ? replyOptions : {});

                // Petit délai naturel entre les parties (sauf la dernière)
                if (i < messageParts.length - 1) {
                    await this._naturalDelay(400);
                }
            }

            if (messageParts.length > 1) {
                console.log(`[Core] 📨 Message découpé en ${messageParts.length} parties`);
            }

            await this.transport.setPresence(chatId, 'paused');

            // Mise à jour de la dernière interaction pour le mode conversationnel
            if (isGroup) {
                await workingMemory.setLastInteraction(chatId, sender);
            }

            // 4. Stockage réponse (Redis + Supabase)
            await workingMemory.addMessage(chatId, 'assistant', finalResponse);

            if (isStorable(finalResponse, 'assistant')) {
                const memory = container.get('memory');
                memory.store(chatId, finalResponse, 'assistant', { msgId: message.id }).catch(console.error);
            }

            // Option B: Extraction automatique de faits (asynchrone, ne bloque pas)
            this._extractFacts(text, sender).catch(err =>
                console.error('[Core] Erreur extraction faits:', err.message)
            );

            // Log (Désactivé)
            // await db.log('message', ...);

        } catch (error) {
            clearTimeout(feedbackTimeoutId); // Important: Clear timeout on error
            console.error('[Core] Erreur traitement:', error);
            await this.transport.sendText(chatId, "Oups, j'ai bugué 😅 Réessaie !");
            await this.transport.setPresence(chatId, 'paused');
        }
    }



    /**
     * Analyse la complexité d'une demande pour choisir le pipeline de traitement
     * @param {string} text Demande utilisateur
     * @returns {Promise<'STANDARD' | 'AGENTIC'>}
     */
    async _classifyComplexity(text) {
        try {
            // Modèles ultra-rapides pour classification
            const fastModels = [
                { family: 'groq', id: 'llama-3.1-8b-instant' },
                { family: 'gemini', id: 'gemini-2.5-flash-lite' },
                { family: 'gemini', id: 'gemini-2.5-flash' }
            ];

            const classifierPrompt = `Tu es un trieur d'intention ultra-rapide pour un assistant WhatsApp.
Ta mission: Classer la demande de l'utilisateur entre 'STANDARD' (conversation banale, salutations, remerciements, petites blagues, questions sans besoin d'outils) ou 'AGENTIC' (besoin d'outils, recherche web, action sur le groupe, synthèse vocale, vision, calculs, ou RÉACTION par emoji).

Exemples:
- 'STANDARD': "Salut", "Comment ça va ?", "Merci beaucoup", "Lol", "Tu es qui ?".
- 'AGENTIC': "Cherche sur le web...", "Réagis avec un ✨", "Réagis à ça avec 💖", "Bannis @user", "Lis ce texte vocalement".

Réponds UNIQUEMENT par l'un des deux mots en majuscules sans ponctuation.`;

            // Utiliser le premier routeur rapide dispo
            for (const candidate of fastModels) {
                if (providerRouter.isAvailable(candidate.family)) {
                    console.log(`[Classifier] 🎯 Classification via ${candidate.id}...`);
                    try {
                        const response = await providerRouter.chat([
                            { role: 'system', content: classifierPrompt },
                            { role: 'user', content: text }
                        ], { model: candidate.id, family: candidate.family });

                        const result = response.content?.trim().toUpperCase();
                        if (result === 'STANDARD' || result === 'AGENTIC') {
                            console.log(`[Classifier] ✓ Résultat: ${result}`);
                            return result;
                        }
                    } catch (e) {
                        console.warn(`[Classifier] ⚠️ Échec ${candidate.id}, essai suivant...`);
                    }
                }
            }

            // Fallback si tout échoue
            return text.length < 50 ? 'STANDARD' : 'AGENTIC';
        } catch (error) {
            console.error('[Classifier] ❌ Erreur fatale classification:', error.message);
            return 'AGENTIC'; // Sécurité
        }
    }

    /**
     * Construit le contexte pour le prompt
     */
    async _buildContext(chatId, message, shortTermContext = []) {
        // DTC Phase 1: Utilisation des nouveaux services unifiés via DI
        // 1. Récupération des services
        const userService = container.get('userService');
        const groupService = container.get('groupService');

        // 2. Récupération du profil utilisateur via userService
        const senderProfile = await userService.getProfile(message.sender);

        // 3. Récupération du contexte groupe via groupService
        const socialData = await groupService.getContext(chatId, message.sender, senderProfile);

        // [SCOPING FIX] Déclaration des variables au niveau global de la fonction pour accès ultérieur (Consciousness block)
        const adminService = container.get('adminService');
        const isSuperUser = await adminService.isSuperUser(message.sender);
        const isGlobalAdmin = await adminService.isGlobalAdmin(message.sender);
        let groupMembers = [];
        let isBotAdmin = false; // [SCOPING FIX]

        // 3. Construction du bloc de texte "Social Awareness"
        let socialBlock = "";

        if (socialData.type === 'GROUP' && socialData.group) {
            const g = socialData.group;
            const senderName = socialData.sender.names[0] || "Inconnu";

            // DEBUG: Afficher le statut authority de l'expéditeur
            console.log(`[DEBUG Authority] Sender: ${message.sender}`);
            console.log(`[DEBUG Authority] isSuperUser: ${isSuperUser}, isGlobalAdmin: ${isGlobalAdmin}, isGroupAdmin: ${socialData.senderIsAdmin}`);
            console.log(`[DEBUG Authority] AdminCache size: ${adminService.getCacheSize()}`);

            // NOTE: groupMembers sera rempli plus bas si disponible dans socialData ou transport
            if (socialData.participants) {
                // Adapter format si besoin (dépend de ce que groupService renvoie)
                // groupService.getContext renvoie group + sender stats, mais pas necessarily members list complete in 'participants'
                // On va utiliser le cache transport si dispo ou socialData s'il l'a
                // Pour l'instant on initialise juste, le code existant plus bas (que je ne vois pas dans ce snippet mais qui doit exister) va l'utiliser
                // Ah, je dois m'assurer que 'groupMembers' est bien assigné.
            }

            let senderStatus = socialData.senderIsAdmin ? "ADMINISTRATEUR DU GROUPE" : "Membre";

            if (isSuperUser && socialData.senderIsAdmin) {
                senderStatus = "👑 [SUPREME AUTHORITY] (SuperUser + Admin)";
            } else if (isSuperUser) {
                senderStatus = "👑 [SuperUser]";
            }

            const familiarity = socialData.sender.interaction_count > 50 ? "Très familier" : (socialData.sender.interaction_count > 10 ? "Connu" : "Nouveau");

            // DTC Phase 1: Distinguer description WhatsApp et mission bot
            const whatsappDesc = g.description || "Aucune description";
            const botMission = g.bot_mission || "Aucune mission définie";

            // Liste des admins WhatsApp du groupe - récupérer leurs noms depuis userService
            // Identifier le JID ET le LID du bot
            const botJid = this.transport.sock?.user?.id;
            const botLid = this.transport.sock?.user?.lid;
            const botPhoneId = botJid?.split(':')[0]?.split('@')[0];
            const botLidId = botLid?.split(':')[0]?.split('@')[0];

            // Fonction helper pour détecter si un JID est le bot
            const isBotJid = (jid) => {
                const id = jid.split('@')[0];
                return (botPhoneId && id.includes(botPhoneId)) ||
                    (botLidId && id.includes(botLidId));
            };

            // Phase Social Graph: Récupérer les membres connus (Cache Redis) AVANT pour aider à la résolution
            // [SCOPING FIX] Utilisation de la variable externe (pas de const)
            groupMembers = await groupService.getGroupMembers(chatId);

            // [SCOPING FIX] Calcul isBotAdmin ici car isBotJid est dispo ici
            isBotAdmin = groupMembers.find(m => isBotJid(m.jid))?.isAdmin || false;

            let adminList = "Aucun admin détecté";
            if (g.admins && g.admins.length > 0) {
                // Récupérer les profils de tous les admins en parallèle
                const adminProfiles = await Promise.all(
                    g.admins.map(async (jid) => {
                        const adminId = jid.split('@')[0];

                        // Si c'est le bot (via phone OU lid), dire "moi"
                        if (isBotJid(jid)) {
                            return "moi (Erina)";
                        }

                        // 1. Chercher dans la DB (User Service)
                        const profile = await userService.getProfile(jid);
                        let name = profile.names[0];

                        // 2. Fallback: Chercher dans le cache Redis du groupe (Noms WhatsApp actuels)
                        if (!name || name === 'Inconnu') {
                            const cachedMember = groupMembers.find(m => m.jid === jid || m.jid === profile.jid);
                            if (cachedMember && cachedMember.name) {
                                name = cachedMember.name;
                            }
                        }

                        if (name && name !== 'Inconnu') {
                            return `${name} (@${adminId})`; // Nom avec numéro
                        } else {
                            // Fallback final: Admin Inconnu avec numéro
                            return `Admin (@${adminId})`;
                        }
                    })
                );
                adminList = adminProfiles.join(', ');
            }

            // Gestion des mentions explicités (Pour éviter l'hallucination)
            let mentionBlock = "";
            if (message.mentionedJids && message.mentionedJids.length > 0) {
                const mentionedProfiles = await Promise.all(
                    message.mentionedJids.map(async (jid) => {
                        // Si c'est le bot lui-même
                        if (isBotJid(jid)) {
                            return `- ${persona.name} (C'est moi !)`;
                        }

                        // 1. DB
                        const profile = await userService.getProfile(jid);
                        let name = profile.names[0];

                        // 2. Fallback Cache
                        if (!name || name === 'Inconnu') {
                            const cached = groupMembers.find(m => m.jid === jid);
                            if (cached?.name) name = cached.name;
                        }

                        // Fallback final
                        if (!name || name === 'Inconnu') name = `Inconnu`;

                        // Extraire le numéro de téléphone du JID
                        const phoneNumber = jid.split('@')[0];

                        return `- ${name} (@${phoneNumber})`;
                    })
                );

                const validMentions = mentionedProfiles.filter(Boolean);
                if (validMentions.length > 0) {
                    mentionBlock = `\n### 🗣️ UTILISATEURS MENTIONNÉS (Focus)\nCes utilisateurs sont cités dans le message :\n${validMentions.join('\n')}\nUtilise ces noms si on te demande "qui est @..."\n`;
                }
            }

            // Global Admins du bot - TOUJOURS chercher le nom réel via userService d'abord
            // Global Admins du bot - TOUJOURS chercher le nom réel via userService d'abord
            const globalAdminsList = await adminService.listAdmins();
            let globalAdminsFormatted = "Aucun";
            if (globalAdminsList.length > 0) {
                const globalAdminNames = await Promise.all(
                    globalAdminsList.map(async (admin) => {
                        const adminId = admin.jid.split('@')[0];

                        // Si c'est le bot, dire "moi"
                        if (isBotJid(admin.jid)) {
                            return "moi (Erina)";
                        }

                        // PRIORITÉ 1: Chercher le nom réel dans userService
                        // PRIORITÉ 1: Chercher le nom réel dans userService
                        const profile = await userService.getProfile(admin.jid);
                        const realName = profile.names[0];
                        if (realName && realName !== 'Inconnu') {
                            return `${realName} (@${adminId})`; // Nom avec numéro
                        }

                        // PRIORITÉ 2: Fallback sur le nom Supabase (ex: "Admin Principal")
                        if (admin.name && admin.name !== 'Inconnu') {
                            return `${admin.name} (@${adminId})`;
                        }

                        // Fallback final
                        return `Admin (@${adminId})`;
                    })
                );
                globalAdminsFormatted = globalAdminNames.join(', ');
            }

            // Vérifier si l'interlocuteur est un global admin (déjà calculé plus haut)
            const senderGlobalStatus = isGlobalAdmin ? " + SUPER-ADMIN DU BOT" : "";

            // [VIBE CODING] Récupérer l'état de conscience global
            const globalState = await consciousness.getGlobalState(chatId, message.sender);
            const currentMood = globalState.emotionalState.mood;
            const currentAnnoyance = globalState.emotionalState.annoyance;

            socialBlock = `
### 🌍 CONTEXTE SOCIAL (Temps Réel)
- **Lieu** : Groupe "${g.name}"
- **Description WhatsApp** : "${whatsappDesc}"
- **Mission Bot** : "${botMission}"
- **Membres** : ~${g.member_count} personnes.
- **Admins du groupe (WhatsApp)** : ${adminList}
- **Super-Admins du Bot (niveau global, peuvent contrôler ${persona.name})** : ${globalAdminsFormatted}
- **Interlocuteur** : ${senderName}
- **Statut** : ${senderStatus}${senderGlobalStatus}
- **Historique relationnel** : ${familiarity} (${socialData.sender.interaction_count} interactions)
`;
            // Phase Social Graph: Ajouter la liste des membres connus pour résolution Nom→JID
            // Phase Social Graph: Ajouter la liste des membres connus pour résolution Nom→JID
            // (groupMembers déjà récupéré plus haut)

            // DEBUG: Afficher les membres et leur statut admin
            console.log(`[DEBUG Social] Membres dans le cache: ${groupMembers.length}`);
            console.log(`[DEBUG Social] Admins détectés:`, groupMembers.filter(m => m.isAdmin).map(m => m.jid));

            if (groupMembers.length > 0) {
                const membersList = await Promise.all(
                    groupMembers.slice(0, 25).map(async (m) => {
                        // Ignorer le bot
                        if (isBotJid(m.jid)) return null;

                        const profile = await userService.getProfile(m.jid);
                        let name = profile.names[0];

                        // Fallback Cache
                        if ((!name || name === 'Inconnu') && m.name) {
                            name = m.name;
                        }

                        // Extraire le numéro de téléphone
                        const phoneNumber = m.jid.split('@')[0];

                        if (name && name !== 'Inconnu') {
                            const role = m.isAdmin ? '👑' : '';
                            return `${role}${name} (@${phoneNumber})`;
                        }

                        // Si pas de nom, utiliser "Membre" avec le numéro
                        return `Membre (@${phoneNumber})`;
                    })
                );
                const knownMembers = membersList.filter(Boolean);

                // DEBUG: Afficher ce qui sera envoyé à l'IA
                console.log(`[DEBUG Social] Membres envoyés à l'IA: ${knownMembers.join(', ')}`);

                if (knownMembers.length > 0) {
                    socialBlock += `- **Membres connus (tu peux les mentionner par nom)** : ${knownMembers.join(', ')}\n`;
                }
            }
        } else {
            // Mode Privé
            const senderName = socialData.sender.names[0] || "Inconnu";
            const isGlobalAdmin = adminService.isGlobalAdmin(message.sender);
            const senderGlobalStatus = isGlobalAdmin ? " (SUPER-ADMIN DU BOT)" : "";

            // Global Admins du bot
            const globalAdminsList = await adminService.listAdmins();
            const globalAdminsFormatted = globalAdminsList.length > 0
                ? globalAdminsList.map(a => a.name || `+${a.jid.split('@')[0]}`).join(', ')
                : "Aucun";

            socialBlock = `
### 👤 CONTEXTE PRIVÉ
- **Interlocuteur** : ${senderName}${senderGlobalStatus}
- **Intensité relationnelle** : ${socialData.sender.interaction_count} messages échangés.
- **Super-Admins du Bot** : ${globalAdminsFormatted}
`;
        }

        // Récupérer les faits et la mémoire
        // IMPORTANT: Utiliser message.sender (userJid) car les faits sont stockés par utilisateur, pas par chat
        const facts = await factsMemory.format(message.sender);

        // 4. RAG: Recherche sémantique de souvenirs pertinents basés sur le message actuel
        let ragContext = '';
        try {
            const memory = container.get('memory');
            const relevantMemories = await memory.recall(chatId, message.text, 3);
            if (relevantMemories?.length > 0) {
                ragContext = relevantMemories
                    .map(m => `- ${m.content}`)
                    .join('\n');
                console.log(`[RAG] ${relevantMemories.length} souvenir(s) pertinent(s) trouvé(s)`);
            }
        } catch (e) {
            console.warn('[RAG] Erreur recherche:', e.message);
        }

        // On remplace le "recentContext" de Supabase par celui de Redis
        const recentContext = shortTermContext
            .map(m => `[${m.role}]: ${m.content}`)
            .join('\n');

        // Construire le system prompt
        let prompt = systemPrompt
            .replace('{{name}}', persona.name)
            .replace('{{role}}', persona.role)
            .replace('{{traits}}', persona.traits?.join(', ') || '')
            .replace('{{languages}}', persona.languages?.join(', ') || 'fr')
            .replace('{{interests}}', persona.interests?.join(', ') || '');

        const now = new Date();
        const timeBlock = `
### 📅 TEMPS RÉEL
- **Date actuelle** : ${now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- **Heure** : ${now.toLocaleTimeString('fr-FR')}
- **Conscience Temporelle** : Tu es conscient de cette date. Si tes connaissances s'arrêtent avant 2026, pars du principe qu'elles sont peut-être obsolètes pour les sujets tech/news.
`;

        // Ajout du bloc temporel et social
        prompt += `\n${timeBlock}\n${socialBlock}\n`;

        // [LEVEL 5] Injection des Leçons Apprises (Auto-Réflexion)
        try {
            const { dreamService } = await import('../services/dreamService.js');
            const lessons = dreamService.getLessons();
            if (lessons) {
                prompt += `\n### 🎓 LEÇONS APPRISES (Auto-Réflexion)\n${lessons}\n`;
            }
        } catch (e) {
            console.warn('[Core] Erreur injection leçons:', e.message);
        }

        // ==================================================================================
        // PROJET CONSCIENCE (GLOBAL WORKSPACE)
        // ==================================================================================

        // 1. Récupération de l'état global de la conscience
        const globalState = await consciousness.getGlobalState(chatId, message.sender);

        // 2. Calcul de l'Autorité (Social Reality)
        const authorityLevel = isSuperUser ? "DIVIN (SuperUser)" : (isGlobalAdmin ? "SUPREME (Global Admin)" : (socialData.senderIsAdmin ? "GOUVERNEUR (Group Admin)" : "CITOYEN (Membre)"));
        // isBotAdmin est déjà calculé plus haut
        const botAuthority = isBotAdmin ? "ADMINISTRATEUR (Droit de sanction)" : "MEMBRE (Observateur)";

        let consciousnessBlock = `
### 🧠 ÉTAT DE CONSCIENCE (GLOBAL WORKSPACE)
- **Identité** : Je suis ${globalState.identity.name} (${globalState.uptime}s uptime).
- **Situation Sociale** : Je suis ${botAuthority} face à un ${authorityLevel}.
`;

        // 3. Injection Émotionnelle
        const { annoyance, mood } = globalState.emotionalState;
        if (annoyance > 0) {
            consciousnessBlock += `- **État Émotionnel** : ${mood} (Niveau Agacement: ${annoyance}/100)\n`;
            if (annoyance > 50 && isBotAdmin) {
                if (!isSuperUser && !isGlobalAdmin && !socialData.senderIsAdmin) {
                    consciousnessBlock += `⚠️ **VOLONTÉ ACTIVE** : Cet utilisateur t'agace. Tu as le pouvoir et la volonté de le sanctionner (Kick/Warn/Mute/Lock). Fais-le si nécessaire.\n`;
                } else {
                    consciousnessBlock += `ℹ️ **Retenue** : Tu es agacé par un Supérieur. Tu ne peux pas agir.\n`;
                }
            }
        } else {
            consciousnessBlock += `- **État Émotionnel** : ${mood} (Serein)\n`;
        }

        // 4. Mission (Intentionality)
        if (globalState.mission) {
            consciousnessBlock += `
### 🎯 MISSION ACTIVE
- **Titre** : ${globalState.mission.title}
- **Objectif** : ${globalState.mission.description}
- **Consigne** : Tes actions doivent servir cette mission.
`;
        }

        prompt += consciousnessBlock + '\n';
        // ==================================================================================
        // ==================================================================================

        if (facts) {
            prompt = prompt.replace('{{memory}}', facts);
        } else {
            prompt = prompt.replace(/{{#if memory}}[\s\S]*?{{\/if}}/g, '');
        }

        if (recentContext) {
            prompt = prompt.replace('{{recentContext}}', recentContext);
        } else {
            prompt = prompt.replace(/{{#if recentContext}}[\s\S]*?{{\/if}}/g, '');
        }

        // Ajout du bloc RAG (souvenirs sémantiques pertinents)
        if (ragContext) {
            prompt += `\n### 🧠 SOUVENIRS PERTINENTS (de conversations passées)\n${ragContext}\n`;
        }

        // Nettoyer les placeholders restants
        prompt = prompt.replace(/{{#each.*?}}[\s\S]*?{{\/each}}/g, '');
        prompt = prompt.replace(/{{.*?}}/g, '');

        // Ajouter la liste des outils
        const tools = pluginLoader.list();
        if (tools.length) {
            prompt += '\n\nOUTILS DISPONIBLES:\n' +
                tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
        }

        return {
            systemPrompt: prompt,
            history: [],
            // [FIX] Export authority info for moralCompass usage
            authority: {
                isSuperUser,
                isGlobalAdmin,
                isGroupAdmin: socialData.senderIsAdmin,
                isBotAdmin,
                level: isSuperUser ? 100 : (isGlobalAdmin ? 80 : (socialData.senderIsAdmin ? 50 : 0))
            }
        };
    }

    /**
     * (Module 3) Vérification de la Roadmap au premier message
     */
    async _checkRoadmap(chatId, isGroup) {
        if (!isGroup) return;

        const config = await db.getGroupConfig(chatId);
        // Si pas de config ou description vide, on lance le prompt d'initialisation
        if (!config || !config.description) {
            // On vérifie si on a déjà demandé récemment (pour éviter le spam) dans workingMemory ou logs
            // Pour l'instant on le fait simplement :
            await this.transport.sendText(chatId, "⚠️ *Configuration Requise*\nJe n'ai pas de feuille de route pour ce groupe. Quel est notre objectif ici ? (Répondez pour définir la mission)");

            // On pourrait créer une entrée temporaire pour marquer qu'on a demandé
            await db.upsertGroupConfig(chatId, { description: "EN_ATTENTE" });
        }
    }

    /**
     * Exécute un outil avec Graceful Degradation et Mémoire Épisodique
     * Les erreurs sont capturées et retournées à l'IA au lieu de faire crasher le flow
     * Toutes les actions sont loguées pour apprentissage (Episodic Memory)
     */
    async _executeTool(toolCall, message) {
        const { name, arguments: argsJson } = toolCall.function;

        let args;
        try {
            args = JSON.parse(argsJson);
        } catch (parseErr) {
            console.error(`[Core] ❌ Erreur parsing arguments pour ${name}:`, parseErr.message);

            // Log l'échec de parsing
            await agentMemory.logAction(
                message.chatId,
                name,
                { raw: argsJson },
                null,
                'error',
                `Parse error: ${parseErr.message}`
            );

            return {
                success: false,
                message: `ERREUR_OUTIL: Impossible de parser les arguments pour "${name}". Arguments invalides.`,
                error: parseErr.message,
                gracefulDegradation: true
            };
        }

        const context = {
            transport: this.transport,
            message,
            chatId: message.chatId,
            sender: message.sender
        };

        // [AGENTIC] Vérifier si cet outil a récemment échoué (éviter répétition)
        const recentFailure = await agentMemory.hasRecentFailure(message.chatId, name, 15);
        if (recentFailure.hasFailure) {
            console.warn(`[Core] ⚠️ Outil "${name}" a échoué récemment: ${recentFailure.errorMessage}`);
            // On continue quand même mais on log l'avertissement
        }

        try {
            const result = await pluginLoader.execute(name, args, context);

            // [AGENTIC] Log succès dans la mémoire épisodique
            await agentMemory.logAction(
                message.chatId,
                name,
                args,
                typeof result === 'object' ? result : { response: result },
                'success',
                null
            );

            return result;
        } catch (execErr) {
            // Graceful Degradation: On retourne l'erreur à l'IA au lieu de crasher
            console.error(`[Core] ⚠️ Graceful Degradation - Outil "${name}" a échoué:`, execErr.message);

            // Classifier le type d'erreur pour un message plus utile à l'IA
            let errorType = 'ERREUR_INTERNE';
            let userFriendlyMsg = execErr.message;

            if (execErr.message.includes('timeout') || execErr.message.includes('Timeout')) {
                errorType = 'TIMEOUT';
                userFriendlyMsg = 'Le service a mis trop de temps à répondre';
            } else if (execErr.message.includes('network') || execErr.message.includes('fetch')) {
                errorType = 'ERREUR_RESEAU';
                userFriendlyMsg = 'Impossible de joindre le service externe';
            } else if (execErr.message.includes('401') || execErr.message.includes('403')) {
                errorType = 'ERREUR_AUTH';
                userFriendlyMsg = 'Problème d\'authentification avec le service';
            } else if (execErr.message.includes('404')) {
                errorType = 'NON_TROUVE';
                userFriendlyMsg = 'La ressource demandée n\'existe pas';
            } else if (execErr.message.includes('rate') || execErr.message.includes('limit')) {
                errorType = 'RATE_LIMIT';
                userFriendlyMsg = 'Trop de requêtes, réessayer plus tard';
            }

            // [AGENTIC] Log échec dans la mémoire épisodique
            await agentMemory.logAction(
                message.chatId,
                name,
                args,
                null,
                'error',
                `[${errorType}] ${execErr.message}`
            );

            return {
                success: false,
                message: `ERREUR_OUTIL [${errorType}]: L'outil "${name}" a échoué - ${userFriendlyMsg}. Tu peux expliquer à l'utilisateur que cette fonctionnalité est temporairement indisponible et continuer avec les autres demandes.`,
                error: execErr.message,
                errorType: errorType,
                gracefulDegradation: true
            };
        }
    }

    /**
     * Génère un refus humanisé
     */
    async _generateRefusal(originalMessage, reason) {
        // Construction du prompt via le template chargé
        let prompt = refusalPrompt
            .replace('{{name}}', persona.name)
            .replace('{{reason}}', reason)
            .replace('{{role}}', persona.role || 'Assistant');

        const response = await providerRouter.chat([
            {
                role: 'system',
                content: prompt
            },
            { role: 'user', content: originalMessage }
        ], { temperature: 0.9, family: 'google' }); // Optimisation : on force Google pour les tâches simples (rapide/gratuit)

        return response.content;
    }

    /**
     * Reformule le résultat d'un outil
     * @param {string} originalMessage - Message original de l'utilisateur
     * @param {string} result - Résultat de l'outil
     * @param {string} [family] - Family du provider à utiliser (pour maintenir la cohérence)
     */
    async _reformulateResult(originalMessage, result, family = null) {
        const response = await providerRouter.chat([
            {
                role: 'system',
                content: `Tu es ${persona.name}. Formule une réponse naturelle basée sur ce résultat: ${result}. Sois concis.`
            },
            { role: 'user', content: originalMessage }
        ], {
            temperature: 0.7,
            // Forcer le même provider pour la cohérence du contexte
            ...(family && { family })
        });

        return response.content;
    }

    // ========================================================================
    // NOTE: _parseTextCommand a été supprimé (Phase 1 - Découplage)
    // Les patterns textuels sont maintenant déclarés dans chaque plugin via textMatchers
    // Voir: pluginLoader.findTextHandler() dans plugins/loader.js
    // ========================================================================

    /**
     * Délai naturel pour simuler la frappe
     */
    async _naturalDelay() {
        const delay = 1000 + Math.random() * 1500;
        await new Promise(r => setTimeout(r, delay));
    }

    /**
     * Gère les événements de groupe (Module 3 & 2)
     */
    async _handleGroupEvent(event) {
        const { groupId, participants, action } = event.data;

        // DTC Phase 1: Invalider le cache Redis sur les événements critiques
        if (['promote', 'demote', 'remove'].includes(action)) {
            await groupService.invalidateCache(groupId);
        }

        // **NOUVEAU: Tracking des événements membres dans la base**
        for (const participant of participants) {
            try {
                // Enregistrer l'événement dans l'historique
                await db.recordMemberEvent(groupId, participant, action);

                // Si c'est un ajout, vérifier si l'utilisateur a déjà quitté
                if (action === 'add') {
                    const hasLeftBefore = await db.hasLeftBefore(groupId, participant);
                    if (hasLeftBefore) {
                        const username = participant.split('@')[0];
                        console.log(`[GroupEvent] 🔄 Utilisateur ${username} a rejoint à nouveau`);

                        // Optionnel: Notifier le groupe
                        await this.transport.sendText(
                            groupId,
                            `👀 @${username} est de retour dans le groupe!`,
                            { mentions: [participant] }
                        );
                    }
                }
            } catch (error) {
                // Tentative de récupération si le groupe n'existe pas en DB (FK Violation)
                if (error?.code === '23503' || error?.message?.includes('foreign key constraint')) {
                    console.log('[GroupEvent] 🔄 Groupe inconnu en DB, synchronisation d\'urgence...');
                    try {
                        const metadata = await this.transport.sock.groupMetadata(groupId);
                        await groupService.updateGroup(groupId, metadata);

                        // Retry l'insertion
                        await db.recordMemberEvent(groupId, participant, action);
                        console.log('[GroupEvent] ✓ Synchronisation et tracking réussis');
                    } catch (syncError) {
                        console.error('[GroupEvent] Échec récupération sync:', syncError);
                    }
                } else {
                    console.error('[GroupEvent] Erreur tracking:', error);
                }
            }
        }

        // Gestionnaire spécifique pour les arrivées (Welcome)
        if (action === 'add') {
            await this._handleGroupWelcome(event);

            // **NOUVEAU: Définir le fondateur si c'est la première fois**
            try {
                const founder = await db.getGroupFounder(groupId);
                if (!founder) {
                    // Récupérer les métadonnées du groupe pour identifier le créateur
                    const metadata = await this.transport.sock.groupMetadata(groupId);
                    const creatorJid = metadata.owner || metadata.subjectOwner;

                    if (creatorJid) {
                        await db.setGroupFounder(groupId, creatorJid);
                        console.log(`[GroupEvent] ✓ Fondateur défini: ${creatorJid}`);
                    }
                }
            } catch (error) {
                console.error('[GroupEvent] Erreur définition fondateur:', error);
            }
        }

        // Logs basiques pour les autres actions
        const messages = {
            remove: `👋 Au revoir @${participants[0].split('@')[0]}...`,
            promote: `🎉 Félicitations @${participants[0].split('@')[0]} est maintenant admin !`,
            demote: `📉 @${participants[0].split('@')[0]} n'est plus admin.`
        };

        if (messages[action]) {
            await this.transport.sendText(groupId, messages[action], {
                mentions: participants
            });
        }
    }

    /**
     * Gère une tâche planifiée
     */
    async _handleScheduledJob(event) {
        console.log(`[Scheduler] Exécution job: ${event.job}`);

        // À implémenter selon le job
        switch (event.job) {
            case 'dailyGreeting':
                // Envoyer un message matinal aux groupes actifs
                break;

            case 'spontaneousReflection':
                console.log('[Scheduler] 🤔 Réflexion Spontanée (Goal Seeking)...');

                // 1. Identifier les groupes inactifs (Morts depuis 3h+)
                // On exclut la nuit (22h - 9h) pour ne pas spammer
                const hour = new Date().getHours();
                if (hour < 9 || hour >= 22) return;

                const inactiveGroups = await workingMemory.getInactiveGroups(180); // 3 heures

                for (const groupId of inactiveGroups) {
                    console.log(`[GoalSeeking] 💀 Groupe inactif détecté : ${groupId}`);

                    // 2. Vérifier si on doit intervenir (Random check pour ne pas être robotique)
                    if (Math.random() > 0.3) continue; // 30% de chance d'intervenir par cycle

                    // 3. Simuler un message système pour déclencher la boucle cognitive
                    // On injecte une pensée comme si elle venait de l'intérieur
                    const fakeContext = {
                        isGroup: true,
                        chatId: groupId,
                        text: "SYSTEM_WAKEUP_PROTOCOL: The group is inactive. Generate a thought to wake it up politely or with a controversial topic about tech/AI.",
                        senderName: "SYSTEM",
                        sender: "system@internal"
                    };

                    await this._handleMessage({ data: fakeContext });
                }
                break;

            case 'spontaneousReflection':
                // [AGENTIC] Réflexion Spontanée
                // Le bot "pense" à voix haute dans les logs et peut décider d'agir
                console.log('[Agent] 🧘 Réflexion spontanée déclenchée...');
                // TODO: Implémenter la logique de scan des tâches en attente ou ping users inactifs
                // Pour l'instant on log juste pour vérifier le heartbeat cognitive
                break;

            case 'reminderCheck':
                // Vérifier et envoyer les rappels
                const reminders = await db.getPendingReminders();
                for (const reminder of reminders) {
                    // Check if it's a COMMAND payload
                    if (reminder.message.startsWith('COMMAND:BAN_USER:')) {
                        try {
                            // Syntax: COMMAND:BAN_USER:{jid}|Reason
                            const payload = reminder.message.replace('COMMAND:BAN_USER:', '');
                            const [targetJid, reason] = payload.split('|');

                            console.log(`[Scheduler] 🚀 Exécution BAN planifié pour ${targetJid}`);

                            // Execute ban via transport directly (simpler than invoking plugin execute)
                            await this.transport.banUser(reminder.chat_id, targetJid);

                            // Send confirmation
                            await this.transport.sendText(
                                reminder.chat_id,
                                `🚫 **Ban planifié exécuté**\nUtilisateur: @${targetJid.split('@')[0]}\nRaison: ${reason || 'Aucune'}`
                            );
                        } catch (err) {
                            console.error(`[Scheduler] ❌ Erreur exécution BAN planifié: ${err.message}`);
                            await this.transport.sendText(
                                reminder.chat_id,
                                `⚠️ Échec du ban planifié pour @${reminder.message.split(':')[2]?.split('|')[0] || '?'} : ${err.message}`
                            );
                        }
                    } else {
                        // Standard reminder
                        await this.transport.sendText(
                            reminder.chat_id,
                            `⏰ Rappel: ${reminder.message}`
                        );
                    }

                    await db.markReminderSent(reminder.id);
                }
                break;

            case 'memoryConsolidation':
                console.log('[Scheduler] 🧶 Consolidation de la mémoire et Tissage du savoir...');
                try {
                    // 1. Récupérer les chats actifs récemment depuis Redis
                    const { redis } = await import('../services/redisClient.js');
                    const keys = await redis.keys('chat:*:context');
                    const chatIds = keys.map(k => k.split(':')[1]);

                    if (chatIds.length === 0) {
                        console.log('[Scheduler] Aucun chat actif à consolider.');
                        break;
                    }

                    console.log(`[Scheduler] Consolidation de ${chatIds.length} chats...`);
                    const consolidationService = container.get('consolidationService');

                    for (const chatId of chatIds) {
                        // Consolidation asynchrone pour ne pas bloquer le scheduler
                        consolidationService.consolidate(chatId).catch(err =>
                            console.error(`[Scheduler] Erreur consolidation ${chatId}:`, err.message)
                        );
                    }
                } catch (e) {
                    console.error('[Scheduler] Erreur globale consolidation:', e.message);
                }
                break;

            case 'cognitiveDream':
                console.log('[Scheduler] 💤 Le bot entre en phase de rêve (Auto-Reflection)...');
                try {
                    const dreamService = container.get('dream');
                    if (dreamService) {
                        await dreamService.dream();
                    }
                } catch (e) {
                    console.error('[Scheduler] Erreur pendant le rêve:', e.message);
                }
                break;

            case 'memoryCleanup':
                console.log('[Scheduler] 🧹 Nettoyage mémoire sémantique...');
                try {
                    // Récupérer les chats avec beaucoup de messages stockés
                    const { supabase } = await import('../services/supabase.js');
                    const { data: heavyChats } = supabase ? await supabase
                        .from('semantic_memory')
                        .select('chat_id')
                        .limit(100) : { data: [] };

                    if (heavyChats?.length > 0) {
                        // Extraire les chat_ids uniques
                        const uniqueChatIds = [...new Set(heavyChats.map(m => m.chat_id))];
                        console.log(`[Scheduler] ${uniqueChatIds.length} chat(s) à nettoyer`);

                        for (const chatId of uniqueChatIds) {
                            // Cleanup additionnel si nécessaire
                            const memory = container.get('memory');
                            await memory.cleanup(chatId, 100);
                        }
                    }
                    console.log('[Scheduler] ✅ Nettoyage mémoire terminé');
                } catch (error) {
                    console.error('[Scheduler] Erreur memoryCleanup:', error.message);
                }
                break;

            case 'tempCleanup':
                console.log('[Scheduler] 🧹 Nettoyage fichiers temporaires...');
                try {
                    const { CleanupService } = await import('../services/cleanup.js');
                    const cleanup = new CleanupService();
                    await cleanup.run();
                } catch (err) {
                    console.error('[Scheduler] Erreur tempCleanup:', err.message);
                }
                break;
        }

        eventBus.publish(BotEvents.JOB_COMPLETED, { job: event.job });
    }

    /**
     * Gère les déclencheurs proactifs
     */
    /**
     * Gère la réponse proactive
     */
    async _handleProactive(event) {
        // ... (code existant)
        // Réponse proactive sur keyword détecté
        const { chatId, text } = event.data;

        const response = await providerRouter.chat([
            {
                role: 'system',
                content: `Tu es ${persona.name}. Interviens de façon naturelle sur ce sujet qui t'intéresse. Sois bref et apporte de la valeur.`
            },
            { role: 'user', content: text }
        ]);

        await this._naturalDelay();
        await this.transport.sendText(chatId, response.content);
    }

    /**
     * Gère l'arrêt d'urgence du bot (.shutdown)
     * Format: .shutdown [duration] (ex: .shutdown 2h)
     */
    async _handleShutdown(message) {
        const { sender, chatId, text } = message;

        // DTC Phase 1: Vérification Admin Global via adminService (Supabase)
        if (!adminService.isGlobalAdmin(sender)) {
            console.log(`[Security] Tentative de shutdown non autorisée par ${sender}`);
            // Pas de réponse pour ne pas révéler la commande
            return;
        }

        console.log(`[Security] Shutdown demandé par ${sender}`);

        // Analyse de la durée (.shutdown 2h, .shutdown 30m)
        const args = text.split(' ');
        const durationStr = args[1];
        let shutdownUntil = null;

        if (durationStr) {
            const match = durationStr.match(/^(\d+)([hm])$/);
            if (match) {
                const amount = parseInt(match[1]);
                const unit = match[2];
                const ms = amount * (unit === 'h' ? 3600000 : 60000);
                shutdownUntil = Date.now() + ms;
            }
        }

        // Message d'adieu
        const goodbye = shutdownUntil
            ? `😴 Je fais une sieste de ${durationStr}. À tout à l'heure !`
            : `👋 Arrêt du système demandé. Au revoir !`;

        await this.transport.sendText(chatId, goodbye);

        // Créer le fichier de verrouillage si temporaire
        if (shutdownUntil) {
            writeFileSync(join(__dirname, '..', '.shutdown_lock'), shutdownUntil.toString());
        }

        // Laisser le temps au message de partir
        setTimeout(() => {
            console.log('🛑 Arrêt du processus.');
            process.exit(0);
        }, 2000);
    }

    // ======== OPTION B: EXTRACTION AUTOMATIQUE DE FAITS ========

    /**
     * Extrait automatiquement les faits importants d'un message
     * Fonctionne en arrière-plan sans bloquer la réponse
     * @param {string} text - Texte du message utilisateur
     * @param {string} userJid - JID de l'utilisateur
     */
    async _extractFacts(text, userJid) {
        // Ne pas traiter les messages trop courts ou les commandes
        if (!text || text.length < 10 || text.startsWith('.') || text.startsWith('/')) {
            return;
        }

        // Patterns pour détecter les informations personnelles
        const patterns = [
            // Nom
            { regex: /(?:je (?:m'appelle|suis|me nomme))\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/i, key: 'nom' },
            // Ville/Lieu
            { regex: /(?:j'habite|je vis|je suis)\s+(?:à|en|au)\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/i, key: 'ville' },
            // Métier
            { regex: /(?:je suis|je travaille comme)\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+)?)/i, key: 'métier' },
            // Age
            { regex: /(?:j'ai|j ai)\s+(\d{1,3})\s*ans/i, key: 'age' },
            // Anniversaire
            { regex: /(?:mon anniversaire|je suis né|née le)\s+(?:le\s+)?(\d{1,2}\s+\w+)/i, key: 'anniversaire' },
            // Préférence couleur
            { regex: /(?:ma couleur préférée|j'aime le|j'adore le)\s+(bleu|rouge|vert|jaune|noir|blanc|rose|violet|orange)/i, key: 'couleur_préférée' },
        ];

        const extractedFacts = [];

        // Extraction par patterns regex
        for (const { regex, key } of patterns) {
            const match = text.match(regex);
            if (match && match[1]) {
                const value = match[1].trim();
                // Éviter les faux positifs (valeurs trop courtes ou génériques)
                if (value.length >= 2 && !['un', 'une', 'le', 'la'].includes(value.toLowerCase())) {
                    extractedFacts.push({ key, value });
                }
            }
        }

        // Stocker les faits trouvés
        if (extractedFacts.length > 0) {
            console.log(`[Core] Faits extraits automatiquement: ${extractedFacts.length}`);

            for (const { key, value } of extractedFacts) {
                try {
                    await factsMemory.remember(userJid, key, value);
                    console.log(`  ✓ ${key}: ${value}`);
                } catch (err) {
                    console.error(`  ✗ Erreur stockage ${key}:`, err.message);
                }
            }
        }
    }
}

export const botCore = new BotCore();
export default botCore;
