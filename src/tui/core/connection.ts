/**
 * HiveCoreConnection — Pont client WebSocket léger entre la TUI et le Core HIVE-MIND.
 *
 * Se connecte au serveur WebSocket hébergé par le Core en tâche de fond,
 * s'authentifie par token dynamique et relaie les événements.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { hiveConfig } from '../config/hiveConfig.js';
import { ToolConfirmationOutcome } from '../ui/contexts/UIStateContext.js';
import type {
    AgentProtocol,
    AgentEvent,
    AgentContentPart,
    ToolConfirmationPayload,
    ToolCallConfirmationDetails
} from '../ui/contexts/UIStateContext.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export class HiveCoreConnection implements AgentProtocol {
    private listeners = new Set<(event: AgentEvent) => void>();
    private statusListeners = new Set<(status: ConnectionStatus) => void>();
    
    private ws: WebSocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private reconnectTimer: NodeJS.Timeout | null = null;
    private initialized = false;
    private token = '';
    private port = 5001;
    private host = 'localhost';
    private configPath = join(process.cwd(), 'tui-connection.json');
    private activeServices: Array<{ service: string; action: string; timestamp: number }> = [];

    public getActiveServices(): Array<{ service: string; action: string; timestamp: number }> {
        return this.activeServices;
    }

    public getConnectionStatus(): ConnectionStatus {
        return this.status;
    }

    public onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
        this.statusListeners.add(listener);
        listener(this.status);
        return () => {
            this.statusListeners.delete(listener);
        };
    }

    private setStatus(newStatus: ConnectionStatus): void {
        if (this.status !== newStatus) {
            this.status = newStatus;
            for (const listener of this.statusListeners) {
                try { listener(newStatus); } catch { /* ignore */ }
            }
            // Diffuser aussi un événement générique
            this.emit({
                type: 'custom',
                name: 'connection_status_change',
                message: newStatus
            });
        }
    }

    /**
     * Tente de lire le fichier tui-connection.json et d'extraire les paramètres de connexion.
     */
    private loadConnectionConfig(): boolean {
        try {
            const raw = readFileSync(this.configPath, 'utf-8');
            const data = JSON.parse(raw);
            this.host = data.host || 'localhost';
            this.port = data.port || 5001;
            this.token = data.token || '';
            return !!this.token;
        } catch {
            return false;
        }
    }

    /**
     * Démarre la boucle de connexion résiliente.
     */
    async connect(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        this.setStatus('connecting');
        this.reconnectLoop();
    }

    /**
     * Tente une connexion immédiate et replanifie en cas d'échec.
     */
    private reconnectLoop(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Si la config n'est pas lisible (Core non démarré), on attend et on réessaye
        if (!this.loadConnectionConfig()) {
            this.setStatus('connecting');
            this.reconnectTimer = setTimeout(() => this.reconnectLoop(), 2000);
            return;
        }

        console.log(`[HiveCoreConnection] Connexion à ws://${this.host}:${this.port}...`);
        
        try {
            this.ws = new WebSocket(`ws://${this.host}:${this.port}`);

            this.ws.on('open', () => {
                // Envoyer le token d'authentification en premier message
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'auth',
                        token: this.token
                    }));
                }
            });

            this.ws.on('message', (data) => {
                try {
                    const payload = JSON.parse(data.toString());

                    if (payload.type === 'auth_success') {
                        this.setStatus('connected');
                        console.log('[HiveCoreConnection] ✅ Connecté et authentifié auprès du Core.');
                        return;
                    }

                    // Une fois connecté, dispatcher les autres messages
                    if (this.status === 'connected') {
                        this.handleServerEvent(payload);
                    }
                } catch (err: any) {
                    console.error('[HiveCoreConnection] Erreur parsing message serveur:', err.message);
                }
            });

            this.ws.on('close', () => {
                this.handleDisconnect();
            });

            this.ws.on('error', () => {
                this.handleDisconnect();
            });

        } catch {
            this.handleDisconnect();
        }
    }

    private handleDisconnect(): void {
        if (this.ws) {
            try { this.ws.terminate(); } catch { /* ignore */ }
            this.ws = null;
        }
        this.activeServices = [];
        this.setStatus('connecting');
        
        if (this.reconnectTimer === null) {
            this.reconnectTimer = setTimeout(() => this.reconnectLoop(), 2000);
        }
    }

    /**
     * Traite un événement envoyé par le serveur WebSocket.
     */
    private handleServerEvent(payload: { type: string; data: any }): void {
        const { type, data } = payload;

        // Suivi local des services actifs
        if (type === 'custom') {
            if (payload.data?.name === 'service_start') {
                const sName = payload.data.message;
                // éviter les doublons
                if (!this.activeServices.some(s => s.service === sName)) {
                    this.activeServices.push({ service: sName, action: 'thinking', timestamp: Date.now() });
                }
            } else if (payload.data?.name === 'service_end') {
                const sName = payload.data.message;
                this.activeServices = this.activeServices.filter(s => s.service !== sName);
            }
        }

        // Intercepter et enrichir les requêtes de confirmation HITL avec les handlers locaux
        if (type === 'confirmation_request') {
            const event = data;
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
                onConfirm: async (outcome: ToolConfirmationOutcome, confirmPayload?: ToolConfirmationPayload) => {
                    const approved = outcome !== ToolConfirmationOutcome.Cancel;
                    const feedback = confirmPayload?.feedback || ((confirmPayload as any)?.answers ? JSON.stringify((confirmPayload as any).answers) : undefined);
                    
                    // Renvoyer la réponse de confirmation via WebSocket
                    this.sendPayload({
                        type: 'confirmation_response',
                        id: event.id,
                        approved,
                        feedback
                    });

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
            return;
        }

        // Pour tous les autres événements (messages, présences, etc.), émettre directement
        this.emit(data);
    }

    /**
     * Ferme la connexion proprement.
     */
    async disconnect(): Promise<void> {
        this.initialized = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try { this.ws.close(1000, 'TUI exiting'); } catch { /* ignore */ }
            this.ws = null;
        }
        this.activeServices = [];
        this.setStatus('disconnected');
    }

    /**
     * Envoie un message utilisateur au Core via le WebSocket.
     */
    async send(request: { message: { content: AgentContentPart[] } }): Promise<{ streamId: string }> {
        const text = request.message.content.map((part) => part.text).join('');
        if (!text.trim()) {
            throw new Error('Cannot send an empty message to the core.');
        }

        if (this.status !== 'connected') {
            throw new Error('Cannot send message: not connected to the HIVE-MIND Core.');
        }

        this.sendPayload({
            type: 'user_message',
            text,
            options: {
                systemContext: hiveConfig.getHiveMdContext()
            }
        });

        // Simuler un début de traitement immédiat
        this.emit({ type: 'agent_start' });

        return { streamId: `tui-${Date.now()}` };
    }

    /**
     * Abonne un listener aux événements agent.
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
        this.emit({ type: 'agent_end' });
        return Promise.resolve();
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

    private sendPayload(payload: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(payload));
            } catch (err: any) {
                console.error('[HiveCoreConnection] Erreur envoi payload WebSocket:', err.message);
            }
        }
    }
}

export const hiveCoreConnection = new HiveCoreConnection();
export default hiveCoreConnection;
