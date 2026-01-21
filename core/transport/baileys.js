// Implémentation concrète du transport utilisant @whiskeysockets/baileys

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

// DTC Phase 1: Nouveaux services unifiés
// import { userService } from '../../services/userService.js'; // REMOVED FOR DI
// import { groupService } from '../../services/groupService.js'; // REMOVED FOR DI
import { eventBus, BotEvents } from '../events.js';
import { formatToWhatsApp } from '../../utils/helpers.js';
import { workingMemory } from '../../services/workingMemory.js';
import { botIdentity } from '../../utils/botIdentity.js';
import { resolveMentionsInText } from '../../utils/fuzzyMatcher.js';

// NOUVEAU: Import config centralisée pour Audio Strategy
import { config as globalConfig } from '../../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charger la configuration de protection contre le backlog
let config;
try {
    config = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'config', 'config.json'), 'utf-8')
    );
} catch {
    config = {
        backlog_protection: {
            enabled: true,
            message_stale_threshold_seconds: 120,
            max_messages_on_startup: 10
        }
    };
}

class BaileysTransport extends EventEmitter {
    constructor() {
        super();
        this.sock = null;
        this.messageCallback = null;
        this.groupEventCallback = null;
        this.connectionTime = null; // Timestamp de la dernière connexion
        this.backlogMessagesIgnored = 0; // Compteur de messages ignorés
        this.container = null; // DI Container
        this.isConnecting = false; // Guard to prevent parallel connections
        // State management
        this.state = null;
        this.saveCreds = null;
        this.reconnectAttempts = 0;
    }

    setContainer(container) {
        this.container = container;
    }

    get userService() {
        return this.container?.get('userService');
    }

    get groupService() {
        return this.container?.get('groupService');
    }

    get adminService() {
        return this.container?.get('adminService');
    }

    /**
     * Connecte au service WhatsApp via Baileys
     */
    async connect(sessionPath = 'session') {
        const self = this; // Capture du contexte pour les callbacks

        // Guard: Prevent multiple simultaneous connection attempts
        if (self.isConnecting) {
            console.log('[Baileys] ⏳ Connexion déjà en cours, ignoré.');
            return;
        }
        self.isConnecting = true;

        // Cleanup: End previous socket to prevent listener accumulation
        if (self.sock) {
            try {
                self.sock.ev.removeAllListeners();
                self.sock.end(new Error('Reconnecting'));
            } catch (e) { /* ignore cleanup errors */ }
            self.sock = null;
        }

        // Connexion silencieuse pour ne pas casser la barre de progression
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        self.state = state;
        self.saveCreds = saveCreds;

        const { version } = await fetchLatestBaileysVersion();

        self.sock = makeWASocket({
            auth: self.state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            browser: [config.bot_name || "HIVE-MIND", "Chrome", "1.0.0"],
            // Augmenter le timeout pour éviter les déconnexions intempestives
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: true,
            markOnlineOnConnect: true,
            retryRequestDelayMs: 5000,
            version: version,
            syncFullAppState: false // Désactivé pour éviter les logs verbeux
        });

        // Sauvegarde automatique des credentials
        self.sock.ev.on('creds.update', self.saveCreds);

        // Gestion de la connexion
        self.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('SCANNEZ CE QR CODE AVEC WHATSAPP :');
                qrcode.generate(qr, { small: true });
                eventBus.publish(BotEvents.QR_RECEIVED, qr);
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`[Baileys] 🔌 Déconnexion (statusCode: ${statusCode || 'undefined'}, reason: ${lastDisconnect?.error?.message || 'unknown'})`);
                eventBus.publish(BotEvents.DISCONNECTED, { shouldReconnect });

                // Gérer le cas spécifique "Stream Errored" qui boucle
                if (lastDisconnect.error?.message === 'Stream Errored (conflict)') {
                    console.log('⚠️ Conflit de stream détecté, attente avant reconnexion...');
                    self.isConnecting = false;
                    setTimeout(() => self.connect(sessionPath), 5000);
                    return;
                }

                // Reset guard to allow reconnection
                self.isConnecting = false;

                if (shouldReconnect) {
                    // Backoff exponentiel
                    const delayMs = Math.min(1000 * Math.pow(2, self.reconnectAttempts || 0), 30000);
                    self.reconnectAttempts = (self.reconnectAttempts || 0) + 1;

                    console.log(`🔄 Reconnexion dans ${delayMs / 1000}s...`);

                    setTimeout(() => {
                        self.connect(sessionPath).catch(err => console.error('Echec reconnexion:', err));
                    }, delayMs);
                } else {
                    console.log('[Baileys] ⛔ Déconnexion définitive (loggedOut)');
                }
            } else if (connection === 'open') {
                console.log('✅ Connecté à WhatsApp !');
                self.isConnecting = false;
                self.reconnectAttempts = 0;
                self.connectionTime = Math.floor(Date.now() / 1000);
                self.backlogMessagesIgnored = 0;

                // [CONSCIOUSNESS] Définir l'identité du bot
                if (self.container && self.container.has('consciousness')) {
                    const consciousness = self.container.get('consciousness');
                    consciousness.setIdentity(self.sock.user);
                }

                // Mettre le bot "En ligne" pour montrer qu'il est réveillé
                self.sock.sendPresenceUpdate('available');

                eventBus.publish(BotEvents.CONNECTED);
            }
        });

        // Écoute des messages
        self.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.fromMe) continue;

                // Extraction des variables de base immédiate
                const remoteJid = msg.key.remoteJid;
                const sender = msg.key.participant || msg.key.remoteJid;
                const senderName = msg.pushName || sender.split('@')[0];

                // Vérification de sécurité: msg.message peut être undefined/null
                if (!msg.message) {
                    console.warn('[Baileys] ⚠️ Message reçu sans contenu (msg.message undefined)');
                    continue;
                }

                const messageType = Object.keys(msg.message)[0];
                const pushName = msg.pushName;
                const chatId = remoteJid;
                const isGroup = chatId.endsWith('@g.us');
                const senderId = sender;

                // 1. MISE À JOUR SOCIALE (USER)
                if (self.userService) {
                    await self.userService.recordInteraction(senderId, msg.pushName, isGroup ? chatId : null);
                }

                // 2. AUTO-DISCOVERY (GROUPES)
                if (isGroup && self.groupService) {
                    const needsUpdate = await self.groupService.needsUpdate(chatId);

                    if (needsUpdate) {
                        try {
                            console.log(`[Discovery] Scan du groupe ${chatId} en cours...`);
                            const metadata = await self.sock.groupMetadata(chatId);
                            await self.groupService.updateGroup(chatId, metadata);
                        } catch (err) {
                            console.error(`[Discovery] Echec recup metadata groupe: ${err.message}`);
                        }
                    }
                }

                // ⚡ Filtre anti-backlog
                if (config.backlog_protection?.enabled && self.connectionTime) {
                    const messageTimestamp = msg.messageTimestamp;
                    const now = Math.floor(Date.now() / 1000);
                    const messageAge = now - messageTimestamp;
                    const threshold = config.backlog_protection.message_stale_threshold_seconds;

                    if (messageAge > threshold) {
                        self.backlogMessagesIgnored++;
                        console.log(`[Baileys] 🚫 Message ignoré (${messageAge}s ancien)`);
                        continue;
                    }
                }

                // 3. TRANSCRIPTION & AUDIO HANDLING (V6)
                const isAudio = msg.message?.audioMessage;
                let transcribedText = null;

                // Préparer normalizedMsg
                const normalizedMsg = {
                    id: msg.key.id,
                    chatId: remoteJid, // CRITICAL: Propagate chatId
                    remoteJid: remoteJid,
                    sender: sender,
                    senderName: senderName,
                    pushName: pushName,
                    fromMe: msg.key.fromMe || false,
                    isGroup: isGroup,
                    timestamp: msg.messageTimestamp,
                    type: messageType,
                    raw: msg
                };

                try {
                    if (isAudio && self.container?.has('transcriptionService')) {
                        // ========== PV (MESSAGES PRIVÉS) ==========
                        if (!isGroup) {
                            const pvAudioDisabled = await workingMemory.isPvAudioDisabled();

                            if (pvAudioDisabled) {
                                console.log(`[Baileys] ⏭️ Audio PV ignoré (désactivé globalement)`);
                            } else {
                                const audioStrategy = globalConfig.models?.reglages_generaux?.audio_strategy || {};
                                const useNativeAudio = audioStrategy.prefer_native && self.container?.has('geminiLiveProvider');

                                if (useNativeAudio) {
                                    console.log(`[Baileys] 🎙️ Mode Audio NATIF détecté (Gemini Live)`);
                                    try {
                                        const buffer = await downloadMediaMessage(
                                            msg, 'buffer', {}, { reuploadRequest: self.sock.updateMediaMessage, logger: pino({ level: 'silent' }) }
                                        );
                                        normalizedMsg.audioBuffer = buffer;
                                        normalizedMsg.useNativeAudio = true;
                                        normalizedMsg.text = '[AUDIO_NATIVE]';
                                        console.log(`[Baileys] ✅ Buffer audio prêt pour traitement natif (${buffer.length} bytes)`);
                                    } catch (err) {
                                        console.error(`[Baileys] ❌ Erreur téléchargement audio natif: ${err.message}`);
                                        if (audioStrategy.fallback_to_cascade) {
                                            console.log(`[Baileys] 🔄 Fallback vers mode cascade`);
                                            // Fallback logique dessous...
                                        }
                                    }
                                }

                                // CASCADE
                                if (!normalizedMsg.useNativeAudio) {
                                    console.log(`[Baileys] 🎤 Audio PV détecté, transcription directe...`);
                                    try {
                                        const buffer = await downloadMediaMessage(
                                            msg, 'buffer', {}, { reuploadRequest: self.sock.updateMediaMessage, logger: pino({ level: 'silent' }) }
                                        );
                                        const { writeFileSync, unlinkSync, mkdirSync, existsSync } = await import('fs');

                                        const tempDir = join(__dirname, '..', '..', 'temp', 'stt');
                                        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
                                        const tempPath = join(tempDir, `stt_pv_${msg.key.id}.ogg`);
                                        writeFileSync(tempPath, buffer);
                                        const transcriptionService = self.container.get('transcriptionService');
                                        transcribedText = await transcriptionService.transcribe(tempPath);
                                        console.log(`[Baileys] 🗣️ Transcription PV: "${transcribedText}"`);
                                        try { unlinkSync(tempPath); } catch (e) { }
                                    } catch (err) {
                                        console.error(`[Baileys] ❌ Erreur STT PV: ${err.message}`);
                                    }
                                }
                            }
                        }
                        // ========== GROUPES ==========
                        else {
                            const groupService = self.container?.get('groupService');
                            const groupSettings = groupService ? await groupService.getGroupSettings(groupId) : {};
                            const mode = groupSettings?.audio_mode || 'mention_only';

                            if (mode === 'off') {
                                console.log(`[Baileys] ⏭️ Audio Groupe ignoré (Mode OFF)`);
                            } else {
                                // (Simplifié pour ce fix: STT classique pour les groupes)
                                try {
                                    // TODO: Implement Logic similar to PV for Native Audio if Groups Enabled
                                    const buffer = await downloadMediaMessage(
                                        msg, 'buffer', {}, { reuploadRequest: self.sock.updateMediaMessage, logger: pino({ level: 'silent' }) }
                                    );

                                    const { writeFileSync, unlinkSync, mkdirSync, existsSync } = await import('fs');
                                    const tempDir = join(__dirname, '..', '..', 'temp', 'stt');
                                    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
                                    const tempPath = join(tempDir, `stt_${msg.key.id}.ogg`);
                                    writeFileSync(tempPath, buffer);

                                    const transcriptionService = self.container.get('transcriptionService');
                                    transcribedText = await transcriptionService.transcribe(tempPath);
                                    console.log(`[Baileys] 🗣️ Transcription Groupe: "${transcribedText}"`);

                                    const mentionsBot = botIdentity.isVocallyMentioned(transcribedText);
                                    let isQuotedReplyToBot = false;
                                    const audioCtx = msg.message?.audioMessage?.contextInfo;
                                    if (audioCtx?.participant) {
                                        const rawBotId = self.sock?.user?.id;
                                        const botLid = self.sock?.user?.lid;
                                        const quotedSender = audioCtx.participant;
                                        isQuotedReplyToBot = (rawBotId && quotedSender.includes(rawBotId.split(':')[0]?.split('@')[0])) ||
                                            (botLid && quotedSender.includes(botLid.split(':')[0]?.split('@')[0]));
                                    }

                                    if (!mentionsBot && !isQuotedReplyToBot && mode !== 'full') {
                                        transcribedText = null;
                                    }
                                    try { unlinkSync(tempPath); } catch (e) { }
                                } catch (e) {
                                    console.error(`[Baileys] Erreur STT Groupe: ${e.message}`);
                                }
                            }
                        }
                    }

                    // Assigner le texte transcrit
                    if (transcribedText) {
                        normalizedMsg.text = transcribedText;
                        normalizedMsg.isTranscribed = true;
                    } else if (!normalizedMsg.text && !normalizedMsg.useNativeAudio) {
                        // Fallback text extraction if not audio
                        let textBody = '';
                        if (msg.message?.conversation) textBody = msg.message.conversation;
                        else if (msg.message?.extendedTextMessage?.text) textBody = msg.message.extendedTextMessage.text;
                        else if (msg.message?.imageMessage?.caption) textBody = msg.message.imageMessage.caption;
                        else if (msg.message?.videoMessage?.caption) textBody = msg.message.videoMessage.caption;
                        normalizedMsg.text = textBody;
                    }

                    // ANTI-DELETE logic
                    if (normalizedMsg.text && isGroup) {
                        workingMemory.storeMessage(chatId, msg.key.id, {
                            sender: senderId,
                            senderName: msg.pushName || senderId.split('@')[0],
                            text: normalizedMsg.text,
                            mediaType: normalizedMsg.mediaType,
                            timestamp: msg.messageTimestamp
                        }).catch(() => { });
                    }

                    // EMIT MESSAGE
                    if (normalizedMsg.text || normalizedMsg.useNativeAudio) {
                        if (self.messageCallback) self.messageCallback(normalizedMsg);
                        eventBus.publish(BotEvents.MESSAGE_RECEIVED, normalizedMsg);
                        self.emit('message', normalizedMsg);
                    }

                } catch (err) {
                    console.error('[Baileys] ❌ Erreur traitement message:', err);
                }
            }
        });

        // REACTION: écoute des réactions
        self.sock.ev.on('messages.reaction', async (reactions) => {
            for (const reaction of reactions) {
                const reactionData = {
                    chatId: reaction.key.remoteJid,
                    messageId: reaction.key.id,
                    sender: reaction.key.participant || reaction.key.remoteJid,
                    reaction: reaction.reaction.text,
                    timestamp: reaction.reaction.messageTimestamp
                };
                console.log(`[Baileys] 👍 Réaction reçue: ${reactionData.reaction} dans ${reactionData.chatId}`);
                eventBus.publish(BotEvents.REACTION_RECEIVED, reactionData);
            }
        });

        // ANTI-DELETE: Écoute des messages supprimés
        self.sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                if (update.update?.messageStubType === 1 || update.update?.message === null) {
                    const chatId = update.key.remoteJid;
                    const messageId = update.key.id;
                    const isEnabled = await workingMemory.isAntiDeleteEnabled(chatId);
                    if (!isEnabled) continue;

                    const storedMsg = await workingMemory.getStoredMessage(chatId, messageId);
                    if (!storedMsg) continue;

                    console.log(`[AntiDelete] 🗑️ Message supprimé détecté de ${storedMsg.senderName}`);
                    await workingMemory.trackDeletedMessage(chatId, messageId, storedMsg);

                    try {
                        const repostText = `🗑️ *Message supprimé par ${storedMsg.senderName}:*\n\n"${storedMsg.text}"`;
                        await self.sock.sendMessage(chatId, { text: repostText });
                    } catch (e) { }
                }
            }
        });

        // Écoute des synchronisations de contacts
        self.sock.ev.on('contacts.upsert', async (contacts) => {
            if (!self.userService) return;
            for (const contact of contacts) {
                if (contact.id && contact.lid) {
                    self.userService.registerLid(contact.id, contact.lid).catch(() => { });
                }
            }
        });

        self.sock.ev.on('contacts.update', async (updates) => {
            if (!self.userService) return;
            for (const update of updates) {
                if (update.id && update.lid) {
                    self.userService.registerLid(update.id, update.lid).catch(() => { });
                }
            }
        });

        // Écoute des événements de groupe
        self.sock.ev.on('group-participants.update', async (event) => {
            const normalizedEvent = {
                groupId: event.id,
                participants: event.participants,
                action: event.action,
                timestamp: Date.now()
            };

            if (self.groupEventCallback) {
                self.groupEventCallback(normalizedEvent);
            }

            const eventMap = {
                add: BotEvents.GROUP_JOIN,
                remove: BotEvents.GROUP_LEAVE,
                promote: BotEvents.GROUP_PROMOTE,
                demote: BotEvents.GROUP_DEMOTE
            };
            eventBus.publish(eventMap[event.action], normalizedEvent);
        });

        return self.sock;
    }

    /**
     * Déconnexion propre
     */
    async disconnect() {
        if (this.sock) {
            await this.sock.logout();
            this.sock = null;
        }
    }

    /**
     * Normalise un message Baileys vers un format standard
     */
    _normalizeMessage(msg) {
        const chatId = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        // Extraction du texte
        let text = '';
        if (msg.message?.conversation) text = msg.message.conversation;
        else if (msg.message?.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
        else if (msg.message?.imageMessage?.caption) text = msg.message.imageMessage.caption;
        else if (msg.message?.videoMessage?.caption) text = msg.message.videoMessage.caption;

        // Détection du type de média
        let mediaType = null;
        if (msg.message?.imageMessage) mediaType = 'image';
        else if (msg.message?.videoMessage) mediaType = 'video';
        else if (msg.message?.audioMessage) mediaType = 'audio';
        else if (msg.message?.documentMessage) mediaType = 'document';
        else if (msg.message?.stickerMessage) mediaType = 'sticker';

        // Message cité et mentions
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || null;

        const quotedMsg = contextInfo?.quotedMessage
            ? {
                text: contextInfo.quotedMessage.conversation ||
                    contextInfo.quotedMessage.extendedTextMessage?.text,
                sender: contextInfo.participant,
                message: contextInfo.quotedMessage
            }
            : null;

        // Extraction des JIDs mentionnés (@mentions)
        const mentionedJids = contextInfo?.mentionedJid || [];

        return {
            id: msg.key.id,
            chatId,
            sender,
            senderName: msg.pushName || sender.split('@')[0],
            text,
            isGroup,
            mediaType,
            quotedMsg,
            mentionedJids, // Nouveau champ
            timestamp: msg.messageTimestamp,
            raw: msg
        };
    }



    /**
     * Envoie un message texte avec résolution automatique des @mentions
     */
    async sendText(chatId, text, options = {}) {
        if (!text) return;

        // 0. SPLITTING : Gestion des messages trop longs (WhatsApp limit ~65536, mais pour UX ~4096)
        const MAX_LENGTH = 4000;
        if (text.length > MAX_LENGTH) {
            console.log(`[Baileys] ✂️ Message trop long (${text.length} chars), découpage...`);
            const chunks = text.match(new RegExp(`.{1,${MAX_LENGTH}}`, 'g'));

            let lastSent = null;
            for (const chunk of chunks) {
                // On envoie les morceaux séquentiellement
                // Seul le premier (ou dernier?) garde le 'reply' ? Généralement le premier.
                const chunkOptions = { ...options };
                if (chunks.indexOf(chunk) > 0) delete chunkOptions.reply; // Reply seulement sur le 1er

                lastSent = await this.sendText(chatId, chunk, chunkOptions);
                await delay(500); // Petit délai pour l'ordre
            }
            return lastSent; // Retourne le dernier sent
        }

        // (Module 4) Formatage automatique
        let formattedText = formatToWhatsApp(text);

        let mentions = options.mentions || [];

        // (Module 10) Résolution des @mentions via fuzzy matching ET implicit matching
        // Active seulement pour les groupes
        if (chatId.endsWith('@g.us') && this.container) {
            try {
                const groupService = this.container.get('groupService');
                if (groupService) {
                    const members = await groupService.getGroupMembers(chatId);

                    if (members && members.length > 0) {
                        const { resolveMentionsInText, resolveImplicitMentions } = await import('../../utils/fuzzyMatcher.js');

                        // 1. Résolution Explicite (@Nom)
                        let resolved = resolveMentionsInText(formattedText, members);
                        if (resolved.mentions.length > 0) {
                            formattedText = resolved.text;
                            mentions = [...mentions, ...resolved.mentions];
                        }

                        // 2. Résolution Implicite (Nom sans @) - NOUVEAU
                        // On passe le texte déjà formaté (qui a peut-être déjà des @id)
                        const implicitResolved = resolveImplicitMentions(formattedText, members);
                        if (implicitResolved.mentions.length > 0) {
                            formattedText = implicitResolved.text;
                            mentions = [...mentions, ...implicitResolved.mentions];
                            console.log(`[Baileys] 🕵️ Mentions implicites trouvées: ${implicitResolved.resolved.map(m => m.name).join(', ')}`);
                        }

                        // Dédoublonnage
                        mentions = [...new Set(mentions)];
                    }
                }
            } catch (err) {
                console.warn('[Baileys] Erreur résolution mentions:', err.message);
            }
        }

        const message = { text: formattedText };

        if (mentions.length > 0) {
            message.mentions = mentions;
        }

        if (options.reply) {
            message.quoted = options.reply;
        }

        const sent = await this.sock.sendMessage(chatId, message);
        eventBus.publish(BotEvents.MESSAGE_SENT, { chatId, text });
        return sent;
    }

    /**
     * Envoie une note vocale (PTT)
     */
    async sendVoice(chatId, audioPath, options = {}) {
        const message = {
            audio: { url: audioPath },
            mimetype: 'audio/mp4',
            ptt: true // Affiche comme une note vocale
        };

        if (options.reply) {
            message.quoted = options.reply;
        }

        return await this.sock.sendMessage(chatId, message);
    }

    /**
     * Envoie un fichier (Document)
     */
    async sendFile(chatId, filePath, fileName, caption = '') {
        try {
            await this.sock.sendMessage(chatId, {
                document: { url: filePath },
                fileName: fileName,
                mimetype: 'application/pdf',
                caption: caption
            });
            return true;
        } catch (error) {
            console.error('[Baileys] Erreur sendFile:', error);
            throw error;
        }
    }

    /**
     * (Module 2) Tag tous les membres du groupe
     */
    async tagAll(groupId, customMessage = '') {
        try {
            const metadata = await this.getGroupMetadata(groupId);
            const participants = metadata.participants.map(p => p.id);

            const text = customMessage
                ? `📢 *Annonce Groupe*\n${formatToWhatsApp(customMessage)}`
                : `📢 *Tag All*`;

            await this.sock.sendMessage(groupId, {
                text,
                mentions: participants
            });
            return true;
        } catch (error) {
            console.error('[Baileys] Erreur TagAll:', error);
            return false;
        }
    }

    /**
     * (UX/UI) Envoie un sondage natif
     * @param {string} chatId 
     * @param {string} name - Titre du sondage
     * @param {string} values - Options de réponse
     * @param {number} selectableCount - Nombre de choix possibles (défaut: 1)
     */
    async sendPoll(chatId, name, values, selectableCount = 1) {
        try {
            return await this.sock.sendMessage(chatId, {
                poll: {
                    name: name,
                    values: values,
                    selectableCount: selectableCount
                }
            });
        } catch (error) {
            console.error('[Baileys] Erreur sendPoll:', error);
            return false;
        }
    }

    /**
     * (UX/UI) Envoie une fiche contact
     * @param {string} chatId 
     * @param {string} displayName - Nom affiché
     * @param {string} phoneNumber - Numéro (format international sans +)
     */
    async sendContact(chatId, displayName, phoneNumber) {
        try {
            // Vcard format minimal
            const vcard = 'BEGIN:VCARD\n' // metadata of the contact card
                + 'VERSION:3.0\n'
                + `FN:${displayName}\n` // full name
                + `ORG:Contact;\n` // the organization of the contact
                + `TEL;type=CELL;type=VOICE;waid=${phoneNumber}:${phoneNumber}\n` // WhatsApp ID + phone number
                + 'END:VCARD';

            return await this.sock.sendMessage(chatId, {
                contacts: {
                    displayName: displayName,
                    contacts: [{ vcard }]
                }
            });
        } catch (error) {
            console.error('[Baileys] Erreur sendContact:', error);
            return false;
        }
    }

    /**
     * (UX/UI) Édite un message existant (Le bot ne peut éditer que ses propres messages)
     * @param {string} chatId 
     * @param {Object} key - Clé unique du message à éditer
     * @param {string} newText - Nouveau texte
     */
    async editMessage(chatId, key, newText) {
        try {
            return await this.sock.sendMessage(chatId, {
                text: newText,
                edit: key
            });
        } catch (error) {
            console.error('[Baileys] Erreur editMessage:', error);
            return false;
        }
    }

    /**
     * (Module 2) Bannit un utilisateur du groupe
     */
    async banUser(groupId, participant) {
        try {
            let userJid = participant;

            console.log(`[DEBUG Ban] Input participant: ${participant}`);

            // Si c'est un format LID (@lid), on doit trouver le vrai JID
            if (participant.includes('@lid')) {
                const lidNumber = participant.split('@')[0];
                // Chercher dans les participants du groupe
                const metadata = await this.getGroupMetadata(groupId);
                console.log(`[DEBUG Ban] Participants du groupe:`, metadata.participants.map(p => ({ id: p.id, lid: p.lid })));

                const found = metadata.participants.find(p =>
                    p.id.includes(lidNumber) || p.lid?.includes(lidNumber)
                );
                if (found) {
                    userJid = found.id;
                    console.log(`[DEBUG Ban] Résolu via Group Metadata: ${participant} -> ${userJid}`);
                } else {
                    console.error(`[Baileys] Impossible de résoudre LID ${lidNumber} en JID`);
                    return false;
                }
            } else if (!participant.includes('@')) {
                // Numéro simple -> format s.whatsapp.net
                userJid = `${participant}@s.whatsapp.net`;
            }

            console.log(`[DEBUG Ban] Tentative de ban avec JID: ${userJid}`);

            await this.sock.groupParticipantsUpdate(
                groupId,
                [userJid],
                "remove"
            );
            return true;
        } catch (error) {
            console.error('[Baileys] Erreur Ban:', error);
            return false;
        }
    }

    /**
     * Promeut un utilisateur en admin
     */
    async promoteUser(groupId, userJid) {
        try {
            await this.sock.groupParticipantsUpdate(groupId, [userJid], "promote");
            return true;
        } catch (error) {
            console.error('[Baileys] Erreur Promote:', error);
            return false;
        }
    }

    /**
     * Rétrograde un admin en membre
     */
    async demoteUser(groupId, userJid) {
        try {
            await this.sock.groupParticipantsUpdate(groupId, [userJid], "demote");
            return true;
        } catch (error) {
            console.error('[Baileys] Erreur Demote:', error);
            return false;
        }
    }

    /**
     * Met à jour les paramètres du groupe (Lock/Unlock)
     * @param {string} groupId 
     * @param {string} setting 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
     */
    async updateGroupSetting(groupId, setting) {
        try {
            await this.sock.groupSettingUpdate(groupId, setting);
            return true;
        } catch (error) {
            console.error('[Baileys] Erreur GroupSetting:', error);
            return false;
        }
    }

    /**
     * (Module 2) Résout un utilisateur partiel en JID complet
     * Ex: "903..." -> "jid"
     */
    async resolveUser(groupId, partialUser) {
        try {
            const metadata = await this.getGroupMetadata(groupId);
            // Recherche par numéro (fin de chaîne) ou nom
            const target = metadata.participants.find(p => p.id.includes(partialUser));
            return target ? target.id : null;
        } catch {
            return null;
        }
    }

    /**
     * Envoie un média
     */
    async sendMedia(chatId, media, options = {}) {
        const { type = 'image', caption, filename } = options;

        const message = {};
        message[type] = media;
        if (caption) message.caption = caption;
        if (filename) message.fileName = filename;

        return await this.sock.sendMessage(chatId, message);
    }

    /**
     * Envoie un message générique (alias pour sock.sendMessage)
     */
    async sendMessage(chatId, content, options = {}) {
        if (!chatId) return null;
        return await this.sock.sendMessage(chatId, content, options);
    }

    /**
     * Envoie une réaction à un message
     */
    async sendReaction(chatId, key, emoji) {
        if (!chatId || !key) return null;
        return await this.sock.sendMessage(chatId, {
            react: {
                text: emoji,
                key: key
            }
        });
    }

    /**
     * Envoie une note vocale (PTT)
     * Compatible iOS/Android
     */
    async sendVoiceNote(chatId, audioPathOrBuffer, options = {}) {
        await this.sock.sendPresenceUpdate('recording', chatId);

        // Simuler un temps d'enregistrement (ex: 1s par 100 caractères du texte si dispo)
        const duration = options.duration || 1000;
        await delay(duration);

        await this.sock.sendMessage(
            chatId,
            {
                audio: typeof audioPathOrBuffer === 'string' ? { url: audioPathOrBuffer } : audioPathOrBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }
        );

        await this.sock.sendPresenceUpdate('paused', chatId);
    }

    /**
     * Envoie un sticker
     */
    async sendSticker(chatId, stickerBuffer) {
        return await this.sock.sendMessage(chatId, {
            sticker: stickerBuffer
        });
    }

    /**
     * Récupère les métadonnées d'un groupe
     */
    async getGroupMetadata(groupId) {
        const metadata = await this.sock.groupMetadata(groupId);
        return {
            id: metadata.id,
            name: metadata.subject,
            description: metadata.desc,
            participants: metadata.participants,
            admins: metadata.participants.filter(p =>
                p.admin === 'admin' || p.admin === 'superadmin'
            ).map(p => p.id)
        };
    }

    /**
     * Télécharge un média depuis un message
     */
    async downloadMedia(message) {
        return await downloadMediaMessage(
            message.raw,
            'buffer',
            {},
            {
                reuploadRequest: this.sock.updateMediaMessage
            }
        );
    }

    /**
     * Définit le callback pour les messages
     */
    onMessage(callback) {
        this.messageCallback = callback;
    }

    /**
     * Définit le callback pour les événements de groupe
     */
    onGroupEvent(callback) {
        this.groupEventCallback = callback;
    }

    /**
     * Met à jour la présence
     */
    async setPresence(chatId, presence) {
        if (!chatId) {
            console.warn('[Baileys] ⚠️ Tentative setPresence avec chatId undefined');
            return;
        }

        try {
            // S'assurer que le JID est valide avant de souscrire
            if (chatId.includes('@')) {
                await this.sock.presenceSubscribe(chatId);
                await this.sock.sendPresenceUpdate(presence, chatId);
            }
        } catch (err) {
            console.error('[Baileys] ❌ Erreur setPresence:', err.message);
        }
    }

    /**
     * Vérifie si un utilisateur est admin
     */
    async isAdmin(groupId, userId) {
        // [SUPREME AUTHORITY] Super User is ALWAYS admin
        if (this.adminService && await this.adminService.isSuperUser(userId)) return true;

        try {
            const metadata = await this.sock.groupMetadata(groupId);

            // Trouver le participant et vérifier sa propriété admin
            // On compare à la fois l'ID complet ET juste la partie numérique (pour gérer LID vs phone)
            const participant = metadata.participants.find(p => {
                const pId = p.id.split('@')[0];
                const uId = userId.split('@')[0];
                return p.id === userId || pId === uId;
            });

            // Un utilisateur est admin si sa propriété admin n'est PAS null
            // admin peut être: 'admin', 'superadmin', ou null
            const isAdminUser = participant?.admin !== null && participant?.admin !== undefined;

            console.log(`[DEBUG isAdmin] User ${userId} admin status: ${isAdminUser} (admin=${participant?.admin})`);

            return isAdminUser;
        } catch (error) {
            console.error('[isAdmin] Erreur:', error);
            return false;
        }
    }

    /**
     * Version silencieuse pour vérifier si un user est admin (sans logs debug)
     */
    async _isUserAdmin(groupId, userId) {
        try {
            // SuperUser check via DI
            if (this.adminService && await this.adminService.isSuperUser(userId)) return true;

            const metadata = await this.sock.groupMetadata(groupId);
            const participant = metadata.participants.find(p => {
                const pId = p.id.split('@')[0];
                const uId = userId.split('@')[0];
                return p.id === userId || pId === uId;
            });
            return participant?.admin !== null && participant?.admin !== undefined;
        } catch {
            return false;
        }
    }

    /**
     * Simule un délai de frappe naturel
     */
    async simulateTyping(chatId, durationMs = 1500) {
        await this.setPresence(chatId, 'composing');
        await delay(durationMs);
        await this.setPresence(chatId, 'paused');
    }
}


export const baileysTransport = new BaileysTransport();
export default BaileysTransport;
