// services/agentic/MultiAgent.js
// ============================================================================
// LIGHTWEIGHT MULTI-AGENT SYSTÈME - Critic + Observer
// ============================================================================
// Fournit des perspectives complémentaires ponctuelles pour les actions
// critiques sans la complexité d'un swarm complet

import { providerRouter } from '../../providers/index.js';

/**
 * Système multi-agent léger pour critique et observation
 */
export class LightweightMultiAgent {
    constructor() {
        this.roles = {
            executor: "L'agent principal qui exécute les tâches",
            critic: "Analyse les risques, failles et conséquences négatives potentielles",
            observer: "Vérifie la cohérence avec l'historique et les valeurs du système"
        };

        // Actions qui nécessitent une critique obligatoire
        this.criticalActions = [
            'gm_ban_user',
            'gm_remove_user',
            'gm_delete_message',
            'gm_demote_admin',
            'delete_group_data'
        ];
    }

    /**
     * Détermine si une action nécessite une critique
     * @param {Object} toolCall
     * @param {Object} context
     * @returns {boolean}
     */
    needsCritique(toolCall, context) {
        const toolName = toolCall.function.name;

        // Actions critiques
        if (this.criticalActions.includes(toolName)) {
            return true;
        }

        // Actions coûteuses (estimation basique)
        if (toolName.includes('search') && context.estimatedCost > 50) {
            return true;
        }

        return false;
    }

    /**
     * Critique une action proposée
     * @param {Object} toolCall - Action proposée
     * @param {Object} context - Contexte complet
     * @returns {Promise<Object>} {approved, concerns, alternative, risk_level}
     */
    async critique(toolCall, context) {
        console.log('[MultiAgent] 🕵️ Critique de l\'action...');

        const toolName = toolCall.function.name;
        const params = JSON.parse(toolCall.function.arguments || '{}');

        try {
            const criticPrompt = `Tu es le CRITIQUE du système HIVE-MIND.
Mission: Analyser ce plan d'action et identifier les RISQUES.

Action proposée:
- Outil: ${toolName}
- Paramètres: ${JSON.stringify(params)}

Contexte:
- Expéditeur: ${context.senderName}
- Autorité: ${context.authorityLevel}
- Groupe: ${context.isGroup ? 'Oui' : 'Non'}
- Chat ID: ${context.chatId}

Questions critiques:
1. Y a-t-il un risque de régression? (bannir la mauvaise personne, supprimer le mauvais message, etc.)
2. Cette action viole-t-elle les valeurs du bot ou pourrait-elle nuire à la mission?
3. L'utilisateur a-t-il l'autorité suffisante pour cette action?
4. Y a-t-il une alternative plus sûre ou moins destructive?

Réponds en JSON:
{
  "approved": true/false,
  "risk_level": "low|medium|high|critical",
  "concerns": ["concern1", "concern2"],
  "alternative": "suggestion alternative si approved=false",
  "confidence": 0.0-1.0
}`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu es un agent critique et prudent. Ta priorité est la sécurité et l\'éthique.' },
                { role: 'user', content: criticPrompt }
            ], {
                temperature: 0.2 // Très déterministe
            });

            if (!response?.content) {
                throw new Error('Critic response is empty');
            }
            const resultText = response.content.replace(/```json|```/g, '').trim();
            const result = JSON.parse(resultText);

            if (!result.approved) {
                console.warn(`[MultiAgent] 🛑 Action refusée par Critic: ${result.concerns.join(', ')}`);
            } else if (result.risk_level === 'high' || result.risk_level === 'critical') {
                console.warn(`[MultiAgent] ⚠️ Risque ${result.risk_level} détecté mais approuvé`);
            } else {
                console.log(`[MultiAgent] ✅ Action approuvée (risque: ${result.risk_level})`);
            }

            return result;

        } catch (error) {
            console.error('[MultiAgent] Erreur critique:', error.message);
            // Fallback permissif en cas d'erreur du critique
            return {
                approved: true,
                risk_level: 'unknown',
                concerns: [],
                confidence: 0
            };
        }
    }

    /**
     * Observe la cohérence d'une action avec l'historique
     * @param {Object} execution - Action en cours
     * @param {Array} history - Historique récent des actions
     * @returns {Promise<Object>} {coherent, warning}
     */
    async observe(execution, history) {
        console.log('[MultiAgent] 👀 Observation de cohérence...');

        try {
            const observerPrompt = `Tu es l'OBSERVATEUR du système HIVE-MIND.
Mission: Vérifier si cette action est COHÉRENTE avec l'historique récent.

Action actuelle:
- Outil: ${execution.tool}
- Paramètres: ${JSON.stringify(execution.params).substring(0, 200)}

Historique récent (5 dernières actions):
${history.slice(-5).map(h => `- ${h.tool}: ${h.result_summary || 'N/A'} (${h.success ? 'succès' : 'échec'})`).join('\n')}

Détecte les incohérences:
- Contradictions (ex: "Je vais t'aider" puis ban immédiat)
- Actions répétitives inutiles (même recherche 3x de suite)
- Changements de cap brutaux sans raison

Réponds en JSON:
{
  "coherent": true/false,
  "warning": "description du problème si incohérent",
  "severity": "low|medium|high"
}`;

            const response = await providerRouter.chat([
                { role: 'system', content: 'Tu détectes les incohérences comportementales.' },
                { role: 'user', content: observerPrompt }
            ], {
                temperature: 0.1
            });

            if (!response?.content) {
                throw new Error('Observer response is empty');
            }
            const resultText = response.content.replace(/```json|```/g, '').trim();
            const result = JSON.parse(resultText);

            if (!result.coherent) {
                console.warn(`[MultiAgent] ⚠️ Incohérence détectée: ${result.warning}`);
            }

            return result;

        } catch (error) {
            console.error('[MultiAgent] Erreur observer:', error.message);
            return {
                coherent: true,
                warning: null,
                severity: 'low'
            };
        }
    }

    /**
     * Mini-délibération pour décisions complexes
     * @param {Object} problem - Problème à résoudre
     * @param {Object} context
     * @returns {Promise<Object>} Consensus
     */
    async deliberate(problem, context) {
        console.log('[MultiAgent] 🗳️ Délibération multi-perspectives...');

        // 1. Perspective Executor (optimiste, orienté action)
        const executorPrompt = `Tu es l'EXECUTEUR. Propose la solution la plus efficace et directe.
Problème: ${problem.description}
Contraintes: ${JSON.stringify(problem.constraints)}

Propose une solution en JSON: { "solution": "...", "confidence": 0.0-1.0 }`;

        // 2. Perspective Critic (pessimiste, orienté risques)
        const criticPrompt = `Tu es le CRITIQUE. Identifie tous les risques et propose la solution la plus sûre.
Problème: ${problem.description}
Contraintes: ${JSON.stringify(problem.constraints)}

Propose une solution en JSON: { "solution": "...", "risks": ["..."], "confidence": 0.0-1.0 }`;

        try {
            const [executorResponse, criticResponse] = await Promise.all([
                providerRouter.chat([
                    { role: 'system', content: 'Tu es orienté action et efficacité.' },
                    { role: 'user', content: executorPrompt }
                ], { temperature: 0.7 }),

                providerRouter.chat([
                    { role: 'system', content: 'Tu es orienté sécurité et prudence.' },
                    { role: 'user', content: criticPrompt }
                ], { temperature: 0.3 })
            ]);

            const executorSolution = executorResponse?.content
                ? JSON.parse(executorResponse.content.replace(/```json|```/g, '').trim())
                : { solution: "N/A", confidence: 0 };

            const criticSolution = criticResponse?.content
                ? JSON.parse(criticResponse.content.replace(/```json|```/g, '').trim())
                : { solution: "N/A", risks: [], confidence: 0 };

            // Synthèse (simple: choisir selon confiance)
            const consensus = executorSolution.confidence > criticSolution.confidence
                ? executorSolution
                : criticSolution;

            console.log(`[MultiAgent] Consensus trouvé: ${consensus.solution.substring(0, 100)}...`);

            return {
                consensus: consensus.solution,
                executorView: executorSolution,
                criticView: criticSolution
            };

        } catch (error) {
            console.error('[MultiAgent] Erreur delibération:', error.message);
            return {
                consensus: "Erreur de délibération, décision manuelle requise",
                error: error.message
            };
        }
    }
}

// Export singleton
export const multiAgent = new LightweightMultiAgent();
export default multiAgent;
