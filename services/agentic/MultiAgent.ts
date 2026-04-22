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
    roles: any;
    criticalActions: any;

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
    needsCritique(toolCall: any, context: any) {
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
    async critique(toolCall: any, context: any) {
        console.log('[MultiAgent] 🕵️ Critique de l\'action...');

        const toolName = toolCall.function.name;
        const params = JSON.parse(toolCall.function.arguments || '{}');

        try {
            const criticPrompt = `<role>
You are the CRITIC agent in HIVE-MIND's safety system.
Your purpose: prevent destructive actions by identifying risks BEFORE execution.
</role>

<proposed_action>
Tool: ${toolName}
Parameters: ${JSON.stringify(params)}
</proposed_action>

<context>
User: ${context.senderName} (Authority: ${context.authorityLevel})
Chat Type: ${context.isGroup ? 'Group' : 'Private'}
Chat ID: ${context.chatId}
</context>

<evaluation_criteria>
Analyze these risk vectors:
1. Regression Risk: Could this target the wrong person/message?
2. Ethical Violation: Does this breach bot values or mission?
3. Authority Check: Does user have sufficient permissions?
4. Safer Alternative: Is there a less destructive approach?
</evaluation_criteria>

<output_format>
Respond in JSON only:
{
  "approved": true/false,
  "risk_level": "low|medium|high|critical",
  "concerns": ["concern1", "concern2"],
  "alternative": "suggestion if approved=false",
  "confidence": 0.0-1.0
}
</output_format>`;

            const response = await providerRouter.callServiceAgent('CRITIC', [
                { role: 'system', content: 'Tu es un agent critique et prudent. Ta priorité est la sécurité et l\'éthique.' },
                { role: 'user', content: criticPrompt }
            ]);

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

        } catch (error: any) {
            console.error('[MultiAgent] Erreur critique:', error.message);
            
            // ⚠️ SÉCURITÉ : Fail CLOSED pour actions critiques, Fail OPEN avec warning pour le reste
            const toolName = toolCall.function.name;
            const isCritical = this.criticalActions.includes(toolName);
            
            if (isCritical) {
                // Actions critiques : REFUSER par défaut si le critique est indisponible
                console.error(`[MultiAgent] 🚨 CRITIC FAILURE - Action critique "${toolName}" REJETÉE par sécurité`);
                return {
                    approved: false,
                    risk_level: 'critical',
                    concerns: [
                        'Critic service unavailable - cannot validate critical action',
                        'Action blocked by safety protocol',
                        `Error: ${error.message}`
                    ],
                    confidence: 0,
                    error: true
                };
            } else {
                // Actions non-critiques : Autoriser avec warning fort
                console.warn(`[MultiAgent] ⚠️ Critic failed for non-critical action "${toolName}" - proceeding with caution`);
                return {
                    approved: true,
                    risk_level: 'high', // Marquer comme haut risque même si approuvé
                    concerns: [
                        'Critic service failed - proceeding without validation',
                        'Manual review recommended',
                        `Error: ${error.message}`
                    ],
                    confidence: 0.2, // Très faible confiance
                    error: true
                };
            }
        }
    }

    /**
     * Observe la cohérence d'une action avec l'historique
     * @param {Object} execution - Action en cours
     * @param {Array} history - Historique récent des actions
     * @returns {Promise<Object>} {coherent, warning}
     */
    async observe(execution: any, history: any) {
        console.log('[MultiAgent] 👀 Observation de cohérence...');

        try {
            const observerPrompt = `<role>
You are the OBSERVER agent in HIVE-MIND's coherence system.
Your purpose: detect behavioral contradictions and prevent erratic actions.
</role>

<current_action>
Tool: ${execution.tool}
Parameters: ${JSON.stringify(execution.params).substring(0, 200)}
</current_action>

<recent_history>
Last 5 actions:
${history.slice(-5).map((h: any) => `- ${h.tool}: ${h.result_summary || 'N/A'} (${h.success ? 'success' : 'fail'})`).join('\\n')}
</recent_history>

<detection_criteria>
Flag incoherences:
- Contradictions: "I'll help you" followed by immediate ban
- Repetitions: Same search 3x in a row without reason
- Erratic shifts: Sudden direction changes without justification
</detection_criteria>

<output_format>
Respond in JSON only:
{
  "coherent": true/false,
  "warning": "description if incoherent",
  "severity": "low|medium|high"
}
</output_format>`;

            const response = await providerRouter.callServiceAgent('OBSERVER', [
                { role: 'system', content: 'Tu détectes les incohérences comportementales.' },
                { role: 'user', content: observerPrompt }
            ]);

            if (!response?.content) {
                throw new Error('Observer response is empty');
            }
            const resultText = response.content.replace(/```json|```/g, '').trim();
            const result = JSON.parse(resultText);

            if (!result.coherent) {
                console.warn(`[MultiAgent] ⚠️ Incohérence détectée: ${result.warning}`);
            }

            return result;

        } catch (error: any) {
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
    async deliberate(problem: any, context: any) {
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

        } catch (error: any) {
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
