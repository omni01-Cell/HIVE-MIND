// services/sync/EmbeddingSyncService.js
// ============================================================================
// Service de synchronisation automatique des embeddings
// ============================================================================
// Détecte quand les définitions changent et met à jour les embeddings

import { supabase } from '../supabase.js';
import { container } from '../../core/ServiceContainer.js';

/**
 * Service de synchronisation des embeddings
 * S'assure que les embeddings sont toujours à jour avec les définitions
 */
export class EmbeddingSyncService {
    constructor() {
        this.syncInterval = 24 * 60 * 60 * 1000; // 24 heures
        this.enabled = true;
        this.batchSize = 10; // Traiter par lots pour éviter surcharge
    }

    /**
     * Initialise le service de synchronisation
     */
    async init() {
        console.log('[EmbeddingSync] 🔄 Initialisation du service de sync embeddings...');
        
        // Démarrer la synchronisation périodique
        this.startPeriodicSync();
        
        // Synchroniser au démarrage
        await this.performSync();
        
        console.log('[EmbeddingSync] ✅ Service initialisé');
    }

    /**
     * Démarre la synchronisation périodique
     * @private
     */
    startPeriodicSync() {
        setInterval(async () => {
            if (!this.enabled) return;
            
            try {
                console.log('[EmbeddingSync] ⏰ Synchronisation périodique...');
                await this.performSync();
            } catch (error) {
                console.error('[EmbeddingSync] Erreur sync périodique:', error.message);
            }
        }, this.syncInterval);
    }

    /**
     * Effectue la synchronisation complète
     */
    async performSync() {
        console.log('[EmbeddingSync] 🔄 Début synchronisation embeddings...');
        
        try {
            // 1. Identifier les outils avec des embeddings obsolètes
            const staleTools = await this.findStaleEmbeddings();
            
            if (staleTools.length === 0) {
                console.log('[EmbeddingSync] ✅ Aucun embedding obsolète détecté');
                return;
            }
            
            console.log(`[EmbeddingSync] 📊 ${staleTools.length} embeddings obsolètes trouvés`);
            
            // 2. Mettre à jour les embeddings par lots
            await this.updateEmbeddingsBatch(staleTools);
            
            // 3. Nettoyer les embeddings orphelins
            await this.cleanupOrphanEmbeddings();
            
            console.log('[EmbeddingSync] ✅ Synchronisation terminée');
            
        } catch (error) {
            console.error('[EmbeddingSync] ❌ Erreur synchronisation:', error.message);
        }
    }

    /**
     * Trouve les outils avec des embeddings obsolètes
     * @returns {Promise<Array>} - Liste des outils à mettre à jour
     */
    async findStaleEmbeddings() {
        try {
            // Obtenir tous les outils avec leurs définitions et embeddings
            const { data: tools, error } = await supabase
                .from('bot_tools')
                .select('name, definition, embedding, updated_at')
                .not('embedding', 'is', null);
            
            if (error) throw error;
            
            const staleTools = [];
            
            for (const tool of tools) {
                // Vérifier si la définition a changé depuis le dernier embedding
                const definitionHash = this.hashDefinition(tool.definition);
                const storedHash = await this.getStoredDefinitionHash(tool.name);
                
                if (definitionHash !== storedHash) {
                    staleTools.push({
                        name: tool.name,
                        definition: tool.definition,
                        oldHash: storedHash,
                        newHash: definitionHash
                    });
                }
            }
            
            return staleTools;
            
        } catch (error) {
            console.error('[EmbeddingSync] Erreur recherche embeddings obsolètes:', error.message);
            return [];
        }
    }

    /**
     * Met à jour les embeddings par lots
     * @param {Array} tools - Outils à mettre à jour
     */
    async updateEmbeddingsBatch(tools) {
        console.log(`[EmbeddingSync] 📝 Mise à jour de ${tools.length} embeddings...`);
        
        for (let i = 0; i < tools.length; i += this.batchSize) {
            const batch = tools.slice(i, i + this.batchSize);
            
            console.log(`[EmbeddingSync] Traitement lot ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(tools.length/this.batchSize)}`);
            
            await Promise.all(batch.map(async (tool) => {
                try {
                // Générer le nouvel embedding via container
                const embeddingsService = container.get('embeddings');
                const embedding = await embeddingsService.embed(JSON.stringify(tool.definition));
                    
                    // Mettre à jour dans la base de données
                    await this.updateToolEmbedding(tool.name, embedding.embedding);
                    
                    // Sauvegarder le hash de la définition
                    await this.saveDefinitionHash(tool.name, tool.newHash);
                    
                    console.log(`[EmbeddingSync] ✅ Embedding mis à jour: ${tool.name}`);
                    
                } catch (error) {
                    console.error(`[EmbeddingSync] ❌ Erreur mise à jour ${tool.name}:`, error.message);
                }
            }));
            
            // Petit délai entre les lots pour éviter la surcharge
            if (i + this.batchSize < tools.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * Met à jour l'embedding d'un outil
     * @param {string} toolName - Nom de l'outil
     * @param {Array} embedding - Nouvel embedding
     */
    async updateToolEmbedding(toolName, embedding) {
        const { error } = await supabase
            .from('bot_tools')
            .update({ 
                embedding: embedding,
                updated_at: new Date().toISOString()
            })
            .eq('name', toolName);
        
        if (error) {
            throw new Error(`Erreur mise à jour embedding ${toolName}: ${error.message}`);
        }
    }

    /**
     * Nettoie les embeddings orphelins (outils supprimés mais embeddings présents)
     */
    async cleanupOrphanEmbeddings() {
        console.log('[EmbeddingSync] 🧹 Nettoyage embeddings orphelins...');
        
        try {
            // Trouver les outils avec embeddings mais sans définition valide
            const { data: orphans, error } = await supabase
                .from('bot_tools')
                .select('name, definition, embedding')
                .not('embedding', 'is', null)
                .filter('definition', 'is', null)
                .or('definition->>name.is.null');
            
            if (error) throw error;
            
            if (orphans.length > 0) {
                console.log(`[EmbeddingSync] ${orphans.length} embeddings orphelins trouvés`);
                
                // Supprimer les embeddings orphelins
                for (const orphan of orphans) {
                    await this.removeToolEmbedding(orphan.name);
                }
            }
            
        } catch (error) {
            console.error('[EmbeddingSync] Erreur cleanup orphelins:', error.message);
        }
    }

    /**
     * Supprime l'embedding d'un outil
     * @param {string} toolName - Nom de l'outil
     */
    async removeToolEmbedding(toolName) {
        const { error } = await supabase
            .from('bot_tools')
            .update({ embedding: null })
            .eq('name', toolName);
        
        if (error) {
            console.error(`[EmbeddingSync] Erreur suppression embedding ${toolName}:`, error.message);
        } else {
            console.log(`[EmbeddingSync] 🗑️ Embedding orphelin supprimé: ${toolName}`);
        }
    }

    /**
     * Génère un hash de la définition pour détecter les changements
     * @param {Object} definition - Définition de l'outil
     * @returns {string} - Hash de la définition
     */
    hashDefinition(definition) {
        // Simple hash basé sur la string JSON (dans la vraie vie, utiliser crypto)
        const str = JSON.stringify(definition, Object.keys(definition).sort());
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convertir en 32-bit integer
        }
        return hash.toString(16); // Base 16
    }

    /**
     * Obtient le hash stocké d'une définition
     * @param {string} toolName - Nom de l'outil
     * @returns {Promise<string>} - Hash stocké
     */
    async getStoredDefinitionHash(toolName) {
        const { data, error } = await supabase
            .from('tool_metadata')
            .select('definition_hash')
            .eq('tool_name', toolName)
            .single();
        
        if (error || !data) {
            return null;
        }
        
        return data.definition_hash;
    }

    /**
     * Sauvegarde le hash d'une définition
     * @param {string} toolName - Nom de l'outil
     * @param {string} hash - Hash à sauvegarder
     */
    async saveDefinitionHash(toolName, hash) {
        const { error } = await supabase
            .from('tool_metadata')
            .upsert({
                tool_name: toolName,
                definition_hash: hash,
                last_sync: new Date().toISOString()
            })
            .eq('tool_name', toolName);
        
        if (error) {
            console.error(`[EmbeddingSync] Erreur sauvegarde hash ${toolName}:`, error.message);
        }
    }

    /**
     * Obtient le statut du service
     */
    getStatus() {
        return {
            enabled: this.enabled,
            lastSync: new Date().toISOString(),
            batchSize: this.batchSize,
            syncIntervalHours: this.syncInterval / (60 * 60 * 1000)
        };
    }

    /**
     * Force une synchronisation immédiate
     */
    async forceSync() {
        console.log('[EmbeddingSync] 🚀 Synchronisation forcée...');
        await this.performSync();
    }

    /**
     * Désactive temporairement le service
     */
    disable() {
        this.enabled = false;
        console.log('[EmbeddingSync] ⏸️ Service désactivé');
    }

    /**
     * Réactive le service
     */
    enable() {
        this.enabled = true;
        console.log('[EmbeddingSync] ▶️ Service réactivé');
    }
}

// Export singleton
export const embeddingSyncService = new EmbeddingSyncService();
export default embeddingSyncService;