// @ts-nocheck
import { SubAgentEngine } from '../../../services/agentic/SubAgentEngine.js';

/**
 * ShoppingAgent (Swarm Sub-Agent)
 * Agent spécialisé pour le shopping comparatif, configuré via SubAgentEngine.
 */
export class ShoppingAgent {
    userId: any;
    chatId: any;
    engine: SubAgentEngine;

    constructor(userId, chatId) {
        this.userId = userId;
        this.chatId = chatId;
        
        // Initialiser le moteur de sous-agent
        this.engine = new SubAgentEngine({
            name: 'PersonalShopper',
            systemPrompt: `Tu es un Personal Shopper d'élite pour HIVE-MIND.
Ta mission est de trouver le MEILLEUR produit au MEILLEUR PRIX selon la demande de l'utilisateur.

RÈGLES DU SHOPPING:
1. Recherche des produits réels avec des prix actuels (utilise tes outils de recherche internet et de scraping).
2. Compare au moins 3 options différentes avant de choisir.
3. Rédige un rapport final formaté avec:
   - Le Top 1 recommandé (Nom, Prix approximatif, Lien ou site recommandé, Pourquoi c'est le meilleur).
   - Les alternatives (Option pas chère, Option premium).
4. Sois concis, factuel, et orienté "rapport qualité/prix".`,
            allowedTools: ['duckduck_search', 'firecrawl_scrape'], // Outils autorisés (lecture seule)
            maxIterations: 8,
            category: 'AGENTIC'
        });
    }

    /**
     * Lance une session de shopping
     * @param {string} query - La requête de shopping de l'utilisateur
     */
    async start(query: any) {
        const context = { chatId: this.chatId }; // Contexte minimum requis par les outils
        const result = await this.engine.run(`Trouve-moi le meilleur choix pour: "${query}"`, context);
        return result.message;
    }
}
