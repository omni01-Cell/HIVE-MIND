import { WebSocketServer, WebSocket } from 'ws';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hiveTransport } from '../../tui/transport/HiveTransport.js';

export class TuiServerTransport {
    private wss: WebSocketServer | null = null;
    private port = 5001;
    private token = '';
    private configPath = join(process.cwd(), 'tui-connection.json');
    private authenticatedClients = new Set<WebSocket>();

    // Liens vers les listeners pour pouvoir les désabonner proprement au shutdown
    private onMessageListener = (message: any) => this.broadcast('message', message);
    private onPresenceListener = (presence: any) => this.broadcast('presence', presence);
    private onConfirmRequestListener = (request: any) => this.broadcast('confirmation_request', request);
    private onMediaListener = (media: any) => this.broadcast('media', media);
    private onVoiceListener = (voice: any) => this.broadcast('voice', voice);
    private onFileListener = (file: any) => this.broadcast('file', file);
    private onStickerListener = (sticker: any) => this.broadcast('sticker', sticker);
    private onVisualResponseListener = (visual: any) => this.broadcast('visual_response', visual);
    private onConnectionStatusListener = (status: any) => this.broadcast('connection_status', status);

    constructor() {
        this.token = randomUUID();
    }

    /**
     * Démarre le serveur WebSocket et écrit le fichier de configuration.
     */
    async start(): Promise<void> {
        try {
            // Écrire le fichier de configuration
            const configData = {
                host: 'localhost',
                port: this.port,
                token: this.token
            };
            writeFileSync(this.configPath, JSON.stringify(configData, null, 2), 'utf-8');
            console.log(`[TuiServerTransport] 📄 Configuration écrite dans ${this.configPath}`);

            // Initialiser le serveur WebSocket
            this.wss = new WebSocketServer({ port: this.port, host: '127.0.0.1' });

            this.wss.on('connection', (ws) => {
                let isAuthenticated = false;

                // Timeout pour s'authentifier
                const authTimeout = setTimeout(() => {
                    if (!isAuthenticated) {
                        console.warn('[TuiServerTransport] ⚠️ Déconnexion client : délai d\'authentification dépassé.');
                        ws.close(4401, 'Unauthorized timeout');
                    }
                }, 3000);

                ws.on('message', (data) => {
                    try {
                        const payload = JSON.parse(data.toString());

                        if (!isAuthenticated) {
                            if (payload.type === 'auth' && payload.token === this.token) {
                                isAuthenticated = true;
                                clearTimeout(authTimeout);
                                this.authenticatedClients.add(ws);
                                ws.send(JSON.stringify({ type: 'auth_success' }));
                                console.log('[TuiServerTransport] 🔑 Client TUI authentifié avec succès.');
                                // Envoyer l'état de connexion de hiveTransport
                                ws.send(JSON.stringify({
                                    type: 'connection_status',
                                    connected: hiveTransport.isConnected()
                                }));
                            } else {
                                console.warn('[TuiServerTransport] ❌ Tentative de connexion avec un token invalide.');
                                ws.close(4403, 'Invalid token');
                            }
                            return;
                        }

                        // Traitement des commandes une fois authentifié
                        if (payload.type === 'user_message') {
                            hiveTransport.submitUserMessage(payload.text, payload.options || {});
                        } else if (payload.type === 'confirmation_response') {
                            hiveTransport.submitConfirmationResponse(payload.id, payload.approved, payload.feedback);
                        }
                    } catch (err: any) {
                        console.error('[TuiServerTransport] Erreur traitement message client:', err.message);
                    }
                });

                ws.on('close', () => {
                    this.authenticatedClients.delete(ws);
                    console.log('[TuiServerTransport] 🔌 Client TUI déconnecté.');
                });

                ws.on('error', (err) => {
                    console.error('[TuiServerTransport] Erreur socket client:', err.message);
                });
            });

            // S'abonner aux événements de hiveTransport
            hiveTransport.on('message', this.onMessageListener);
            hiveTransport.on('presence', this.onPresenceListener);
            hiveTransport.on('confirmation_request', this.onConfirmRequestListener);
            hiveTransport.on('media', this.onMediaListener);
            hiveTransport.on('voice', this.onVoiceListener);
            hiveTransport.on('file', this.onFileListener);
            hiveTransport.on('sticker', this.onStickerListener);
            hiveTransport.on('visual_response', this.onVisualResponseListener);
            hiveTransport.on('connection_status', this.onConnectionStatusListener);

            console.log(`[TuiServerTransport] 🚀 Serveur WebSocket démarré sur ws://localhost:${this.port}`);
        } catch (error: any) {
            console.error('[TuiServerTransport] ❌ Impossible de démarrer le serveur WebSocket:', error.message);
        }
    }

    /**
     * Arrête le serveur et nettoie les fichiers temporaires.
     */
    async stop(): Promise<void> {
        // Désabonner les listeners
        hiveTransport.off('message', this.onMessageListener);
        hiveTransport.off('presence', this.onPresenceListener);
        hiveTransport.off('confirmation_request', this.onConfirmRequestListener);
        hiveTransport.off('media', this.onMediaListener);
        hiveTransport.off('voice', this.onVoiceListener);
        hiveTransport.off('file', this.onFileListener);
        hiveTransport.off('sticker', this.onStickerListener);
        hiveTransport.off('visual_response', this.onVisualResponseListener);
        hiveTransport.off('connection_status', this.onConnectionStatusListener);

        // Fermer tous les clients connectés
        for (const ws of this.authenticatedClients) {
            try { ws.close(1001, 'Server shutting down'); } catch { /* ignore */ }
        }
        this.authenticatedClients.clear();

        // Fermer le serveur
        if (this.wss) {
            await new Promise<void>((resolve) => {
                this.wss!.close(() => resolve());
            });
            this.wss = null;
        }

        // Supprimer le fichier de liaison
        try {
            unlinkSync(this.configPath);
            console.log('[TuiServerTransport] 🗑️ Fichier tui-connection.json supprimé.');
        } catch {
            // ignore si déjà supprimé
        }

        console.log('[TuiServerTransport] 🛑 Serveur WebSocket arrêté.');
    }

    /**
     * Diffuse un événement à tous les clients TUI authentifiés.
     */
    private broadcast(type: string, data: any): void {
        const payload = JSON.stringify({ type, data });
        for (const ws of this.authenticatedClients) {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(payload);
                } catch (err: any) {
                    console.error('[TuiServerTransport] Erreur envoi broadcast:', err.message);
                }
            }
        }
    }
}

export const tuiServerTransport = new TuiServerTransport();
export default tuiServerTransport;
