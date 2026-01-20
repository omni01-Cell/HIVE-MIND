// services/knowledgeWeaver.js
// Service d'extraction d'entités et de relations (Knowledge Graph)

import { providerRouter } from '../providers/index.js';
import { graphMemory } from './graphMemory.js';

export const knowledgeWeaver = {
    /**
     * Analyse un message ou une conversation pour extraire du savoir structuré
     * @param {string} chatId 
     * @param {string} text 
     */
    async weave(chatId, text) {
        if (!text || text.length < 10) return;

        try {
            console.log(`[KnowledgeWeaver] 🧶 Tissage en cours pour ${chatId}...`);

            const systemPrompt = `Tu es le "Knowledge Weaver" (Tisseur de Savoir) du bot HIVE-MIND.
Ta mission est d'extraire des entités et leurs relations depuis le texte fourni pour construire un Knowledge Graph.

TYPES D'ENTITÉS : Personne, Lieu, Organisation, Projet, Concept, Événement, Skill.
TYPES DE RELATIONS : connait, travaille_sur, habite_a, est_lie_a, participe_a, utilise, expert_en.

RÈGLES :
1. N'extrais que des informations FACTUELLES et explicites.
2. Si une entité existe déjà (ex: mentionnée avant), réutilise son nom exact.
3. Sois concis dans les descriptions.

RÉPONDS UNIQUEMENT EN JSON :
{
  "entities": [
    { "name": "Nom", "type": "Type", "description": "Brève description" }
  ],
  "relationships": [
    { "source": "NomSource", "target": "NomCible", "type": "TypeRelation" }
  ]
}`;

            const response = await providerRouter.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Texte à analyser :\n"${text}"` }
            ], {
                family: 'gemini',
                model: 'gemini-2.0-flash', // Utilisation d'un modèle ultra-rapide
                temperature: 0.1
            });

            if (!response?.content) return;

            // Nettoyage et parse JSON
            const jsonText = response.content.replace(/```json|```/g, '').trim();
            const data = JSON.parse(jsonText);

            // 1. Enregistrer les entités
            const entityMap = new Map();
            for (const ent of data.entities || []) {
                const stored = await graphMemory.upsertEntity(chatId, ent);
                if (stored) entityMap.set(ent.name, stored.id);
            }

            // 2. Enregistrer les relations
            for (const rel of data.relationships || []) {
                await graphMemory.addRelationship(chatId, rel.source, rel.target, rel.type);
            }

            console.log(`[KnowledgeWeaver] ✅ Tissage terminé : ${data.entities?.length || 0} entités, ${data.relationships?.length || 0} relations.`);

        } catch (error) {
            console.error('[KnowledgeWeaver] Erreur lors du tissage:', error.message);
        }
    }
};

export default knowledgeWeaver;
