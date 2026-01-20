// services/memory/MemoryDecay.js
// ============================================================================
// MEMORY DECAY SYSTEM - Gestion intelligente de l'oubli
// ============================================================================
// Implémente un système de vieillissement des souvenirs basé sur:
// - Recency: Les souvenirs récents sont plus importants
// - Frequency: Les souvenirs souvent rappelés restent actifs
// - Importance: Engagements, préférences, informations critiques

import { supabase } from '../supabase.js';
import { providerRouter } from '../../providers/index.js';

/**
 * Système de décroissance de la mémoire
 */
export class MemoryDecaySystem {
    constructor() {
        // Paramètres de décroissance
        this.tau = 24; // Constante de temps (heures) pour la décroissance exponentielle
        this.scoreThreshold = 0.3; // Seuil en dessous duquel on archive
        this.importanceKeywords = [
            'promis', 'engagement', 'rdv', 'rendez-vous', 'deadline',
            'important', 'critique', 'urgent', 'préfère', 'déteste',
            'aime', 'jamais', 'toujours', 'rappelle-moi', 'note'
        ];
    }

    /**
     * Calcule le score d'un souvenir
     * @param {Object} memory - {content, created_at, recall_count, metadata}
     * @returns {Object} {score, components, keep}
     */
    async scoreMemory(memory) {
        const now = Date.now();
        const createdAt = new Date(memory.created_at).getTime();
        const ageHours = (now - createdAt) / (1000 * 60 * 60);

        // 1. Recency: Décroissance exponentielle
        const recency = Math.exp(-ageHours / this.tau);

        // 2. Frequency: Nombre de fois rappelé
        const recallCount = memory.recall_count || 0;
        const frequency = Math.min(recallCount / 10, 1); // Normalize à [0,1]

        // 3. Importance: Détection de mots-clés critiques
        const importance = await this._detectImportance(memory.content);

        // 4. Score composite
        const score = (recency * 0.4) + (frequency * 0.3) + (importance * 0.3);

        return {
            score,
            components: { recency, frequency, importance },
            keep: score > this.scoreThreshold,
            ageHours: Math.round(ageHours)
        };
    }

    /**
     * Détecte l'importance sémantique d'un souvenir
     */
    async _detectImportance(content) {
        // Méthode rapide: mots-clés
        const lowerContent = content.toLowerCase();
        let keywordScore = 0;

        for (const keyword of this.importanceKeywords) {
            if (lowerContent.includes(keyword)) {
                keywordScore += 0.2;
            }
        }

        // Cap à 1.0
        return Math.min(keywordScore, 1.0);
    }

    /**
     * Effectue le cycle de décroissance pour un chat
     * @param {string} chatId
     */
    async decay(chatId) {
        console.log(`[MemoryDecay] 🧹 Début du cycle pour ${chatId}...`);

        try {
            // 1. Récupérer tous les souvenirs du chat
            const { data: memories, error } = await supabase
                .from('memories')
                .select('*')
                .eq('chat_id', chatId)
                .eq('role', 'assistant') // On ne decay que les réponses du bot
                .is('archived_at', null); // Pas déjà archivés

            if (error) throw error;
            if (!memories || memories.length === 0) {
                console.log(`[MemoryDecay] Aucun souvenir à traiter pour ${chatId}`);
                return { processed: 0, archived: 0, kept: 0 };
            }

            let archived = 0;
            let kept = 0;

            // 2. Scorer et archiver si nécessaire
            for (const memory of memories) {
                const { score, components, keep, ageHours } = await this.scoreMemory(memory);

                if (!keep) {
                    // Archiver (soft delete)
                    await supabase
                        .from('memories')
                        .update({
                            archived_at: new Date().toISOString(),
                            decay_score: score
                        })
                        .eq('id', memory.id);

                    archived++;
                    console.log(`[MemoryDecay] ⚰️ Archivé: ID ${memory.id} (age=${ageHours}h, score=${score.toFixed(2)})`);
                } else {
                    // Mettre à jour le score seulement
                    await supabase
                        .from('memories')
                        .update({ decay_score: score })
                        .eq('id', memory.id);

                    kept++;
                }
            }

            console.log(`[MemoryDecay] ✅ ${chatId}: ${archived} archivés, ${kept} conservés (${memories.length} total)`);

            return {
                processed: memories.length,
                archived,
                kept
            };

        } catch (error) {
            console.error('[MemoryDecay] Erreur:', error.message);
            return { processed: 0, archived: 0, kept: 0, error: error.message };
        }
    }

    /**
     * Effectue le cycle global (tous les chats actifs)
     */
    async decayAll() {
        console.log('[MemoryDecay] 🌍 Début du cycle global...');

        try {
            // Récupérer la liste des chats avec messages récents (< 7 jours)
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

            const { data: activeChats, error } = await supabase
                .from('memories')
                .select('chat_id')
                .gte('created_at', sevenDaysAgo)
                .is('archived_at', null);

            if (error) throw error;

            // Dédupliquer les chat IDs
            const uniqueChats = [...new Set(activeChats.map(m => m.chat_id))];

            console.log(`[MemoryDecay] ${uniqueChats.length} chats actifs détectés`);

            let totalArchived = 0;
            let totalKept = 0;

            // Traiter chaque chat
            for (const chatId of uniqueChats) {
                const result = await this.decay(chatId);
                totalArchived += result.archived;
                totalKept += result.kept;
            }

            console.log(`[MemoryDecay] ✅ Cycle global terminé: ${totalArchived} archivés, ${totalKept} conservés`);

            return {
                chats: uniqueChats.length,
                archived: totalArchived,
                kept: totalKept
            };

        } catch (error) {
            console.error('[MemoryDecay] Erreur cycle global:', error.message);
            return { chats: 0, archived: 0, kept: 0, error: error.message };
        }
    }

    /**
     * Récupère les statistiques de décroissance
     */
    async getStats(chatId = null) {
        try {
            let query = supabase
                .from('memories')
                .select('decay_score, archived_at, created_at');

            if (chatId) {
                query = query.eq('chat_id', chatId);
            }

            const { data: memories } = await query;

            if (!memories) return null;

            const active = memories.filter(m => !m.archived_at);
            const archived = memories.filter(m => m.archived_at);

            const avgScoreActive = active.length > 0
                ? active.reduce((sum, m) => sum + (m.decay_score || 0), 0) / active.length
                : 0;

            return {
                total: memories.length,
                active: active.length,
                archived: archived.length,
                avgScore: avgScoreActive.toFixed(3),
                retention: (active.length / memories.length * 100).toFixed(1) + '%'
            };

        } catch (error) {
            console.error('[MemoryDecay] Erreur stats:', error.message);
            return null;
        }
    }
}

// Export singleton
export const memoryDecay = new MemoryDecaySystem();
export default memoryDecay;
