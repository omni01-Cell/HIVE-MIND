// @ts-nocheck
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { workingMemory } from '../../../services/workingMemory.js';
import { botIdentity } from '../../../utils/botIdentity.js';
import { config as globalConfig } from '../../../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class AudioHandler {
    transport: any;
    logger: any;

    constructor(transport, logger) {
        this.transport = transport; // Reference to BaileysTransport
        this.logger = logger;
    }

    /**
     * Traite un message audio (Transcription ou Audio Natif)
     * @param {Object} msg Message Baileys brut
     * @param {Object} normalizedMsg Message normalisé en cours de construction
     * @returns {Promise<string|null>} Texte transcrit ou null
     */
    async processAudioMessage(msg: any, normalizedMsg: any) {
        const isAudio = msg.message?.audioMessage;
        if (!isAudio) return null;

        const isGroup = normalizedMsg.isGroup;
        const chatId = normalizedMsg.chatId;
        const container = this.transport.container;

        if (!container?.has('transcriptionService')) {
            this.logger.warn('[AudioHandler] transcriptionService non disponible');
            return null;
        }

        let transcribedText: any = null;

        try {
            if (!isGroup) {
                transcribedText = await this._handlePvAudio(msg, normalizedMsg);
            } else {
                transcribedText = await this._handleGroupAudio(msg, normalizedMsg);
            }
        } catch (err: any) {
            this.logger.error(`[AudioHandler] Erreur globale: ${err.message}`);
        }

        return transcribedText;
    }

    async _handlePvAudio(msg: any, normalizedMsg: any) {
        const pvAudioDisabled = await workingMemory.isPvAudioDisabled();
        if (pvAudioDisabled) {
            this.logger.log(`[AudioHandler] ⏭️ Audio PV ignoré (désactivé globalement)`);
            return null;
        }

        const audioStrategy = globalConfig.models?.reglages_generaux?.audio_strategy || {};
        const useNativeAudio = audioStrategy.prefer_native && this.transport.container?.has('geminiLiveProvider');

        if (useNativeAudio) {
            const buffer = await this._downloadAudio(msg);
            if (buffer) {
                normalizedMsg.audioBuffer = buffer;
                normalizedMsg.useNativeAudio = true;
                normalizedMsg.text = '[AUDIO_NATIVE]';
                this.logger.log(`[AudioHandler] 🎙️ Mode Audio NATIF PV (${buffer.length} bytes)`);
                return '[AUDIO_NATIVE]';
            }
        }

        // Mode Cascade (STT)
        return await this._transcribeAudio(msg, `stt_pv_${msg.key.id}.ogg`);
    }

    async _handleGroupAudio(msg: any, normalizedMsg: any) {
        const groupService = this.transport.groupService;
        const groupSettings = groupService ? await groupService.getGroupSettings(normalizedMsg.chatId) : {};
        const mode = groupSettings?.audio_mode || 'mention_only';

        if (mode === 'off') {
            this.logger.log(`[AudioHandler] ⏭️ Audio Groupe ignoré (Mode OFF)`);
            return null;
        }

        const buffer = await this._downloadAudio(msg);
        if (!buffer) return null;

        const audioStrategy = globalConfig.models?.reglages_generaux?.audio_strategy || {};
        const useNativeAudio = audioStrategy.prefer_native && this.transport.container?.has('geminiLiveProvider');

        // Check if reply to bot
        const isQuotedReplyToBot = this._isReplyToBot(msg);

        if (useNativeAudio && (mode === 'full' || isQuotedReplyToBot)) {
            normalizedMsg.audioBuffer = buffer;
            normalizedMsg.useNativeAudio = true;
            normalizedMsg.text = '[AUDIO_NATIVE]';
            this.logger.log(`[AudioHandler] 🎙️ Mode Audio NATIF GROUPE (mode=${mode}, reply=${isQuotedReplyToBot})`);
            return '[AUDIO_NATIVE]';
        }

        // STT Fallback
        const transcribedText = await this._transcribeFromBuffer(buffer, `stt_${msg.key.id}.ogg`);
        if (!transcribedText) return null;

        const mentionsBot = botIdentity.isVocallyMentioned(transcribedText);
        if (!mentionsBot && !isQuotedReplyToBot && mode !== 'full') {
            return null;
        }

        return transcribedText;
    }

    async _downloadAudio(msg: any) {
        try {
            return await downloadMediaMessage(
                msg, 
                'buffer', 
                {}, 
                { 
                    reuploadRequest: this.transport.sock.updateMediaMessage, 
                    logger: pino({ level: 'silent' }) 
                }
            );
        } catch (err: any) {
            this.logger.error(`[AudioHandler] Erreur téléchargement: ${err.message}`);
            return null;
        }
    }

    async _transcribeAudio(msg: any, fileName: any) {
        const buffer = await this._downloadAudio(msg);
        if (!buffer) return null;
        return await this._transcribeFromBuffer(buffer, fileName);
    }

    async _transcribeFromBuffer(buffer: any, fileName: any) {
        const tempDir = join(process.cwd(), 'temp', 'stt');
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        const tempPath = join(tempDir, fileName);

        try {
            writeFileSync(tempPath, buffer);
            const transcriptionService = this.transport.container.get('transcriptionService');
            const text = await transcriptionService.transcribe(tempPath);
            return text;
        } catch (err: any) {
            this.logger.error(`[AudioHandler] Erreur STT: ${err.message}`);
            return null;
        } finally {
            try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch (e: any) {}
        }
    }

    _isReplyToBot(msg: any) {
        const audioCtx = msg.message?.audioMessage?.contextInfo;
        if (!audioCtx?.participant) return false;

        const rawBotId = this.transport.sock?.user?.id;
        const botLid = this.transport.sock?.user?.lid;
        const quotedSender = audioCtx.participant;

        return (rawBotId && quotedSender.includes(rawBotId.split(':')[0]?.split('@')[0])) ||
               (botLid && quotedSender.includes(botLid.split(':')[0]?.split('@')[0]));
    }
}
