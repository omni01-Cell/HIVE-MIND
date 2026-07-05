/**
 * HiveCoreConnection — Pont entre la TUI et le core HIVE-MIND.
 *
 * Ce fichier initialise le vrai BotCore (ServiceContainer, plugins, transport TUI)
 * et expose un AgentProtocol que les composants React (via useAgentStream) peuvent
 * consommer comme n'importe quel agent.
 */

import { openSync, writeSync, closeSync } from 'node:fs';
import { botCore } from '../../core/index.js';
import { hiveTransport } from '../transport/HiveTransport.js';
import { hiveConfig } from '../config/hiveConfig.js';
import { eventBus, BotEvents } from '../../core/events.js';
import type {
    AgentProtocol,
    AgentEvent,
    AgentContentPart,
    ToolConfirmationOutcome,
    ToolConfirmationPayload,
    ToolCallConfirmationDetails
} from '../ui/contexts/UIStateContext.js';
import type { MessageData } from '../../core/types/BotTypes.js';


const getTuiChatId = () => hiveConfig.getSessionId();
const TUI_SENDER = 'owner@local';
const TUI_SENDER_NAME = 'TUI Admin';

/**
 * Garde globale anti-écrasement : si le core ne réagit pas du tout en 60s,
 * on force `agent_end` plutôt que de laisser la TUI bloquée en "thinking".
 */
const AGENT_RESPONSE_HARD_TIMEOUT_MS = 60000;

/**
 * Taille du ring buffer des logs TUI redirigés.
 */
const TUI_LOG_RING_CAPACITY = 200;

/**
 * Active la sortie de debug (logs dans stdout) — désactivé par défaut en TUI.
 */
const TUI_DEBUG_MODE = process.env.HIVE_DEBUG === '1' || process.env.DEBUG === 'true';

/**
 * Redirige `process.stdout.write` vers un ring buffer (et un fichier log optionnel)
 * sans toucher à l'objet `console` lui-même.
 *
 * **Pourquoi cette approche** : tous les `console.log(...)` finissent par appeler
 * `process.stdout.write(...)`. En interceptant l'API bas-niveau sans réassigner
 * `console`, les modules qui ont capturé une référence à `console.log` au chargement
 * conservent leur binding. C'est un hack temporaire en attendant une abstraction
 * `Logger` propre (cf. `.GCC/afaire.md`).
 *
 * Retourne un thunk de restauration (`disableTuiLogRedirect`) qui réinstalle le
 * stdout original et ferme le fichier log.
 *
 * Pour activer le diagnostic, poser `HIVE_TUI_LOG_FILE=/tmp/hive-tui.log` avant
 * de lancer ; tout `console.log` y sera copié en append.
 */
function enableTuiLogRedirect(): () => void {
    if (!process.stdout) {
        return () => undefined;
    }
    const originalWrite = process.stdout.write.bind(process.stdout);
    const ring: Array<{ type: 'log' | 'warn' | 'info'; message: string; timestamp: number }> = [];

    const logFilePath = process.env.HIVE_TUI_LOG_FILE;
    let logFileFd: number | null = null;
    if (logFilePath) {
        try {
            logFileFd = openSync(logFilePath, 'a');
        } catch {
            logFileFd = null;
        }
    }

    const write = (
        chunk: string | Buffer | Uint8Array,
        encoding?: BufferEncoding | ((err?: Error | null) => void),
        cb?: (err?: Error | null) => void
    ): boolean => {
        let resolvedCb: ((err?: Error | null) => void) | undefined;
        if (typeof encoding === 'function') {
            resolvedCb = encoding;
        } else if (typeof cb === 'function') {
            resolvedCb = cb;
        }

        try {
            if (typeof chunk === 'string') {
                ring.push({ type: 'log', message: chunk, timestamp: Date.now() });
                if (ring.length > TUI_LOG_RING_CAPACITY) ring.shift();
                if (logFileFd !== null) {
                    try { writeSync(logFileFd, chunk); } catch { /* ignore */ }
                }
            }
        } catch {
            // jamais laisser le logger tuer le caller
        }

        if (resolvedCb) {
            resolvedCb();
        }
        // On "consomme" l'écriture : Ink contrôle stdout, on ne peut pas y toucher.
        return true;
    };

    process.stdout.write = write as typeof process.stdout.write;

    return () => {
        process.stdout.write = originalWrite;
        if (logFileFd !== null) {
            try { closeSync(logFileFd); } catch { /* ignore */ }
            logFileFd = null;
        }
    };
}

interface ServiceEvent {
    service: string;
    action?: string;
    timestamp?: number;
}

export class HiveCoreConnection implements AgentProtocol {
    private listeners = new Set<(event: AgentEvent) => void>();
    private messageListener: (message: MessageData) => void;
    private presenceListener: (event: { chatId: string; presence: string }) => void;
    private confirmationRequestListener: (event: { id: string; type: string; data: Record<string, unknown> & { questions?: unknown[] }; description: string }) => void;
    private serviceStartListener: (event: ServiceEvent) => void;
    private serviceEndListener: (event: ServiceEvent) => void;
    private customEventListener: (event: { name: string; message: string; timestamp?: number }) => void;
    private initialized = false;
    private hardTimeoutTimer: NodeJS.Timeout | null = null;
    private expectingResponse = false;
    private logRestore: (() => void) | null = null;
    private activeServices = new Map<string, { service: string; action: string; timestamp: number }>();

    public getActiveServices(): Array<{ service: string; action: string; timestamp: number }> {
        return Array.from(this.activeServices.values());
    }

    constructor() {
        this.serviceStartListener = (event: ServiceEvent) => {
            if (event && event.service) {
                this.activeServices.set(event.service, {
                    service: event.service,
                    action: event.action || 'thinking',
                    timestamp: event.timestamp || Date.now()
                });
                this.emit({
                    type: 'custom',
                    name: 'service_start',
                    message: event.service
                });
            }
        };

        this.serviceEndListener = (event: ServiceEvent) => {
            if (event && event.service) {
                this.activeServices.delete(event.service);
                this.emit({
                    type: 'custom',
                    name: 'service_end',
                    message: event.service
                });
            }
        };

        this.customEventListener = (event: { name: string; message: string; timestamp?: number }) => {
            if (event && event.name === 'context_usage_update') {
                this.emit({
                    type: 'custom',
                    name: 'context_usage_update',
                    message: event.message
                });
            }
        };

        this.messageListener = (message: MessageData) => {
            if (!message.text || message.text.trim().length === 0) return;
            this.emit({
                type: 'message',
                role: 'agent',
                content: [{ type: 'text', text: message.text }]
            });
        };

        this.presenceListener = (event: { chatId: string; presence: string }) => {
            if (event.chatId !== getTuiChatId()) return;
            if (event.presence === 'composing' || event.presence === 'recording') {
                if (!this.expectingResponse) {
                    this.expectingResponse = true;
                    this.emit({ type: 'agent_start' });
                }
            } else if (event.presence === 'paused' || event.presence === 'available') {
                if (this.expectingResponse) {
                    this.expectingResponse = false;
                    this.emit({ type: 'agent_end' });
                    this.clearHardTimeout();
                }
            }
        };

        this.confirmationRequestListener = (event: { id: string; type: string; data: Record<string, unknown> & { questions?: unknown[] }; description: string }) => {
            const resolvedType = event.type === 'ask_user' ? 'ask_user' : (event.type === 'permission_request' ? 'info' : 'exec');
            const confirmationDetails = {
                type: resolvedType,
                id: event.id,
                title: 'Security Confirmation',
                command: event.description,
                prompt: event.description,
                rootCommand: event.description,
                rootCommands: [event.description],
                commands: [event.description],
                questions: event.type === 'ask_user' ? (event.data.questions as unknown as Record<string, unknown>[]) : undefined,
                onConfirm: async (outcome: ToolConfirmationOutcome, payload?: ToolConfirmationPayload) => {
                    const approved = outcome !== ToolConfirmationOutcome.Cancel;
                    const feedback = payload?.feedback || (payload?.answers ? JSON.stringify(payload.answers) : undefined);
                    hiveTransport.submitConfirmationResponse(event.id, approved, feedback);

                    this.emit({
                        type: 'tool_response',
                        requestId: event.id,
                        name: 'security_confirmation',
                        isError: !approved,
                        display: {
                            result: approved ? 'Approved' : `Rejected: ${feedback || 'No feedback'}`
                        }
                    });
                }
            };

            this.emit({
                type: 'tool_request',
                requestId: event.id,
                name: 'security_confirmation',
                display: {
                    title: 'Security Confirmation',
                    format: 'notice'
                },
                _meta: {
                    legacyState: {
                        displayName: 'Security Confirmation',
                        description: event.description,
                        status: 'awaiting_approval'
                    }
                },
                confirmationDetails: confirmationDetails as unknown as ToolCallConfirmationDetails
            });
        };
    }

    /**
     * Initialise le core HIVE-MIND avec le transport TUI comme canal actif.
     * En mode TUI, intercepte stdout dès l'entrée dans connect() pour que ni le
     * boot du core (logo, progress bar, etc.) ni l'exécution de l'agent (logs
     * Router/FinOps/Agent) ne viennent écraser l'interface Ink.
     */
    async connect(): Promise<void> {
        if (this.initialized) return;

        // Forcer le mode local + transport TUI pour éviter d'activer WhatsApp/Discord.
        process.env.ACTIVE_TRANSPORTS = 'ink-cli';
        process.env.APP_ENV = 'local';

        if (!TUI_DEBUG_MODE) {
            this.logRestore = enableTuiLogRedirect();
        }

        await botCore.init();

        // Écouter les messages et présences sortants du core pour les traduire en AgentEvents.
        hiveTransport.on('message', this.messageListener);
        hiveTransport.on('presence', this.presenceListener);
        hiveTransport.on('confirmation_request', this.confirmationRequestListener);

        // Écouter le eventBus du Core pour les services actifs
        eventBus.on(BotEvents.SERVICE_START, this.serviceStartListener);
        eventBus.on(BotEvents.SERVICE_END, this.serviceEndListener);
        eventBus.on(BotEvents.CUSTOM, this.customEventListener);

        this.initialized = true;
    }

    /**
     * Restaure stdout et éteint proprement le transport.
     */
    async disconnect(): Promise<void> {
        if (!this.initialized) return;
        hiveTransport.off('message', this.messageListener);
        hiveTransport.off('presence', this.presenceListener);
        hiveTransport.off('confirmation_request', this.confirmationRequestListener);

        eventBus.off(BotEvents.SERVICE_START, this.serviceStartListener);
        eventBus.off(BotEvents.SERVICE_END, this.serviceEndListener);
        eventBus.off(BotEvents.CUSTOM, this.customEventListener);

        this.clearHardTimeout();
        if (this.logRestore) {
            this.logRestore();
            this.logRestore = null;
        }
        this.initialized = false;
    }


    /**
     * Envoie un message utilisateur au core.
     */
    async send(request: { message: { content: AgentContentPart[] } }): Promise<{ streamId: string }> {
        const text = request.message.content.map((part) => part.text).join('');
        if (!text.trim()) {
            throw new Error('Cannot send an empty message to the core.');
        }

        this.expectingResponse = true;
        this.emit({ type: 'agent_start' });

        hiveTransport.submitUserMessage(text, {
            chatId: getTuiChatId(),
            sender: TUI_SENDER,
            senderName: TUI_SENDER_NAME,
            authorityLevel: 'DIVIN (SuperUser)',
            sourceChannel: 'ink-cli',
            systemContext: hiveConfig.getHiveMdContext()
        });

        this.clearHardTimeout();
        this.hardTimeoutTimer = setTimeout(() => {
            if (this.expectingResponse) {
                this.expectingResponse = false;
                this.emit({ type: 'agent_end' });
            }
        }, AGENT_RESPONSE_HARD_TIMEOUT_MS);

        return { streamId: `tui-${Date.now()}` };
    }

    /**
     * Abonne un listener aux événements agent (messages, tool calls, erreurs).
     */
    subscribe(listener: (event: AgentEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Annule la requête en cours.
     */
    async abort(): Promise<void> {
        this.clearHardTimeout();
        this.expectingResponse = false;
        this.emit({ type: 'agent_end' });
        return Promise.resolve();
    }

    private clearHardTimeout(): void {
        if (this.hardTimeoutTimer) {
            clearTimeout(this.hardTimeoutTimer);
            this.hardTimeoutTimer = null;
        }
    }

    private emit(event: AgentEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('[HiveCoreConnection] Listener error:', error);
            }
        }
    }
}

export const hiveCoreConnection = new HiveCoreConnection();

export default hiveCoreConnection;
