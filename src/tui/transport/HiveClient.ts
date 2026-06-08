/**
 * HiveClient — Client Gemini pour le TUI HIVE-MIND
 *
 * Implémente l'interface GeminiClient pour permettre au TUI de communiquer
 * avec le core HIVE-MIND via HiveTransport.
 *
 * Flux :
 *   TUI → HiveClient.sendMessageStream()
 *     → HiveTransport.sendText("tui-local", text)
 *     → core._handleMessage(BotEvent)
 *     → ReAct loop → LLM → tools → response
 *     → HiveTransport.onMessage callback
 *     → HiveClient émet les événements GeminiEvent
 *     → TUI traite le flux
 */

import { EventEmitter } from 'node:events';
import type { MessageData } from '../../core/types/BotTypes.js';
import { hiveTransport } from './HiveTransport.js';
import { hiveFileService, HiveFileService } from './HiveFileService.js';

// Types Gemini copiés depuis les stubs pour éviter les dépendances circulaires
export enum ServerGeminiEventType {
  Content = 'content',
  Thought = 'thought',
  ToolCallRequest = 'tool_call_request',
  ToolCallConfirmation = 'tool_call_confirmation',
  ToolCallResponse = 'tool_call_response',
  Finished = 'finished',
  Error = 'error',
  ChatCompressed = 'chat_compressed',
  UserCancelled = 'user_cancelled',
  AgentExecutionStopped = 'agent_execution_stopped',
  AgentExecutionBlocked = 'agent_execution_blocked',
  MaxSessionTurns = 'max_session_turns',
  ContextWindowWillOverflow = 'context_window_will_overflow',
  Citation = 'citation',
  ModelInfo = 'model_info',
  LoopDetected = 'loop_detected',
  Retry = 'retry',
  InvalidStream = 'invalid_stream',
}

export interface GeminiEvent {
  type: ServerGeminiEventType;
  value: unknown;
}

export interface ContentEventValue {
  content: string;
  cumulativeContent?: string;
}

export interface ThoughtEventValue {
  thought: string;
}

export interface FinishedEventValue {
  finishReason?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface ErrorEventValue {
  message: string;
  code?: string;
}

export interface ToolCallRequestInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status?: string;
}

type HistoryEntry = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

/**
 * HiveClient implémente l'interface GeminiClient
 * pour connecter le TUI au core HIVE-MIND
 */
export class HiveClient extends EventEmitter {
    private history: HistoryEntry[] = [];
    private currentModel: string;
    private isProcessing = false;
    private abortController: AbortController | null = null;

    constructor(model: string = 'gemini-2.0-flash') {
        super();
        this.currentModel = model;

        // Écouter les réponses du core via HiveTransport
        hiveTransport.onMessage((message: MessageData) => {
            this.handleCoreResponse(message);
        });
    }

    /**
   * Envoie un message et retourne un flux d'événements
   * Cette méthode est appelée par useGeminiStream
   */
    async *sendMessageStream(
        query: unknown,
        abortSignal: AbortSignal,
        promptId?: string,
        _options?: unknown,
        _originalQuery?: unknown
    ): AsyncGenerator<GeminiEvent> {
        if (this.isProcessing) {
            yield {
                type: ServerGeminiEventType.Error,
                value: { message: 'Un traitement est déjà en cours' }
            };
            return;
        }

        this.isProcessing = true;
        this.abortController = new AbortController();

        // Convertir le query en texte
        const text = this.queryToText(query);

        // Ajouter à l'historique
        this.history.push({
            role: 'user',
            parts: [{ text }]
        });

        try {
            // Émettre un événement de contenu pour montrer que le traitement commence
            yield {
                type: ServerGeminiEventType.ModelInfo,
                value: { model: this.currentModel }
            };

            // Envoyer au core via HiveTransport
            await hiveTransport.sendText('tui-local', text, { promptId });

            // Attendre la réponse du core (gérée par handleCoreResponse)
            // Les événements seront émis via cet objet
            const response = await this.waitForResponse(abortSignal);

            if (response) {
                // Ajouter la réponse à l'historique
                this.history.push({
                    role: 'model',
                    parts: [{ text: response }]
                });

                // Émettre les événements de contenu
                yield {
                    type: ServerGeminiEventType.Content,
                    value: { content: response, cumulativeContent: response }
                };

                // Émettre l'événement de fin
                yield {
                    type: ServerGeminiEventType.Finished,
                    value: { finishReason: 'stop' }
                };
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            yield {
                type: ServerGeminiEventType.Error,
                value: { message }
            };
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    /**
   * Génère du contenu sans streaming (pour les commandes slash, etc.)
   */
    async generateContent(query: unknown): Promise<string> {
        const text = this.queryToText(query);

        // Envoyer au core et attendre la réponse
        await hiveTransport.sendText('tui-local', text);

        // Retourner un placeholder le temps que le streaming soit implémenté
        return `[HiveClient] Traitement de: ${text}`;
    }

    /**
   * Ajoute une entrée à l'historique
   */
    async addHistory(entry: { role: 'user' | 'model'; content: unknown }): Promise<void> {
        const text = this.queryToText(entry.content);
        this.history.push({
            role: entry.role,
            parts: [{ text }]
        });
    }

    /**
   * Définit l'historique complet
   */
    setHistory(history: HistoryEntry[]): void {
        this.history = [...history];
    }

    /**
   * Réinitialise le chat
   */
    async resetChat(): Promise<void> {
        this.history = [];
        this.currentModel = 'gemini-2.0-flash';
    }

    /**
   * Définit les outils disponibles
   */
    async setTools(): Promise<void> {
    // Les outils sont gérés par le core, pas besoin de les définir ici
    }

    /**
   * Retourne le modèle actuel
   */
    getCurrentSequenceModel(): string {
        return this.currentModel;
    }

    /**
   * Retourne le service de détection de boucle
   */
    getLoopDetectionService() {
        return {
            disableForSession: () => {
                console.log('[HiveClient] Détection de boucle désactivée');
            }
        };
    }

    /**
   * Retourne le service de fichiers
   */
    getFileService(): HiveFileService {
        return hiveFileService;
    }

    /**
   * Retourne les options de filtrage de fichiers
   */
    getFileFilteringOptions() {
        return {
            respectGitIgnore: true,
            respectGeminiIgnore: true,
            enableFileWatcher: false,
            maxFileCount: 1000,
            searchTimeout: 5000
        };
    }

    /**
   * Retourne le registre des outils
   */
    getToolRegistry() {
        return {
            getTool: (name: string) => {
                // Retourner un outil simulé pour les opérations de fichiers
                return {
                    buildAndExecute: async (_options: Record<string, unknown>, _signal: AbortSignal) => {
                        // Implémenter les outils de fichiers ici
                        return { llmContent: `Outil ${name} non implémenté` };
                    }
                };
            }
        };
    }

    /**
   * Retourne le contexte du workspace
   */
    getWorkspaceContext() {
        return {
            getDirectories: () => [process.cwd()]
        };
    }

    /**
   * Retourne la direction cible
   */
    getTargetDir(): string {
        return process.cwd();
    }

    /**
   * Valide l'accès à un chemin
   */
    validatePathAccess(_path: string, _mode: 'read' | 'write'): boolean {
    // Pour l'instant, autoriser tous les accès en lecture
        return mode === 'read';
    }

    /**
   * Retourne les options de recherche récursive de fichiers
   */
    getEnableRecursiveFileSearch(): boolean {
        return true;
    }

    /**
   * Supprime les pensées de l'historique
   */
    stripThoughtsFromHistory(): void {
    // Pas de pensées dans l'historique HIVE-MIND
    }

    /**
   * Reprend un chat avec un historique
   */
    async resumeChat(clientHistory: unknown[], _resumedData: unknown): Promise<void> {
        this.history = clientHistory as HistoryEntry[];
    }

    /**
   * Convertit un query en texte
   */
    private queryToText(query: unknown): string {
        if (typeof query === 'string') {
            return query;
        }

        if (Array.isArray(query)) {
            return query
                .map(part => {
                    if (typeof part === 'string') return part;
                    if (part && typeof part === 'object' && 'text' in part) {
                        return (part as { text: string }).text;
                    }
                    return '';
                })
                .filter(Boolean)
                .join('\n');
        }

        if (query && typeof query === 'object' && 'text' in query) {
            return (query as { text: string }).text;
        }

        return String(query);
    }

    /**
   * Attend la réponse du core
   */
    private waitForResponse(abortSignal: AbortSignal): Promise<string | null> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                resolve(null);
            }, 30000); // 30 secondes de timeout

            const onAbort = () => {
                clearTimeout(timeout);
                reject(new Error('Annulé par l\'utilisateur'));
            };

            abortSignal.addEventListener('abort', onAbort, { once: true });

            // Écouter la réponse
            const onResponse = (message: MessageData) => {
                if (message.chatId === 'tui-local' && message.sender !== 'tui-user') {
                    clearTimeout(timeout);
                    abortSignal.removeEventListener('abort', onAbort);
                    resolve(message.text);
                }
            };

            hiveTransport.onMessage(onResponse);
        });
    }

    /**
   * Gère les réponses du core
   */
    private handleCoreResponse(message: MessageData): void {
        if (message.chatId === 'tui-local' && message.sender !== 'tui-user') {
            // Émettre un événement de contenu
            this.emit('response', message.text);
        }
    }
}

// Export par défaut
export default HiveClient;
