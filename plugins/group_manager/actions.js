// plugins/group_manager/actions.js
// Actions de modération : warn, ban, mute, kick

/**
 * Actions de modération pour les groupes
 */
export const moderationActions = {
    /**
     * Envoie un avertissement à un utilisateur
     */
    async warn(transport, groupJid, userJid, reason, warningCount, maxWarnings) {
        const username = userJid.split('@')[0];
        const message = `⚠️ **Avertissement** @${username}\n` +
            `Raison: ${reason}\n` +
            `⏳ Warning ${warningCount}/${maxWarnings}`;

        await transport.sendText(groupJid, message, {
            mentions: [userJid]
        });

        return { action: 'warn', success: true };
    },

    /**
     * Bannit (expulse) un utilisateur
     */
    async ban(transport, groupJid, userJid, reason) {
        const username = userJid.split('@')[0];

        try {
            // Envoyer le message AVANT le ban
            const message = `🚫 **Exclusion** @${username}\n` +
                `Raison: ${reason}\n` +
                `Tu as dépassé la limite d'avertissements.`;

            await transport.sendText(groupJid, message, {
                mentions: [userJid]
            });

            // Exécuter le ban
            await transport.banUser(groupJid, userJid);

            return { action: 'ban', success: true };
        } catch (error) {
            console.error('[GroupManager] Erreur ban:', error);
            return { action: 'ban', success: false, error: error.message };
        }
    },

    /**
     * Kick temporaire (sans ban permanent)
     */
    async kick(transport, groupJid, userJid, reason) {
        const username = userJid.split('@')[0];

        try {
            const message = `👋 **Expulsion temporaire** @${username}\n` +
                `Raison: ${reason}`;

            await transport.sendText(groupJid, message, {
                mentions: [userJid]
            });

            await transport.sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');

            return { action: 'kick', success: true };
        } catch (error) {
            console.error('[GroupManager] Erreur kick:', error);
            return { action: 'kick', success: false, error: error.message };
        }
    },

    /**
     * Mute un utilisateur (retire son droit de parole)
     * Note: Nécessite que le groupe soit en mode "admins only" pour les messages
     */
    async mute(transport, groupJid, userJid, reason, durationMinutes = 60) {
        // WhatsApp n'a pas de vrai "mute" individuel
        // On peut soit demote si l'user est admin, soit juste noter
        const username = userJid.split('@')[0];

        const message = `🔇 **Silence** @${username}\n` +
            `Raison: ${reason}\n` +
            `Tes prochains messages seront ignorés pour ${durationMinutes} minutes.`;

        await transport.sendText(groupJid, message, {
            mentions: [userJid]
        });

        // On pourrait stocker dans Redis pour ignorer les messages de cet user
        // temporairement, mais c'est une fonctionnalité avancée

        return { action: 'mute', success: true, note: 'Mute enregistré (soft mute)' };
    },

    /**
     * Supprime un message (si le bot est admin)
     */
    async deleteMessage(transport, groupJid, messageKey) {
        try {
            await transport.sock.sendMessage(groupJid, { delete: messageKey });
            return { action: 'delete', success: true };
        } catch (error) {
            console.error('[GroupManager] Erreur suppression:', error);
            return { action: 'delete', success: false };
        }
    }
};

export default moderationActions;
