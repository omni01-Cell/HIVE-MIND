/**
 * HiveHitlBridge — Pont entre le système HITL du TUI et le core HIVE-MIND
 *
 * Ce pont connecte :
 * - Le ToolConfirmationQueue du TUI (Gemini CLI)
 * - Le PermissionManager du core HIVE-MIND
 *
 * Flux :
 *   1. Le core détecte une action sensible
 *   2. Le core demande permission via PermissionManager.askPermission()
 *   3. Le TUI affiche la demande via ToolActionsContext
 *   4. L'utilisateur approuve/refuse via le TUI
 *   5. Le TUI envoie la réponse via MessageBus
 *   6. Le bridge intercepte la réponse et la retourne au core
 */

import { EventEmitter } from 'node:events';
import type { MessageData } from '../../core/types/BotTypes.js';
import { hiveTransport } from './HiveTransport.js';

// Types pour les confirmations d'outils
export interface ToolConfirmationRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  requiresApproval: boolean;
}

export interface ToolConfirmationResponse {
  id: string;
  approved: boolean;
  feedback?: string;
}

// Enum pour les résultats de confirmation
export enum ToolConfirmationOutcome {
  Approve = 'approve',
  ApproveAlways = 'approve_always',
  Cancel = 'cancel',
  Reject = 'reject',
}

/**
 * HiveHitlBridge gère la communication entre le TUI et le core HITL
 */
export class HiveHitlBridge extends EventEmitter {
    private pendingConfirmations: Map<string, {
    resolve: (response: ToolConfirmationResponse) => void;
    reject: (error: Error) => void;
    request: ToolConfirmationRequest;
  }> = new Map();

    private confirmationCounter = 0;

    constructor() {
        super();

        // Écouter les messages du core pour les confirmations
        hiveTransport.onMessage((message: MessageData) => {
            this.handleCoreMessage(message);
        });
    }

    /**
   * Demande une confirmation pour un outil
   * Cette méthode est appelée par le core quand un outil nécessite une approbation
   */
    async requestConfirmation(
        toolName: string,
        args: Record<string, unknown>,
        description: string
    ): Promise<ToolConfirmationResponse> {
        this.confirmationCounter++;
        const id = `confirm_${Date.now()}_${this.confirmationCounter}`;

        const request: ToolConfirmationRequest = {
            id,
            toolName,
            args,
            description,
            requiresApproval: true
        };

        return new Promise((resolve, reject) => {
            this.pendingConfirmations.set(id, {
                resolve,
                reject,
                request
            });

            // Émettre l'événement pour que le TUI affiche la demande
            this.emit('confirmationRequest', request);

            // Envoyer la demande au core via le transport
            hiveTransport.sendText('tui-local', `[HITL] Demande de confirmation pour l'outil "${toolName}": ${description}`, {
                confirmationId: id,
                type: 'confirmation_request'
            });

            // Timeout après 5 minutes
            setTimeout(() => {
                if (this.pendingConfirmations.has(id)) {
                    this.pendingConfirmations.delete(id);
                    resolve({
                        id,
                        approved: false,
                        feedback: 'Timeout: aucune réponse en 5 minutes'
                    });
                }
            }, 5 * 60 * 1000);
        });
    }

    /**
   * Traite la réponse d'un utilisateur à une demande de confirmation
   * Cette méthode est appelée quand l'utilisateur clique sur Approuver/Refuser dans le TUI
   */
    handleConfirmationResponse(response: ToolConfirmationResponse): void {
        const pending = this.pendingConfirmations.get(response.id);
        if (pending) {
            this.pendingConfirmations.delete(response.id);
            pending.resolve(response);

            // Émettre un événement pour le TUI
            this.emit('confirmationResolved', response);
        }
    }

    /**
   * Gère les messages du core (pour les confirmations)
   */
    private handleCoreMessage(message: MessageData): void {
    // Vérifier si c'est un message de confirmation
        if (message.text?.startsWith('[HITL]')) {
            // Extraire l'ID de confirmation du message
            const match = message.text.match(/\[CONFIRM:(\w+)\]/);
            if (match) {
                const confirmationId = match[1];

                // Vérifier si nous avons une confirmation en attente
                if (this.pendingConfirmations.has(confirmationId)) {
                    // Le core a déjà traité la demande
                    // Nous n'avons rien à faire ici car la réponse est gérée par handleConfirmationResponse
                }
            }
        }
    }

    /**
   * Vérifie si une confirmation est en attente
   */
    hasPendingConfirmation(id: string): boolean {
        return this.pendingConfirmations.has(id);
    }

    /**
   * Retourne toutes les confirmations en attente
   */
    getPendingConfirmations(): ToolConfirmationRequest[] {
        return Array.from(this.pendingConfirmations.values()).map(p => p.request);
    }

    /**
   * Annule toutes les confirmations en attente
   */
    cancelAll(): void {
        for (const [id, pending] of this.pendingConfirmations) {
            pending.resolve({
                id,
                approved: false,
                feedback: 'Annulé par l\'utilisateur'
            });
        }
        this.pendingConfirmations.clear();
    }
}

// Instance singleton
export const hiveHitlBridge = new HiveHitlBridge();

// Export par défaut
export default hiveHitlBridge;
