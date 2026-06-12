/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { debugLogger } from '../../utils/errors.js';
import { HiveConfig } from '../../config/hiveConfig.js';
import { AudioRecorder, TranscriptionFactory, TranscriptionProvider } from '../contexts/UIStateContext.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { MergedSettings } from '../../config/settingsSchema.js';
import type { Key } from './useKeypress.js';
import { Command } from '../key/keyMatchers.js';

interface UseVoiceModeProps {
  buffer: TextBuffer;
  config: HiveConfig;
  settings: MergedSettings;
  setQueueErrorMessage: (message: string | null) => void;
  isVoiceModeEnabled: boolean;
  setVoiceModeEnabled: (enabled: boolean) => void;
  keyMatchers: Record<Command, (key: Key) => boolean>;
}

const HOLD_DELAY_MS = 600;
const RELEASE_DELAY_MS = 300;

interface VoiceServiceRefs {
  disconnectTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  transcriptionServiceRef: React.MutableRefObject<TranscriptionProvider | null>;
  recorderRef: React.MutableRefObject<AudioRecorder | null>;
  stopRequestedRef: React.MutableRefObject<boolean>;
  isRecordingRef: React.MutableRefObject<boolean>;
  recordingInProgressRef: React.MutableRefObject<boolean>;
  lastFailureTimeRef: React.MutableRefObject<number>;
  liveTranscriptionRef: React.MutableRefObject<string>;
  turnBaselineRef: React.MutableRefObject<string | null>;
  turnBaselineCursorOffsetRef: React.MutableRefObject<number>;
  bufferRef: React.MutableRefObject<TextBuffer>;
}

function resetRecordingState(refs: VoiceServiceRefs) {
    refs.isRecordingRef.current = false;
    refs.recordingInProgressRef.current = false;
}

function cleanupRecordingRefs(refs: VoiceServiceRefs) {
    if (refs.recorderRef.current) {
        refs.recorderRef.current.stop();
        refs.recorderRef.current = null;
    }
    if (refs.transcriptionServiceRef.current) {
        refs.transcriptionServiceRef.current.disconnect();
        refs.transcriptionServiceRef.current = null;
    }
}

function connectTranscriptionService(
    currentService: TranscriptionProvider,
    refs: VoiceServiceRefs,
    setIsRecording: (v: boolean) => void,
    setIsConnecting: (v: boolean) => void
) {
    currentService.on('transcription', (text) => {
        if (refs.transcriptionServiceRef.current !== currentService && refs.stopRequestedRef.current) return;
        if (text) {
            const baseline = refs.turnBaselineRef.current ?? '';
            const insertOffset = refs.turnBaselineCursorOffsetRef.current;
            const textBefore = baseline.slice(0, insertOffset);
            const textAfter = baseline.slice(insertOffset);
            const prefix = textBefore.length > 0 && !/\s$/.test(textBefore) ? textBefore + ' ' : textBefore;
            const suffix = text.length > 0 && textAfter.length > 0 && !/^\s/.test(textAfter) ? ' ' : '';
            refs.bufferRef.current.setText(prefix + text + suffix + textAfter, prefix.length + text.length);
        }
        refs.liveTranscriptionRef.current = text;
    });

    currentService.on('turnComplete', () => {
        if (refs.transcriptionServiceRef.current !== currentService && refs.stopRequestedRef.current) return;
        refs.turnBaselineRef.current = refs.bufferRef.current.text;
        refs.turnBaselineCursorOffsetRef.current = refs.bufferRef.current.getOffset();
        refs.liveTranscriptionRef.current = '';
    });

    currentService.on('error', (err) => {
        if (refs.transcriptionServiceRef.current !== currentService) return;
        debugLogger.error('[Voice] Transcription error:', err);
        refs.lastFailureTimeRef.current = Date.now();
        refs.recordingInProgressRef.current = false;
    });

    currentService.on('close', () => {
        if (refs.transcriptionServiceRef.current !== currentService) return;
        if (!refs.stopRequestedRef.current) {
            setIsRecording(false);
            resetRecordingState(refs);
            setIsConnecting(false);
            refs.lastFailureTimeRef.current = Date.now();
        }
    });
}

async function startVoiceAsync(
    refs: VoiceServiceRefs,
    _config: HiveConfig,
    voiceSettings: MergedSettings['experimental']['voice'],
    apiKey: string,
    cleanupIfStopped: () => boolean,
    setIsRecording: (v: boolean) => void,
    setIsConnecting: (v: boolean) => void,
    setQueueErrorMessage: (msg: string) => void,
    stopVoiceRecording: () => void
) {
    if (refs.disconnectTimerRef.current) {
        clearTimeout(refs.disconnectTimerRef.current);
        refs.disconnectTimerRef.current = null;
    }
    if (refs.transcriptionServiceRef.current) {
        refs.transcriptionServiceRef.current.disconnect();
        refs.transcriptionServiceRef.current = null;
    }

    if (cleanupIfStopped()) return;

    const voiceBackend = voiceSettings?.backend ?? 'gemini-live';

    if (!apiKey && voiceBackend === 'gemini-live') {
        setQueueErrorMessage(
            'Cloud voice mode requires a GEMINI_API_KEY. Please set it in your environment or ~/.gemini/.env.'
        );
        setIsRecording(false);
        resetRecordingState(refs);
        setIsConnecting(false);
        refs.lastFailureTimeRef.current = Date.now();
        return;
    }

    if (voiceBackend === 'gemini-live') {
        refs.recorderRef.current = new AudioRecorder();
    }

    const currentService = TranscriptionFactory.createProvider(voiceSettings, apiKey);
    refs.transcriptionServiceRef.current = currentService;
    connectTranscriptionService(currentService, refs, setIsRecording, setIsConnecting);

    try {
        await currentService.connect();
        if (cleanupIfStopped()) return;
        await refs.recorderRef.current?.start();
        if (cleanupIfStopped()) return;
        setIsConnecting(false);

        refs.recorderRef.current?.on('data', (chunk) => {
            if ((voiceSettings?.backend ?? 'gemini-live') === 'gemini-live') {
                currentService.sendAudioChunk(chunk);
            }
        });
        refs.recorderRef.current?.on('error', (err) => {
            debugLogger.error('[Voice] Recorder error:', err);
            stopVoiceRecording();
            refs.lastFailureTimeRef.current = Date.now();
        });
    } catch (err: unknown) {
        if (refs.transcriptionServiceRef.current !== currentService) return;
        const message = err instanceof Error ? err.message : String(err);
        setQueueErrorMessage(`Voice mode failure: ${message}`);
        setIsRecording(false);
        resetRecordingState(refs);
        setIsConnecting(false);
        refs.lastFailureTimeRef.current = Date.now();
        cleanupRecordingRefs(refs);
    }
}

export function useVoiceMode({
    buffer,
    config,
    settings,
    setQueueErrorMessage,
    isVoiceModeEnabled,
    setVoiceModeEnabled,
    keyMatchers
}: UseVoiceModeProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const liveTranscriptionRef = useRef('');
    const stopRequestedRef = useRef(false);
    const isRecordingRef = useRef(false);
    const lastFailureTimeRef = useRef(0);
    const recordingInProgressRef = useRef(false);
    const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const transcriptionServiceRef = useRef<TranscriptionProvider | null>(null);
    const turnBaselineRef = useRef<string | null>(null);
    const turnBaselineCursorOffsetRef = useRef<number>(0);
    const pttStateRef = useRef<'idle' | 'possible-hold' | 'recording'>('idle');
    const pttTimerRef = useRef<NodeJS.Timeout | null>(null);
    const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const bufferRef = useRef(buffer);
    bufferRef.current = buffer;

    const refs: VoiceServiceRefs = {
        disconnectTimerRef, transcriptionServiceRef, recorderRef,
        stopRequestedRef, isRecordingRef, recordingInProgressRef,
        lastFailureTimeRef, liveTranscriptionRef, turnBaselineRef,
        turnBaselineCursorOffsetRef, bufferRef
    };

    const stopVoiceRecording = useCallback(() => {
        if (stopRequestedRef.current) return;
        debugLogger.debug('[Voice] Stop requested');
        stopRequestedRef.current = true;
        setIsRecording(false);
        isRecordingRef.current = false;
        setIsConnecting(false);
        if (recorderRef.current) { recorderRef.current.stop(); recorderRef.current = null; }
        const svc = transcriptionServiceRef.current;
        if (svc) {
            const ms = settings.experimental.voice.stopGracePeriodMs;
            debugLogger.debug(`[Voice] Draining transcription for ${ms}ms`);
            if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = setTimeout(() => {
                debugLogger.debug('[Voice] Grace period ended, disconnecting service');
                svc.disconnect();
                if (transcriptionServiceRef.current === svc) transcriptionServiceRef.current = null;
                disconnectTimerRef.current = null;
                liveTranscriptionRef.current = '';
            }, ms);
        } else {
            liveTranscriptionRef.current = '';
        }
        pttStateRef.current = 'idle';
    }, [settings.experimental.voice]);

    const cleanupIfStopped = useCallback((): boolean => {
        if (!stopRequestedRef.current) return false;
        cleanupRecordingRefs(refs);
        setIsRecording(false);
        resetRecordingState(refs);
        setIsConnecting(false);
        return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startVoiceRecording = useCallback(() => {
        if (isRecordingRef.current || Date.now() - lastFailureTimeRef.current < 2000) return;
        if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
        recordingInProgressRef.current = true;
        turnBaselineRef.current = bufferRef.current.text;
        turnBaselineCursorOffsetRef.current = bufferRef.current.getOffset();
        setIsConnecting(true);
        setIsRecording(true);
        isRecordingRef.current = true;
        liveTranscriptionRef.current = '';
        stopRequestedRef.current = false;
        const apiKey = config.getContentGeneratorConfig()?.apiKey || process.env['GEMINI_API_KEY'] || '';
        void startVoiceAsync(refs, config, settings.experimental.voice, apiKey, cleanupIfStopped, setIsRecording, setIsConnecting, setQueueErrorMessage, stopVoiceRecording);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, settings.experimental.voice, setQueueErrorMessage, stopVoiceRecording, cleanupIfStopped]);

    useEffect(() => () => {
        if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
        if (recorderRef.current) { recorderRef.current.stop(); recorderRef.current = null; }
        if (transcriptionServiceRef.current) { transcriptionServiceRef.current.disconnect(); transcriptionServiceRef.current = null; }
        if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
        if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    }, []);

    const isSpaceNoModifiers = useCallback(
        (key: Key) => key.name === 'space' && !key.ctrl && !key.alt && !key.shift && !key.cmd,
        []
    );

    const handleActiveRecordingKey = useCallback(
        (key: Key): boolean => {
            if (keyMatchers[Command.ESCAPE](key)) { stopVoiceRecording(); return true; }
            if (keyMatchers[Command.VOICE_MODE_PTT](key)) {
                if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
                pttTimerRef.current = setTimeout(() => { stopVoiceRecording(); pttTimerRef.current = null; }, RELEASE_DELAY_MS);
                return true;
            }
            return true;
        },
        [keyMatchers, stopVoiceRecording]
    );

    const handlePttPushToTalk = useCallback((): boolean => {
        if (pttStateRef.current === 'idle') {
            buffer.insert(' ');
            pttStateRef.current = 'possible-hold';
            if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
            pttTimerRef.current = setTimeout(() => { pttStateRef.current = 'idle'; pttTimerRef.current = null; }, HOLD_DELAY_MS);
            return true;
        }
        if (pttStateRef.current === 'possible-hold') {
            if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
            buffer.backspace();
            pttStateRef.current = 'recording';
            startVoiceRecording();
            pttTimerRef.current = setTimeout(() => { stopVoiceRecording(); pttTimerRef.current = null; }, RELEASE_DELAY_MS);
            return true;
        }
        return false;
    }, [buffer, startVoiceRecording, stopVoiceRecording]);

    const handlePttKeyWhenEnabled = useCallback(
        (key: Key): boolean => {
            if (!keyMatchers[Command.VOICE_MODE_PTT](key) || !isSpaceNoModifiers(key)) return false;
            const mode = settings.experimental.voice?.activationMode ?? 'push-to-talk';
            if (mode === 'toggle') { startVoiceRecording(); return true; }
            return handlePttPushToTalk();
        },
        [keyMatchers, isSpaceNoModifiers, settings.experimental.voice, startVoiceRecording, handlePttPushToTalk]
    );

    const handleVoiceInput = useCallback(
        (key: Key): boolean => {
            if (isRecording || isRecordingRef.current) return handleActiveRecordingKey(key);
            if (!isVoiceModeEnabled) return false;
            if (keyMatchers[Command.ESCAPE](key) && buffer.text === '') { setVoiceModeEnabled(false); return true; }
            if (handlePttKeyWhenEnabled(key)) return true;
            if (pttStateRef.current === 'possible-hold') {
                pttStateRef.current = 'idle';
                if (pttTimerRef.current) { clearTimeout(pttTimerRef.current); pttTimerRef.current = null; }
            }
            return false;
        },
        [isRecording, isVoiceModeEnabled, keyMatchers, buffer, setVoiceModeEnabled, handleActiveRecordingKey, handlePttKeyWhenEnabled]
    );

    return {
        isRecording,
        isConnecting,
        startVoiceRecording,
        stopVoiceRecording,
        handleVoiceInput,
        resetTurnBaseline: () => { turnBaselineRef.current = null; }
    };
}
