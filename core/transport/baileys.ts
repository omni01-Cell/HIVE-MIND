// @ts-nocheck
// Implémentation concrète du transport utilisant @whiskeysockets/baileys

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    downloadMediaMessage,
    isRealMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import swarm from '../concurrency/SwarmDispatcher.js'; // [NEW] Module Swarm

// DTC Phase 1: Nouveaux services unifiés
// import { userService } from '../../services/userService.js'; // REMOVED FOR DI
// import { groupService } from '../../services/groupService.js'; // REMOVED FOR DI
import { eventBus, BotEvents } from '../events.js';
import { formatToWhatsApp } from '../../utils/helpers.js';
import { workingMemory } from '../../services/workingMemory.js';
import { botIdentity } from '../../utils/botIdentity.js';
import { resolveMentionsInText } from '../../utils/fuzzyMatcher.js';
import { AudioHandler } from './handlers/audioHandler.js';
import { AntiDeleteHandler } from './handlers/antiDeleteHandler.js';

const BAILEYS_ERRORS = {
    CONNECTION_LOST: 'CONNECTION_LOST',
    SESSION_CONFLICT: 'SESSION_CONFLICT', // Code 440
    MEDIA_DOWNLOAD_FAILED: 'MEDIA_DOWNLOAD_FAILED',
    RECOGNITION_FAILED: 'RECOGNITION_FAILED',
    MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED'
};

// NOUVEAU: Import config centralisée pour Audio Strategy

import { config as globalConfig } from '../../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDebug = process.env.DEBUG === 'true';

// Charger la configuration de protection contre le backlog
let config: any;
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
    sock: any;
    messageCallback: any;
    groupEventCallback: any;
    connectionTime: any;
    backlogMessagesIgnored: any;
    container: any;
    isConnecting: any;
    state: any;
    saveCreds: any;
    reconnectAttempts: any;
    audioHandler: any;
    antiDeleteHandler: any;
    listenerMonitor: any;

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
        this.audioHandler = new AudioHandler(this, this.logger);
        this.antiDeleteHandler = new AntiDeleteHandler(this, this.logger);

        // 🛡️ Monitoring des event listeners (détection de fuites)
        this.listenerMonitor = null;
    }


    setContainer(container: any) {
        this.container = container;
    }

    // [COMPATIBILITY] Rétablissement des méthodes legacy
    onMessage(callback: any) {
        this.messageCallback = callback;
        // FIX: Ne pas doubler avec this.on('message', callback) car on appelle déjà messageCallback explicitement
    }

    onGroupEvent(callback: any) {
        this.groupEventCallback = callback;
    }

    /**
     * Alias de compatibilité pour BotCore qui attend sendPresenceUpdate
     */
    async sendPresenceUpdate(chatId: any, type: any) {
        return this.setPresence(chatId, type);
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

    get logger() {
        return this.container?.get('logger') || console;
    }

    /**
     * Connecte au service WhatsApp via Baileys
     */
    async connect(sessionPath: any = 'session') {
        const self = this; // Capture du contexte pour les callbacks

        // Guard: Prevent multiple simultaneous connection attempts
        if (self.isConnecting) {
            console.log('[Baileys] ⏳ Connexion déjà en cours, ignoré.');
            return;
        }
        self.isConnecting = true;

        // 🛡️ CLEANUP COMPLET : End previous socket to prevent listener accumulation
        if (self.sock) {
            try {
                console.log('[Baileys] 🧹 Nettoyage de l\'ancienne connexion...');
                // 1. Supprimer TOUS les listeners
                self.sock.ev.removeAllListeners();
                // 2. Terminer proprement le socket
                self.sock.end(new Error('Reconnecting'));
                // 3. Nullifier la référence
                self.sock = null;

                // 4. Petit délai pour laisser le temps au cleanup
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e: any) {
                console.warn('[Baileys] ⚠️ Erreur cleanup:', e.message);
            }
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
        self.sock.ev.on('connection.update', (update: any) => {
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

                // Gérer le cas spécifique "Stream Errored" qui boucle (Error 440)
                if (lastDisconnect.error?.message === 'Stream Errored (conflict)' || statusCode === 440) {
                    this.logger.error('\x1b[31m[Baileys:CRITICAL] Session conflict detected (Error 440).\x1b[0m');
                    this.logger.error('\x1b[31m[Baileys:CRITICAL] This usually means another instance of this bot is running.\x1b[0m');
                    this.logger.error('\x1b[31m[Baileys:CRITICAL] Please kill all other instances and restart.\x1b[0m');
                    self.isConnecting = false;
                    // Attendre plus longtemps avant de retenter pour éviter de spammer le serveur
                    setTimeout(() => self.connect(sessionPath), 10000);
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

                // 🛡️ Démarrer le monitoring des event listeners (toutes les minutes)
                self._startListenerMonitoring();

                eventBus.publish(BotEvents.CONNECTED);
            }
        });

        // 🛡️ Monitor encryption errors (to detect MessageCounterError)
        self.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const msg of messages) {
                if (msg.messageStubType === 'CIPHERTEXT' || msg.message?.protocolMessage?.type === 'EPHEMERAL_SETTING') {
                    // Possible decryption error metadata or protocol noisiness
                }
            }
        });
        self.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') {
                return;
            }

            for (const msg of messages) {
                try {
                    const msgType = msg.message ? Object.keys(msg.message)[0] : 'NO_MESSAGE';
                    const remoteJid = msg.key?.remoteJid || 'UNKNOWN';

                    // [FIX] Ignorer les statuts WhatsApp (Stories)
                    if (remoteJid === 'status@broadcast') {
                        continue;
                    }

                    if (msg.key.fromMe) {
                        continue;
                    }

                    // Filtrage des messages de protocole/système
                    if (!isRealMessage(msg)) {
                        continue;
                    }

                    // Extraction des variables de base immédiate (remoteJid déjà déclaré plus haut)
                    const sender = msg.key.participant || msg.key.remoteJid;
                    const senderName = msg.pushName || sender.split('@')[0];

                    // Vérification de sécurité supplémentaire (cas edge)
                    if (!msg.message) {
                        console.warn('[Baileys] ⚠️ Message passed isRealMessage but has no content - investigating');
                        console.warn('[Baileys] Message keys:', Object.keys(msg));
                        continue;
                    }

                    // [REFACTOR] Centralized Robust Normalization
                    const normalizedMsg = self._normalizeMessage(msg);
                    const { chatId, isGroup, sender: senderId, pushName, type: messageType } = normalizedMsg;

                    console.log(`[Baileys] 📝 Type=${messageType}, chatId=${chatId}, isGroup=${isGroup}`);

                    // 1. MISE À JOUR SOCIALE (USER)
                    if (self.userService) {
                        await self.userService.recordInteraction(senderId, pushName, isGroup ? chatId : null);
                    }

                    // 2. AUTO-DISCOVERY (GROUPES)
                    if (isGroup && self.groupService) {
                        const needsUpdate = await self.groupService.needsUpdate(chatId);

                        if (needsUpdate) {
                            try {
                                const metadata = await self.sock.groupMetadata(chatId);
                                await self.groupService.updateGroup(chatId, metadata);
                            } catch (err: any) {
                                if (isDebug) console.error(`[Discovery] Echec recup metadata groupe: ${err.message}`);
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
                            continue;
                        }
                    }

                    // 3. TRANSCRIPTION & AUDIO HANDLING (V6)
                    if (normalizedMsg.mediaType === 'audio') {
                        const transcribedText = await self.audioHandler.processAudioMessage(msg, normalizedMsg);
                        if (transcribedText) {
                            normalizedMsg.text = transcribedText;
                            normalizedMsg.isTranscribed = true;
                        }
                    }

                    // 🛡️ ANTI-DELETE logic avec protection race condition
                    // Ajouter un délai anti-suppression pour éviter les suppressions instantanées
                    setTimeout(async () => {
                        try {
                            await this.antiDeleteHandler.storeMessage(normalizedMsg);
                        } catch (err: any) {
                            console.warn('[Baileys] Erreur AntiDelete store:', err.message);
                        }
                    }, 100); // 100ms de tolérance

                    // EMIT MESSAGE
                    if (normalizedMsg.text || normalizedMsg.useNativeAudio) {
                        // 🚀 SWARM UPGRADE: Utilisation du Dispatcher pour parallélisation
                        // On utilise chatId comme Lock Key (pour l'ordre)
                        // On passe l'objet message complet pour le check isFastPath
                        swarm.dispatch(normalizedMsg.chatId, normalizedMsg, async () => {
                            if (self.messageCallback) {
                                await self.messageCallback(normalizedMsg);
                            }
                            eventBus.publish(BotEvents.MESSAGE_RECEIVED, normalizedMsg);
                            self.emit('message', normalizedMsg);
                        }).catch(err => {
                            console.error(`[Baileys] 💥 Error processing message in Swarm:`, err);
                        });
                    }

                    // 📬 ACCUSÉS DE RÉCEPTION (Humanisation)
                    // Envoyer les récépissés pour rendre le bot plus naturel
                    try {
                        const sendDeliveryReceipts = process.env.SEND_DELIVERY_RECEIPTS === 'true';
                        const sendReadReceipts = process.env.SEND_READ_RECEIPTS === 'true';

                        if (sendReadReceipts) {
                            // Envoyer accusé de lecture (double coche bleue)
                            await self.sock.readMessages([msg.key]);
                        } else if (sendDeliveryReceipts) {
                            // Note: Baileys envoie automatiquement les accusés de réception (double coche grise)
                            // si le message est dans le store. La lecture est le seul qu'on contrôle explicitement.
                            // Pour éviter d'envoyer la lecture, on ne fait rien ici.
                        }
                    } catch (receiptErr: any) {
                        // Erreur silencieuse - les récépissés ne sont pas critiques
                        if (process.env.DEBUG === 'true') {
                            console.warn('[Baileys] ⚠️ Erreur envoi récépissé:', receiptErr.message);
                        }
                    }

                } catch (err: any) {
                    console.error('[Baileys] ❌ Erreur traitement message:', err);
                }
            }
        });

        // REACTION: écoute des réactions
        self.sock.ev.on('messages.reaction', async (reactions: any) => {
            for (const reaction of reactions) {
                // [FIX Anti-doublon] On ne compte que les réactions SOUS les messages du BOT (fromMe: true)
                // Baileys: reaction.key est la clé du MESSAGE qui reçoit la réaction (pas la clé de la réaction elle-même)
                if (!reaction.key.fromMe) {
                    // Cette réaction est sur un message d'un AUTRE utilisateur, on ignore
                    continue;
                }

                const reactionData = {
                    chatId: reaction.key.remoteJid,
                    messageId: reaction.key.id,
                    sender: reaction.key.participant || reaction.key.remoteJid,
                    reaction: reaction.reaction.text,
                    timestamp: reaction.reaction.messageTimestamp
                };
                console.log(`[Baileys] 👍 Réaction reçue: ${reactionData.reaction} dans ${reactionData.chatId} (sur message bot)`);
                eventBus.publish(BotEvents.REACTION_RECEIVED, reactionData);
            }
        });

        // ANTI-DELETE: Écoute des messages supprimés
        self.sock.ev.on('messages.update', async (updates: any) => {
            await this.antiDeleteHandler.handleUpdate(updates);
        });


        // Écoute des synchronisations de contacts
        self.sock.ev.on('contacts.upsert', async (contacts: any) => {
            if (!self.userService) return;
            for (const contact of contacts) {
                if (contact.id && contact.lid) {
                    self.userService.registerLid(contact.id, contact.lid).catch((e: any) => {
                        this.logger.error(`[Baileys:Contacts] Error registering LID: ${e.message}`);
                    });
                }
            }
        });

        self.sock.ev.on('contacts.update', async (updates: any) => {
            if (!self.userService) return;
            for (const update of updates) {
                if (update.id && update.lid) {
                    self.userService.registerLid(update.id, update.lid).catch((e: any) => {
                        this.logger.error(`[Baileys:Contacts] Error registering LID: ${e.message}`);
                    });
                }
            }
        });


        // Écoute des événements de groupe
        self.sock.ev.on('group-participants.update', async (event: any) => {
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
        // Arrêter le monitoring
        this._stopListenerMonitoring();

        if (this.sock) {
            await this.sock.logout();
            this.sock = null;
        }
    }

    /**
     * Normalise un message Baileys vers un format standard
     */
    _normalizeMessage(msg: any) {
        const chatId = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        // [FIX] Déballage des messages (Ephemeral, ViewOnce, etc.)
        // Baileys encapsule parfois le vrai message
        let realMessage = msg.message;
        if (realMessage?.ephemeralMessage) {
            realMessage = realMessage.ephemeralMessage.message;
        }
        if (realMessage?.viewOnceMessage) {
            realMessage = realMessage.viewOnceMessage.message;
        }
        if (realMessage?.viewOnceMessageV2) {
            realMessage = realMessage.viewOnceMessageV2.message;
        }
        if (realMessage?.documentWithCaptionMessage) {
            realMessage = realMessage.documentWithCaptionMessage.message;
        }

        // On remplace msg.message par la version déballée pour simplifier la suite
        // (Attention: on ne modifie pas l'objet original msg qui est readonly parfois, on utilise une ref locale)
        const content = realMessage;

        // Extraction du texte
        let text = '';
        if (content?.conversation) text = content.conversation;
        else if (content?.extendedTextMessage?.text) text = content.extendedTextMessage.text;
        else if (content?.imageMessage?.caption) text = content.imageMessage.caption;
        else if (content?.videoMessage?.caption) text = content.videoMessage.caption;

        // Détection du type de média
        let mediaType: any = null;
        if (content?.imageMessage) mediaType = 'image';
        else if (content?.videoMessage) mediaType = 'video';
        else if (content?.audioMessage) mediaType = 'audio';
        else if (content?.documentMessage) mediaType = 'document';
        else if (content?.stickerMessage) mediaType = 'sticker';

        // Message cité et mentions
        const contextInfo = content?.extendedTextMessage?.contextInfo
            || content?.imageMessage?.contextInfo
            || content?.videoMessage?.contextInfo
            || content?.stickerMessage?.contextInfo // Ajout support sticker replies
            || null;

        const quotedMsg = (contextInfo?.stanzaId && contextInfo?.participant)
            ? {
                text: contextInfo.quotedMessage?.conversation ||
                    contextInfo.quotedMessage?.extendedTextMessage?.text ||
                    '',
                sender: contextInfo.participant,
                message: contextInfo.quotedMessage || null,
                id: contextInfo.stanzaId
            }
            : null;

        // Extraction des JIDs mentionnés (@mentions)
        const mentionedJids = contextInfo?.mentionedJid || [];

        return {
            id: msg.key.id,
            chatId,
            sender,
            senderName: msg.pushName || sender.split('@')[0],
            pushName: msg.pushName,
            text,
            isGroup,
            type: Object.keys(msg.message)[0],
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
    async sendText(chatId: any, text: any, options: any = {}) {
        if (!text) return;

        // 0. SPLITTING : Gestion des messages trop longs (WhatsApp limit ~65536, mais pour UX ~4096)
        const MAX_LENGTH = 4000;
        if (text.length > MAX_LENGTH) {
            console.log(`[Baileys] ✂️ Message trop long (${text.length} chars), découpage...`);
            const chunks = text.match(new RegExp(`.{1,${MAX_LENGTH}}`, 'g'));

            let lastSent: any = null;
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
                            console.log(`[Baileys] 🕵️ Mentions implicites trouvées: ${implicitResolved.resolved.map((m) => m.name).join(', ')}`);
                        }

                        // Dédoublonnage
                        mentions = [...new Set(mentions)];
                    }
                }
            } catch (err: any) {
                console.warn('[Baileys] Erreur résolution mentions:', err.message);
            }
        }

        const message = { text: formattedText };

        if (mentions.length > 0) {
            message.mentions = mentions;
        }

        const socketOptions = {};
        if (options.reply) {
            socketOptions.quoted = options.reply;
        }

        const sent = await this.sock.sendMessage(chatId, message, socketOptions);
        eventBus.publish(BotEvents.MESSAGE_SENT, { chatId, text });
        return sent; // Retourne le dernier sent
    }


    /**
     * Envoie une réaction (emoji) sur un message
     * @param {string} chatId 
     * @param {Object} key - Clé du message cible
     * @param {string} emoji 
     */
    async sendReaction(chatId: any, key: any, emoji: any) {
        if (!this.sock) return false;
        try {
            await this.sock.sendMessage(chatId, {
                react: {
                    text: emoji,
                    key: key
                }
            });
            return true;
        } catch (error: any) {
            console.error('[Baileys] Erreur sendReaction:', error);
            return false;
        }
    }

    /**
     * Envoie une note vocale (PTT)
     */
    async sendVoice(chatId: any, audioPath: any, options: any = {}) {
        const message = {
            audio: { url: audioPath },
            mimetype: 'audio/mp4',
            ptt: true // Affiche comme une note vocale
        };

        const socketOptions = {};
        if (options.reply) {
            socketOptions.quoted = options.reply;
        }

        return await this.sock.sendMessage(chatId, message, socketOptions);
    }

    /**
     * Envoie un fichier (Document)
     */
    async sendFile(chatId: any, filePath: any, fileName: any, caption: any = '') {
        try {
            await this.sock.sendMessage(chatId, {
                document: { url: filePath },
                fileName: fileName,
                mimetype: 'application/pdf',
                caption: caption
            });
            return true;
        } catch (error: any) {
            console.error('[Baileys] Erreur sendFile:', error);
            throw error;
        }
    }

    /**
     * (Module 2) Tag tous les membres du groupe
     */
    async tagAll(groupId: any, customMessage: any = '') {
        try {
            const metadata = await this.getGroupMetadata(groupId);
            const participants = metadata.participants.map((p: any) => p.id);

            const text = customMessage
                ? `📢 *Annonce Groupe*\n${formatToWhatsApp(customMessage)}`
                : `📢 *Tag All*`;

            await this.sock.sendMessage(groupId, {
                text,
                mentions: participants
            });
            return true;
        } catch (error: any) {
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
    async sendPoll(chatId: any, name: any, values: any, selectableCount: any = 1) {
        try {
            return await this.sock.sendMessage(chatId, {
                poll: {
                    name: name,
                    values: values,
                    selectableCount: selectableCount
                }
            });
        } catch (error: any) {
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
    async sendContact(chatId: any, displayName: any, phoneNumber: any) {
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
        } catch (error: any) {
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
    async editMessage(chatId: any, key: any, newText: any) {
        try {
            return await this.sock.sendMessage(chatId, {
                text: newText,
                edit: key
            });
        } catch (error: any) {
            console.error('[Baileys] Erreur editMessage:', error);
            return false;
        }
    }

    /**
     * Définit le statut de présence (typing, recording, etc.)
     * @param {string} chatId 
     * @param {string} type - 'composing' | 'recording' | 'paused'
     */
    async setPresence(chatId: any, type: any) {
        if (!this.sock) return;

        // Mapping types hive-mind -> baileys
        const presenceMap = {
            'composing': 'composing',
            'recording': 'recording',
            'paused': 'paused',
            'available': 'available',
            'unavailable': 'unavailable'
        };

        const status = presenceMap[type] || 'composing';
        try {
            await this.sock.sendPresenceUpdate(status, chatId);
        } catch (err: any) {
            console.warn(`[Baileys] Warning setPresence: ${err.message}`);
        }
    }

    /**
     * (Module 2) Bannit un utilisateur du groupe
     */
    async banUser(groupId: any, participant: any) {
        try {
            let userJid = participant;

            console.log(`[DEBUG Ban] Input participant: ${participant}`);

            // Si c'est un format LID (@lid), on doit trouver le vrai JID
            if (participant.includes('@lid')) {
                const lidNumber = participant.split('@')[0];
                // Chercher dans les participants du groupe
                const metadata = await this.getGroupMetadata(groupId);
                console.log(`[DEBUG Ban] Participants du groupe:`, metadata.participants.map((p: any) => ({ id: p.id, lid: p.lid })));

                const found = metadata.participants.find((p: any) =>
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
        } catch (error: any) {
            console.error('[Baileys] Erreur Ban:', error);
            return false;
        }
    }

    /**
     * Promeut un utilisateur en admin
     */
    async promoteUser(groupId: any, userJid: any) {
        try {
            await this.sock.groupParticipantsUpdate(groupId, [userJid], "promote");
            return true;
        } catch (error: any) {
            console.error('[Baileys] Erreur Promote:', error);
            return false;
        }
    }

    /**
     * Rétrograde un admin en membre
     */
    async demoteUser(groupId: any, userJid: any) {
        try {
            await this.sock.groupParticipantsUpdate(groupId, [userJid], "demote");
            return true;
        } catch (error: any) {
            console.error('[Baileys] Erreur Demote:', error);
            return false;
        }
    }

    /**
     * (Monitoring) Récupère les listeners actifs
     */
    getListenerCount() {
        if (!this.sock || !this.sock.ev) return 0;
        // [FIX] Vérification safe car l'implémentation de ev peut varier
        if (typeof this.sock.ev.eventNames === 'function') {
            return this.sock.ev.eventNames().reduce((acc: any, name: any) => {
                return acc + this.sock.ev.listenerCount(name);
            }, 0);
        }
        return 0;
    }

    /**
     * (Monitoring) Lance la surveillance périodique
     */
    _startListenerMonitoring() {
        if (this.listenerMonitor) clearInterval(this.listenerMonitor);

        this.listenerMonitor = setInterval(() => {
            const count = this.getListenerCount();
            if (count > 50) {
                console.warn(`[Baileys:Leak] ⚠️ High listener count: ${count}`);
                // Force cleanup si critique ?
            }
        }, 60000); // Check every minute
    }

    /**
     * (Monitoring) Stop la surveillance
     */
    _stopListenerMonitoring() {
        if (this.listenerMonitor) {
            clearInterval(this.listenerMonitor);
            this.listenerMonitor = null;
        }
    }

    /**
     * Récupère les métadonnées d'un groupe (nécessaire pour banUser/resolveMentions)
     */
    async getGroupMetadata(groupId: any) {
        if (!this.sock) throw new Error('Socket not initialized');
        return await this.sock.groupMetadata(groupId);
    }

    /**
     * Termine proprement la connexion WhatsApp
     */
    async disconnect() {
        if (!this.sock) return;

        console.log('[Baileys] 🔌 Déconnexion demandée...');
        
        try {
            // 1. Désactiver le monitoring
            this._stopListenerMonitoring();

            // 2. Notifier WhatsApp (optionnel mais recommandé pour le statut)
            await this.sock.sendPresenceUpdate('unavailable');
            
            // 3. Fermer le socket proprement
            // Note: end(undefined) permet une fermeture propre sans erreur levée
            this.sock.end(undefined);
            
            // 4. Nettoyer les listeners
            this.sock.ev.removeAllListeners();
            this.sock = null;
            
            console.log('[Baileys] ✅ Connexion fermée proprement.');
        } catch (error: any) {
            console.error('[Baileys] ⚠️ Erreur lors de la déconnexion:', error.message);
        }
    }
}

// Export singleton
const baileysTransport = new BaileysTransport();
export { baileysTransport };
export default baileysTransport;
