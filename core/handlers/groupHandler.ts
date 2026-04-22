// @ts-nocheck
// core/handlers/groupHandler.js
// Gère les événements de groupe (join, leave, promote, demote)
// Extrait de core/index.js pour modularité

import { container } from '../ServiceContainer.js';
import { groupService } from '../../services/groupService.js';
import { db } from '../../services/supabase.js';

/**
 * Gestionnaire des événements de groupe
 */
export class GroupHandler {
    transport: any;
    welcomeHandler: any;

    constructor(transport, welcomeHandler = null) {
        this.transport = transport;
        this.welcomeHandler = welcomeHandler;
    }

    /**
     * Définit le handler de bienvenue
     */
    setWelcomeHandler(handler: any) {
        this.welcomeHandler = handler;
    }

    /**
     * Gère un événement de groupe
     * @param {Object} event - Événement de groupe
     */
    async handleEvent(event: any) {
        const { groupId, participants, action } = event.data;

        // Invalider le cache Redis sur les événements critiques
        if (['promote', 'demote', 'remove'].includes(action)) {
            await groupService.invalidateCache(groupId);
        }

        // Tracking des événements membres dans la base
        for (const participant of participants) {
            await this._trackMemberEvent(groupId, participant, action);
        }

        // Gestionnaire spécifique pour les arrivées (Welcome)
        if (action === 'add') {
            if (this.welcomeHandler) {
                await this.welcomeHandler(event);
            }
            await this._checkFounder(groupId);
        }

        // Messages de notification
        await this._sendNotification(groupId, participants, action);
    }

    /**
     * Track un événement membre dans la base de données
     */
    async _trackMemberEvent(groupId: any, participant: any, action: any) {
        try {
            await db.recordMemberEvent(groupId, participant, action);

            if (action === 'add') {
                const hasLeftBefore = await db.hasLeftBefore(groupId, participant);
                if (hasLeftBefore) {
                    const username = participant.split('@')[0];
                    console.log(`[GroupEvent] 🔄 Utilisateur ${username} a rejoint à nouveau`);

                    await this.transport.sendText(
                        groupId,
                        `👀 @${username} est de retour dans le groupe!`,
                        { mentions: [participant] }
                    );
                }
            }
        } catch (error: any) {
            // Récupération si le groupe n'existe pas en DB
            if (error?.code === '23503' || error?.message?.includes('foreign key constraint')) {
                console.log('[GroupEvent] 🔄 Groupe inconnu en DB, synchronisation d\'urgence...');
                try {
                    const metadata = await this.transport.sock.groupMetadata(groupId);
                    await groupService.updateGroup(groupId, metadata);
                    await db.recordMemberEvent(groupId, participant, action);
                    console.log('[GroupEvent] ✓ Synchronisation et tracking réussis');
                } catch (syncError: any) {
                    console.error('[GroupEvent] Échec récupération sync:', syncError);
                }
            } else {
                console.error('[GroupEvent] Erreur tracking:', error);
            }
        }
    }

    /**
     * Vérifie et définit le fondateur du groupe si nécessaire
     */
    async _checkFounder(groupId: any) {
        try {
            const founder = await db.getGroupFounder(groupId);
            if (!founder) {
                const metadata = await this.transport.sock.groupMetadata(groupId);
                const creatorJid = metadata.owner || metadata.subjectOwner;

                if (creatorJid) {
                    await db.setGroupFounder(groupId, creatorJid);
                    console.log(`[GroupEvent] ✓ Fondateur défini: ${creatorJid}`);
                }
            }
        } catch (error: any) {
            console.error('[GroupEvent] Erreur définition fondateur:', error);
        }
    }

    /**
     * Envoie les notifications de groupe
     */
    async _sendNotification(groupId: any, participants: any, action: any) {
        const messages = {
            remove: `👋 Au revoir @${participants[0].split('@')[0]}...`,
            promote: `🎉 Félicitations @${participants[0].split('@')[0]} est maintenant admin !`,
            demote: `📉 @${participants[0].split('@')[0]} n'est plus admin.`
        };

        if (messages[action]) {
            await this.transport.sendText(groupId, messages[action], {
                mentions: participants
            });
        }
    }
}

export default GroupHandler;
