/**
 * @license
 * Copyright 2026 HIVE-MIND
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';

interface VoiceModelDialogProps {
    onClose: () => void;
}

type DialogView = 'tts' | 'stt' | 'gemini-voice';

const GEMINI_VOICES = [
    { value: 'Aoede', label: 'Aoede', description: 'Voix féminine claire et posée' },
    { value: 'Zephyr', label: 'Zephyr', description: 'Voix masculine douce et chaleureuse' },
    { value: 'Charon', label: 'Charon', description: 'Voix masculine grave et profonde' },
    { value: 'Puck', label: 'Puck', description: 'Voix enjouée et dynamique' },
    { value: 'Kore', label: 'Kore', description: 'Voix féminine mélodieuse' },
    { value: 'Fenrir', label: 'Fenrir', description: 'Voix masculine forte et assurée' },
    { value: 'Leda', label: 'Leda', description: 'Voix féminine douce et feutrée' },
    { value: 'Orus', label: 'Orus', description: 'Voix masculine professionnelle' }
];

export function VoiceModelDialog({
    onClose
}: VoiceModelDialogProps): React.JSX.Element {
    const { settings, setSetting } = useSettingsStore();
    const [view, setView] = useState<DialogView>('tts');

    const currentTtsProvider = settings.merged.experimental.voice?.ttsProvider ?? 'minimax';
    const currentSttProvider = settings.merged.experimental.voice?.sttProvider ?? 'groq';
    const currentGeminiVoice = settings.merged.experimental.voice?.geminiVoice ?? 'Aoede';

    const handleKeypress = useCallback(
        (key: Key) => {
            if (key.name === 'escape') {
                if (view === 'stt') {
                    setView('tts');
                } else if (view === 'gemini-voice') {
                    setView('stt');
                } else {
                    onClose();
                }
                return true;
            }
            return false;
        },
        [view, onClose]
    );

    useKeypress(handleKeypress, { isActive: true });

    const handleTtsSelect = useCallback(
        (value: string) => {
            setSetting(SettingScope.User, 'experimental.voice.ttsProvider', value);
            setView('stt');
        },
        [setSetting]
    );

    const handleSttSelect = useCallback(
        (value: string) => {
            setSetting(SettingScope.User, 'experimental.voice.sttProvider', value);
            // Si TTS est Gemini, on propose de configurer la voix Gemini, sinon on ferme.
            if (currentTtsProvider === 'gemini') {
                setView('gemini-voice');
            } else {
                onClose();
            }
        },
        [currentTtsProvider, setSetting, onClose]
    );

    const handleVoiceSelect = useCallback(
        (value: string) => {
            setSetting(SettingScope.User, 'experimental.voice.geminiVoice', value);
            onClose();
        },
        [setSetting, onClose]
    );

    const ttsOptions = useMemo(
        () => [
            {
                value: 'minimax',
                title: 'Minimax Persona (Recommandé)',
                description: 'Synthèse vocale ultra-réaliste personnalisée de HIVE-MIND.',
                key: 'minimax'
            },
            {
                value: 'gemini',
                title: 'Gemini Voice Cloud',
                description: 'Synthèse vocale native Google Cloud (haute fidélité).',
                key: 'gemini'
            },
            {
                value: 'gtts',
                title: 'Google TTS (Fallback)',
                description: 'Synthèse vocale classique gTTS offline/online basique.',
                key: 'gtts'
            }
        ],
        []
    );

    const sttOptions = useMemo(
        () => [
            {
                value: 'groq',
                title: 'Groq Whisper (Recommandé)',
                description: 'Transcription ultra-rapide via Whisper sur Groq Cloud.',
                key: 'groq'
            },
            {
                value: 'gemini-live',
                title: 'Gemini Live STT',
                description: 'Transcription interactive temps réel via Gemini Live.',
                key: 'gemini-live'
            }
        ],
        []
    );

    const voiceOptions = useMemo(
        () =>
            GEMINI_VOICES.map((v) => ({
                value: v.value,
                title: v.label,
                description: v.description,
                key: v.value
            })),
        []
    );

    const ttsInitialIndex = useMemo(
        () => ttsOptions.findIndex((o) => o.value === currentTtsProvider),
        [currentTtsProvider, ttsOptions]
    );

    const sttInitialIndex = useMemo(
        () => sttOptions.findIndex((o) => o.value === currentSttProvider),
        [currentSttProvider, sttOptions]
    );

    const voiceInitialIndex = useMemo(
        () => voiceOptions.findIndex((o) => o.value === currentGeminiVoice),
        [currentGeminiVoice, voiceOptions]
    );

    return (
        <Box
            borderStyle="round"
            borderColor={theme.border.default}
            flexDirection="column"
            padding={1}
            width="100%"
        >
            <Text bold>
                {view === 'tts' && 'Étape 1 : Choisir le moteur de synthèse vocale (TTS)'}
                {view === 'stt' && 'Étape 2 : Choisir le moteur de transcription vocale (STT)'}
                {view === 'gemini-voice' && 'Étape 3 : Sélectionner une voix Gemini'}
            </Text>

            <Box marginTop={1} flexDirection="column">
                {view === 'tts' && (
                    <DescriptiveRadioButtonSelect
                        items={ttsOptions}
                        onSelect={handleTtsSelect}
                        initialIndex={ttsInitialIndex !== -1 ? ttsInitialIndex : 0}
                        showNumbers={true}
                    />
                )}
                {view === 'stt' && (
                    <DescriptiveRadioButtonSelect
                        items={sttOptions}
                        onSelect={handleSttSelect}
                        initialIndex={sttInitialIndex !== -1 ? sttInitialIndex : 0}
                        showNumbers={true}
                    />
                )}
                {view === 'gemini-voice' && (
                    <DescriptiveRadioButtonSelect
                        items={voiceOptions}
                        onSelect={handleVoiceSelect}
                        initialIndex={voiceInitialIndex !== -1 ? voiceInitialIndex : 0}
                        showNumbers={true}
                    />
                )}
            </Box>

            <Box marginTop={1} flexDirection="column">
                <Text color={theme.text.secondary}>
                    {view !== 'tts'
                        ? '(Echap pour revenir en arrière)'
                        : '(Echap pour fermer)'}
                </Text>
            </Box>
        </Box>
    );
}
