// core/index.js
// Orchestrateur principal du bot - Cerveau central

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';

import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { orchestrator } from './orchestrator.js';
import { eventBus, BotEvents } from './events.js';
import { baileysTransport } from './transport/baileys.js';
import { pluginLoader } from '../plugins/loader.js';
import { providerRouter } from '../providers/index.js';
import { scheduler } from '../scheduler/index.js';
import { extractToolCallsFromText, parseToolArguments } from '../utils/toolCallExtractor.js';
import { isStorable } from '../utils/helpers.js';
import { startupDisplay } from '../utils/startup.js';

import { botIdentity } from '../utils/botIdentity.js';
import { extractNumericId, jidMatch, formatForDisplay } from '../utils/jidHelper.js';

// DTC Refactor: Inclusion du ServiceContainer
import { container } from './ServiceContainer.js';
import { cli } from './cli.js'; // Interface Ligne de Commande

// Group Manager (filtrage hybride)
let filterProcessor = null;
try {
    const groupManager = await import('../plugins/group_manager/index.js');
    filterProcessor = groupManager.default.processor;
} catch (e) {
    console.warn('[Core] Group Manager non chargé:', e.message);
}

// Refactoring: Import des handlers modulaires
import { SchedulerHandler, GroupHandler } from './handlers/index.js';
import { buildContext } from './context/contextBuilder.js';

// [THINK-FAST] Imports du nouveau système de réponse rapide
import { classifyLocally, isConfident } from '../services/ai/ReflexClassifier.js';
import { tieredContextLoader } from './context/TieredContextLoader.js';
import FastPathHandler from './handlers/FastPathHandler.js';

// DTC Phase 1: Les admins globaux sont maintenant dans Supabase via adminService
// Le chargement se fait de manière asynchrone dans init()

const __dirname = dirname(fileURLToPath(import.meta.url));

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

    // Getters pour accès facile aux services via container
    get db() { return container.get('supabase'); }
    get workingMemory() { return container.get('workingMemory'); }
    get consciousness() { return container.get('consciousness'); }
    get userService() { return container.get('userService'); }
    get groupService() { return container.get('groupService'); }
    get adminService() { return container.get('adminService'); }
    get agentMemory() { return container.get('agentMemory'); }
    get actionMemory() { return container.get('actionMemory'); }
    get factsMemory() { return container.get('facts'); }
    get semanticMemory() { return container.get('memory'); }
    get voiceProvider() { return container.get('voiceProvider'); }
    get quotaManager() { return container.get('quotaManager'); }

    /**
     * Initialise tous les composants
     */
    async init() {
        if (this.isReady) return;

        // Configuration dynamique des modules pour la barre de progression
        startupDisplay.setModules([
            { id: 'config', name: 'Configuration', icon: '⚙️' },
            { id: 'redis', name: 'Redis Cloud', icon: '🔴' },
            { id: 'supabase', name: 'Supabase DB', icon: '🗄️' },
            { id: 'plugins', name: 'Plugins', icon: '🔌' },
            { id: 'scheduler', name: 'Scheduler', icon: '⏰' },
            { id: 'reflection', name: 'Intelligence', icon: '🧠' },
            { id: 'transport', name: 'Connexion WhatsApp', icon: '📱' }
        ]);

        startupDisplay.showLogo();

        // 0. DTC Refactor: Initialiser le ServiceContainer (Config)

        startupDisplay.loading('config');
        try {
            await container.init();
            this.transport.setContainer(container); // Injecter le container dans le transport
            container.register('transport', this.transport); // [FIX] Enregistrer le transport pour TieredContextLoader
            tieredContextLoader.init(); // [FIX] Initialiser le chargeur de contexte explicitement
            startupDisplay.success('config');
        } catch (e) {
            startupDisplay.error('config', e.message);
        }

        // Redis & Supabase (via container)
        startupDisplay.loading('redis');
        try {
            const redisMemory = container.get('workingMemory');
            const redisHealth = await redisMemory.checkHealth();
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
            const supabaseService = container.get('supabase');
            // Test via checkHealth
            const supaHealth = await supabaseService.checkHealth();
            if (supaHealth.status === 'connected') {
                startupDisplay.success('supabase', 'service_role');
            } else {
                startupDisplay.error('supabase', supaHealth.error || 'non connecté');
            }
        } catch (e) {
            startupDisplay.error('supabase', e.message);
        }

        // 1. Charger les plugins

        startupDisplay.loading('plugins');
        try {
            const loadedPlugins = await pluginLoader.loadAll();

            // Sync check
            const syncStatus = await pluginLoader.checkSyncStatus(container.get('supabase'));
            let syncDetails = `${loadedPlugins?.size || 0} loaded`;

            if (syncStatus.deleted > 0 || syncStatus.new > 0 || syncStatus.modified > 0) {
                const parts = [];
                if (syncStatus.new > 0) parts.push(`+${syncStatus.new} new`);
                if (syncStatus.modified > 0) parts.push(`~${syncStatus.modified} mod`);
                if (syncStatus.deleted > 0) parts.push(`-${syncStatus.deleted} del`);
                syncDetails += ` [${parts.join(', ')}]`;
            }

            startupDisplay.success('plugins', syncDetails);


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

        // 4. [LEVEL 5] Initialiser le Feedback et Auto-Apprentissage
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

        // 7. [PHASE 3] Résilience: Vérifier les tâches interrompues
        await this._resumePendingActions();

        this.isReady = true;
        startupDisplay.complete(persona.name);
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
        const { workingMemory } = this;
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
        const { db } = this;
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
        const { db, workingMemory, consciousness, userService, groupService, adminService, factsMemory, semanticMemory } = this;
        const message = event.data;
        const { chatId, sender, senderName, text, isGroup } = message;


        if (chatId === 'status@broadcast' || chatId?.endsWith('@broadcast')) {
            return; // Silently ignore
        }

        console.log(`[${isGroup ? 'G' : 'P'}] ${senderName}: ${text.substring(0, 50)}...`);

        // ======== (PHASE 4) AUTONOMOUS EVENT TRIGGERS (Wait For X) ========
        // Vérifier si ce message débloque un objectif en attente
        try {
            const { goalsService } = await import('../services/goalsService.js');
            const triggeredGoals = await goalsService.checkEventTriggers(message);

            if (triggeredGoals.length > 0) {
                console.log(`[EventTrigger] 🎯 ${triggeredGoals.length} objectif(s) déclenché(s) par ce message !`);
                for (const goal of triggeredGoals) {
                    // Marquer comme en cours
                    await goalsService.markInProgress(goal.id);

                    // Injecter le message système pour forcer l'exécution
                    // On simule un message système qui arrive immédiatement après
                    setTimeout(async () => {
                        await this._onMessage({
                            data: {
                                isGroup: goal.target_chat_id ? goal.target_chat_id.endsWith('@g.us') : false,
                                chatId: goal.target_chat_id,
                                text: `SYSTEM_GOAL_TRIGGER: L'objectif "${goal.title}" a été déclenché par un événement (Reçu message de ${senderName}).\nConsigne: ${goal.description}\nPriorité: ${goal.priority}`,
                                senderName: "SYSTEM_EVENT_LISTENER",
                                sender: "system@internal",
                                isSystem: true
                            }
                        });
                    }, 500); // Petit délai pour laisser traiter le message courant
                }
            }
        } catch (e) {
            console.error('[EventTrigger] Erreur vérification:', e.message);
        }

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


            // Construire les options de réponse (Quote, Mention)
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

            // [THINK-FAST-PROGRESSIVE] classification locale ultra-rapide
            // Security First: Seules les actions critiques forcent le mode Agentic immédiat.
            const classification = classifyLocally(text, { hasImage: !!message.image }); // Passer le contexte image si dispo

            // Variable pour garder trace de l'historique si on vient du FastPath
            let fastPathHistory = null;
            let skipAgentic = false;

            // ⚡ FAST PATH (Défaut pour 95% des cas)
            if (classification.mode === 'FAST') {
                console.log(`[Core] ⚡ Fast Mode activé (${classification.reason})`);

                // 1. Charger contexte léger (HOT/WARM)
                const lightContext = await tieredContextLoader.load(chatId, message, 'FAST');
                const fastHandler = new FastPathHandler(this.transport);

                // 2. Exécuter FastPath avec mini-boucle (Max 2 étapes)
                const fastResult = await fastHandler.handle(message, lightContext);

                if (fastResult.type === 'RESPONSE' && fastResult.content) {
                    // ✅ SUCCÈS RAPIDE
                    console.log(`[Core] ✅ FastPath succès (${fastResult.latency}ms)`);

                    // Envoi réponse
                    await this.transport.sendText(chatId, fastResult.content, replyOptions);

                    // Mise à jour mémoire court terme
                    await workingMemory.addMessage(chatId, 'assistant', fastResult.content);

                    // Nettoyage et fin
                    await this.transport.sendPresenceUpdate(chatId, 'paused');
                    return; // ON S'ARRÊTE LÀ
                }

                if (fastResult.type === 'ESCALATE') {
                    // ⚠️ ESCALAGE NÉCESSAIRE (Complexité > 2 étapes)
                    console.log(`[Core] ⚠️ Escalade demandée par FastPath (${fastResult.reason}) -> Handover vers Agentic`);

                    // On garde l'historique pour l'injecter dans la boucle ReAct
                    fastPathHistory = fastResult.partialHistory;
                }
            } else {
                console.log(`[Core] 🧠 Agentic Mode forcé (${classification.reason})`);
            }

            // ==================================================================================
            // 🧠 AGENTIC PATH (Mode Réflexion Profonde)
            // Arrivée ici si:
            // 1. ReflexClassifier a dit "AGENTIC" (Critique/Admin)
            // 2. FastPath a échoué ou demandé une escalade (Handover)
            // ==================================================================================

            // 1. Charger le reste du contexte (COLD) - RAG, Faits, etc.
            const fullContext = await tieredContextLoader.load(chatId, message, 'AGENTIC');

            // 2. Gestion Agrégation Contexte
            const systemPrompt = fullContext.systemPrompt;
            // On a besoin d'une variable locale standardisée pour l'AGENTIC path
            let history = []; // [FIX] Initialiser la variable history

            history.push({ role: 'system', content: systemPrompt });

            // 3. Fusion de l'historique
            if (fastPathHistory && fastPathHistory.length > 0) {
                // Si on vient d'une escalade, on injecte ce qui s'est passé dans le FastPath
                // Attention: fastPathHistory contient déjà le system prompt "light", on doit le retirer ou l'adapter
                // fastPathHistory[0] est le system prompt.
                console.log(`[Core] 🔗 Injection historique FastPath (${fastPathHistory.length} msgs)`);

                // On ajoute les messages intermédiaires du FastPath (User -> Assistant -> Tool -> Assistant...)
                // On skip le System prompt (index 0) et les 5 messages récents (déjà dans context)
                // C'est un peu tricky. Simplification:
                // On prend tout ce qui est NOUVEAU dans FastPath (après les messages récents)
                // FastPath démarre avec [System, ...5 recents, UserQuery, ...]

                // Pour simplifier, on reconstruit l'historique ReAct proprement:
                // [System Full] + [Recent History] + [User Query] + [FastPath Thoughts/Tools]

                // On ajoute l'historique récent (déjà fait par tieredContextLoader ?)
                history.push(...fullContext.history);
                history.push({ role: 'user', content: text });

                // Et on ajoute les étapes intermédiaires du FastPath (Thought/Action du Tour 1)
                // fastPathHistory contient: [System, ...Recents, User, Assistant(Call), ToolResult]
                const newSteps = fastPathHistory.slice(1 + (fullContext.history.length) + 1); // Skip System + Recents + User
                if (newSteps.length > 0) {
                    history.push(...newSteps);
                }

            } else {
                // Cas standard (Direct Agentic)
                history.push(...fullContext.history);
                history.push({ role: 'user', content: text });
            }


            let finalResponse = null;
            let keepThinking = true;
            let iterations = 0;
            const MAX_ITERATIONS = 10;
            let usedFamily = null;





            // [AGENTIC] Initialisation de la boucle de réflexion
            // On arrive ici uniquement si FastPath a été skippé ou a échoué (Fallback)
            console.log(`[Think-Fast] 🚀 Démarrage de la boucle ReAct (max ${MAX_ITERATIONS} itérations)`);

            // [FIX] Récupération des outils pour l'Agentic Path
            // On utilise le mode 'forceModeration' si nécessaire, ou standard
            const relevantTools = await pluginLoader.getRelevantTools(text, 5, 10);

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
                            // [SAFE EXECUTION ADAPTER] Injection de la sécurité
                            executeToolFn: async (toolCall, msg) => {
                                return await this._safeExecuteTool(toolCall, {
                                    chatId,
                                    message: msg,
                                    authority: context.authority // Capture du contexte d'autorité
                                });
                            },
                            chatId,
                            message
                        });
                        const analysis = await planner.review(executionLog);

                        const summaryPrompt = `Le plan d'action a été exécuté.\nObjectif: ${plan.goal}\nRésultats: ${JSON.stringify(executionLog.results).substring(0, 1000)}\n\nGénère une réponse conversationnelle résumant ce qui a été fait.`;
                        const summaryResponse = await providerRouter.chat([
                            ...history,
                            { role: 'user', content: summaryPrompt }
                        ], { family: usedFamily });

                        finalResponse = summaryResponse.content;
                        await this.actionMemory.completeAction(chatId, { success: analysis.success });

                        keepThinking = false;
                    }
                }
            }

            while (keepThinking && iterations < MAX_ITERATIONS) {
                iterations++;

                // [PHASE 2] GESTION DE CONTEXTE INTELLIGENTE
                // Purger l'historique des résultats trop lourds pour éviter l'explosion
                try {
                    // On ne modifie pas 'conversationHistory' en place car c'est une constante (reference), 
                    // mais c'est un tableau mutable. _optimizeHistory renvoie un nouveau tableau ou le même.
                    // Si nouveau tableau, on doit remplacer le contenu.
                    const optimized = this._optimizeHistory(history);
                    if (optimized !== history) {
                        history.length = 0; // Vider l'original
                        history.push(...optimized); // Remplir avec l'optimisé
                    }
                } catch (ctxErr) {
                    console.error('[ContextManager] ❌ Échec optimisation:', ctxErr);
                }

                // Appel à l'IA avec l'historique accumulé
                const response = await providerRouter.chat(history, {
                    tools: relevantTools,
                    family: usedFamily // Utiliser le même cerveau pour tout le thread
                });

                // Sauvegarder la famille utilisée au premier tour
                if (!usedFamily) usedFamily = response.usedFamily;

                // [FALLBACK] Détecter les "hallucinations" de tool calls textuels (ex: Kimi qui écrit du code)
                if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
                    const extractedCalls = extractToolCallsFromText(response.content, true);

                    if (extractedCalls.length > 0) {
                        console.log(`[Core] 🛠️ ${extractedCalls.length} tool calls extraits du texte`);

                        // Convertir au format OpenAI avec ID compatible Mistral (9 chars)
                        response.toolCalls = extractedCalls.map(call => {
                            const args = parseToolArguments(call.arguments);
                            // ID compatible Mistral (9 chars alphanumériques)
                            const randomId = Math.random().toString(36).substring(2, 11);

                            return {
                                id: randomId,
                                type: 'function',
                                function: {
                                    name: call.name,
                                    arguments: JSON.stringify(args || {})
                                }
                            };
                        });
                    }
                }

                if (response.toolCalls && response.toolCalls.length > 0) {
                    console.log(`[Agent] 🛠️ Étape ${iterations}: L'IA appelle ${response.toolCalls.length} outil(s)`);

                    // 1. Ajouter la "pensée" de l'assistant à l'historique
                    // [FIX] Kimi K2+ nécessite reasoning_content pour que le contexte soit valide
                    const historyEntry = {
                        role: 'assistant',
                        content: response.content || null,
                        tool_calls: response.toolCalls
                    };

                    if (response.reasoningContent) {
                        historyEntry.reasoning_content = response.reasoningContent; // Snake_case pour API standard
                    }

                    history.push(historyEntry);

                    // 2. Exécuter les outils
                    const { getToolFeedback } = await import('../utils/messageSplitter.js');

                    for (const toolCall of response.toolCalls) {
                        const toolName = toolCall.function.name;

                        try {
                            // [MIGRATION vers _safeExecuteTool]
                            // Centralisation de toute la logique de sécurité (MultiAgent, MoralCompass) et de logging
                            const toolResult = await this._safeExecuteTool(toolCall, {
                                chatId,
                                message,
                                authority: fullContext.authority
                            });

                            // Important: l'IA a besoin de voir le résultat JSON pur
                            const stringResult = JSON.stringify(toolResult);

                            // 3. Ajouter le résultat à l'historique
                            history.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: toolName,
                                content: stringResult
                            });

                            console.log(`[Agent] ✅ Résultat ${toolName} traité`);

                            // 🛡️ OBSERVER: Vérifier la cohérence comportementale après chaque outil
                            try {
                                const { multiAgent } = await import('../services/agentic/MultiAgent.js');

                                // Obtenir l'historique récent pour comparaison
                                const recentActions = await this.actionMemory.getRecentActions(chatId, 5);

                                const coherence = await multiAgent.observe({
                                    tool: toolName,
                                    params: JSON.parse(toolCall.function.arguments || '{}'),
                                    result: toolResult
                                }, recentActions);

                                if (!coherence.coherent) {
                                    console.warn(`[Observer] ⚠️ Incohérence détectée: ${coherence.warning} (${coherence.severity})`);

                                    // Logger dans la DB pour analyse future
                                    await db.from('action_scores').insert({
                                        chat_id: chatId,
                                        tool_name: toolName,
                                        coherence_score: 0.2, // Score bas à cause de l'incohérence
                                        warning: coherence.warning,
                                        severity: coherence.severity,
                                        metadata: { observer_detected: true }
                                    });
                                } else {
                                    console.log(`[Observer] ✅ Cohérence vérifiée pour ${toolName}`);
                                }

                            } catch (observerError) {
                                // Ne pas bloquer l'exécution si Observer échoue
                                console.warn('[Observer] Erreur non-bloquante:', observerError.message);

                                // Monitoring: tracker les erreurs Observer
                                if (this.container?.has('metrics')) {
                                    const metrics = this.container.get('metrics');
                                    metrics.increment('observer_errors', {
                                        tool: toolName,
                                        error_type: observerError.name
                                    });
                                }
                            }

                            // UX Agentique: Petit feedback visuel si c'est long
                            if (iterations > 1) {
                                await this.transport.setPresence(chatId, 'composing');
                            }

                        } catch (unexpectedErr) {
                            console.error(`[Agent] ❌ Erreur fatale boucle ReAct:`, unexpectedErr);
                            // Fallback ultime
                            history.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                name: toolName,
                                content: JSON.stringify({ success: false, error: true, message: `Fatal Loop Error: ${unexpectedErr.message}` })
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
            if (!finalResponse || typeof finalResponse !== 'string' || finalResponse.trim() === '') {
                console.warn('[Core] ⚠️ Réponse vide ou invalide (non-string), annulation envoi');
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

            // [FIX] Detecter et corriger le format <send_message>JSON</send_message>
            // Protection contre l'hallucination de format XML du modèle
            const sendMessageRegex = /<send_message>([\s\S]*?)<\/send_message>/;
            const smMatch = finalResponse && finalResponse.match(sendMessageRegex);
            if (smMatch) {
                try {
                    const jsonContent = JSON.parse(smMatch[1]);
                    if (jsonContent.text) {
                        console.log('[Core] 🧹 Nettoyage automatique du format <send_message>');
                        finalResponse = jsonContent.text;
                    }
                } catch (e) {
                    // Fallback: simplement nettoyer les balises si le JSON est invalide ou si c'est du texte brut
                    finalResponse = finalResponse.replace(/<\/?send_message>/g, '');
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
     * Exécute un outil de manière sécurisée (avec Critique et Boussole Morale)
     * Utiliser cette méthode au lieu de _executeTool direct pour le Planner
     */
    async _safeExecuteTool(toolCall, context) {
        const { db } = this;
        const toolName = toolCall.function.name;

        const { chatId, message, authority } = context;

        console.log(`[SafeExecute] 🛡️ Exécution sécurisée demandée: ${toolName}`);

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
                    authorityLevel: authority?.level || 0
                });

                if (!critique.approved) {
                    console.warn(`[MultiAgent] 🛑 Action refusée par Critic: ${critique.concerns.join('. ')}`);
                    return {
                        success: false,
                        error: true,
                        message: `ACTION_REFUSÉE_PAR_CRITIC: ${critique.concerns.join('. ')}. Alternative suggérée: ${critique.alternative || 'aucune'}`
                    };
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
                    authorityLevel: authority?.level || 0
                });

                if (!evaluation.allowed) {
                    console.warn(`[MoralCompass] 🛑 Action refusée: ${evaluation.reason}`);
                    return {
                        success: false,
                        error: true,
                        message: `ACTION_REFUSÉE_PAR_LA_BOUSSOLE_MORALE: ${evaluation.reason}`
                    };
                }
            }

            // EXÉCUTION RÉELLE
            const toolResult = await this._executeTool(toolCall, message);

            // [LEVEL 5] Observer Integration: Vérifier la cohérence après exécution
            try {
                const { multiAgent } = await import('../services/agentic/MultiAgent.js');
                const agentMemory = this.agentMemory;
                const recentActions = await agentMemory.getRecentActions(chatId, 5);

                const coherence = await multiAgent.observe({
                    tool: toolName,
                    params: JSON.parse(toolCall.function.arguments || '{}')
                }, recentActions);

                if (!coherence.coherent) {
                    console.warn(`[MultiAgent] ⚠️ Incohérence détectée: ${coherence.warning} (${coherence.severity})`);
                }
            } catch (obsErr) {
                console.warn('[Core] Erreur Observer:', obsErr.message);
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
                    duration_ms: 0,
                    chatId,
                    timestamp: Date.now()
                }).catch(e => console.error('[Eval] Error:', e.message));
            }

            return toolResult;

        } catch (execErr) {
            console.error(`[SafeExecute] ❌ Erreur exécution outil ${toolName}:`, execErr);

            // [EPISODIC MEMORY] Log de l'action échouée
            db.logAction(chatId, toolName, toolCall.function.arguments, null, false, execErr.message);

            return {
                success: false,
                error: true,
                message: `Tool Execution Failed: ${execErr.message}. Please analyze the error, self-correct your parameters or strategy, and try again.`
            };
        }
    }





    /**
     * Gère intelligemment la fenêtre de contexte pour éviter l'explosion (Amnésie Progressive)
     * Tronque les sorties d'outils volumineuses tout en gardant l'instruction utilisateur
     * @param {Array} history - Historique complet
     * @returns {Array} Historique optimisé
     */
    _optimizeHistory(history) {
        // Paramètres
        const TOTAL_CHAR_LIMIT = 25000; // ~6k tokens
        const TOOL_OUTPUT_LIMIT = 2000; // Limite par outil résumé

        let currentSize = JSON.stringify(history).length;

        if (currentSize < TOTAL_CHAR_LIMIT) {
            return history;
        }

        console.log(`[ContextManager] ⚠️ Surcharge contexte détectée (${currentSize} chars). Optimisation...`);

        // Stratégie: Supprimer/Tronquer les vieux tool_outputs, mais GARDEZ :
        // 1. Le System Prompt (Index 0)
        // 2. Le User Message original (Le dernier User message du début de chaine) => Souvent index 1 ou 2
        // 3. Les 3 derniers échanges (User/Assistant/Tool)

        const optimizedHistory = [...history];

        // On parcourt de l'index 2 (après system/user prompt) jusqu'à length-3
        // On ne touche PAS aux 3 derniers messages pour garder la cohérence immédiate
        const safeZoneStart = 2;
        const safeZoneEnd = optimizedHistory.length - 3;

        let trimmedCount = 0;

        for (let i = safeZoneStart; i < safeZoneEnd; i++) {
            const msg = optimizedHistory[i];

            // Cible n°1: Les résultats d'outils volumineux
            if (msg.role === 'tool' && msg.content && msg.content.length > TOOL_OUTPUT_LIMIT) {
                const originalLen = msg.content.length;
                const summary = msg.content.substring(0, TOOL_OUTPUT_LIMIT) +
                    `\n... [DONNÉES VOLUMINEUSES TRONQUÉES: ${originalLen - TOOL_OUTPUT_LIMIT} chars masqués pour préserver la mémoire. L'essentiel a été lu.]`;

                msg.content = summary;
                trimmedCount++;
                currentSize = JSON.stringify(optimizedHistory).length;

                if (currentSize < TOTAL_CHAR_LIMIT) break;
            }
        }

        console.log(`[ContextManager] ✅ Optimisation terminée. ${trimmedCount} outils tronqués. Nouvelle taille: ${currentSize} chars.`);
        return optimizedHistory;
    }

    /**
     * [PHASE 3] Résilience: Vérifie s'il y a des actions interrompues (Crash Recovery)
     * Si oui, propose de les reprendre
     */
    async _resumePendingActions() {
        const { actionMemory } = this;
        console.log('[Core] ♻️ Vérification des tâches interrompues...');
        try {
            const pendingActions = await actionMemory.getResumableActions(5);


            if (pendingActions.length > 0) {
                console.log(`[Core] ⚠️ ${pendingActions.length} action(s) interrompue(s) trouvée(s). Tentative de reprise...`);

                for (const action of pendingActions) {
                    // On ne reprend que les actions récentes (< 24h)
                    const age = Date.now() - action.createdAt;
                    if (age > 24 * 3600 * 1000) {
                        console.log(`[Core] Action ${action.id} trop vieille, ignorée.`);
                        continue;
                    }

                    // Notifier dans le chat qu'on a trouvé quelque chose
                    const msg = `♻️ *Reprise d'activité*\nJ'ai détecté une tâche interrompue : "${action.params.goal}".\nJe reprends là où je m'étais arrêté (Étape ${action.steps.length}).\n_(Dites 'stop' pour annuler)_`;
                    await this.transport.sendText(action.chatId, msg);

                    // [REHYDRATION] Restaure le contexte Redis pour que le Planner soit prêt
                    await actionMemory.rehydrateAction(action.chatId, action.id);

                    // On ne change PAS le status DB ici pour garder la persistance "active" 
                    // tant que la tâche n'est pas finie ou annulée.
                }
            } else {
                console.log('[Core] ✅ Aucune tâche interrompue.');
            }
        } catch (e) {
            console.error('[Core] ❌ Erreur lors de la vérification de reprise:', e.message);
        }
    }

    /**
     * (Module 3) Vérification de la Roadmap au premier message
     */
    async _checkRoadmap(chatId, isGroup) {
        if (!isGroup) return;
        const { db } = this;
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
        const { agentMemory } = this;
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
        const { db, groupService } = this;
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
        const { adminService } = this;
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
        const { factsMemory } = this;
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
