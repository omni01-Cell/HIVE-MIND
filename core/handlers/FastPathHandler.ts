// core/handlers/FastPathHandler.js
// ============================================================================
// FAST PATH HANDLER - Réponse directe ultra-rapide (sans boucle ReAct)
// Objectif: Latence < 1s pour 95% des messages (conversations simples)
// ============================================================================

import { providerRouter } from '../../providers/index.js';
import { pluginLoader } from '../../plugins/loader.js';
import { extractToolCallsFromText, parseToolArguments } from '../../utils/toolCallExtractor.js';

/**
 * Handler pour le mode FastPath
 * Traite les messages simples avec un seul appel LLM
 */
export class FastPathHandler {
    transport: any;
    MAX_TOKENS: any;
    FAST_FAMILY: any;
    FAST_MODEL: any;

    constructor(transport: any) {
        this.transport = transport;
        this.MAX_TOKENS = 500; // Réponses concises
        this.FAST_FAMILY = 'nvidia'; // Famille NVIDIA
        this.FAST_MODEL = 'minimaxai/minimax-m2.1';
    }

    /**
     * Traite un message en mode FastPath
     * @param {Object} message - Message WhatsApp normalisé
     * @param {Object} context - Contexte léger du TieredContextLoader
     * @returns {Promise<{response: string|null, toolExecuted: boolean}>}
     */
    /**
     * Traite un message en mode FastPath avec une mini-boucle (Max 2 étapes)
     * @param {Object} message - Message WhatsApp normalisé
     * @param {Object} context - Contexte léger du TieredContextLoader
     * @returns {Promise<{type: 'RESPONSE'|'ESCALATE'|'ERROR', content?: string, partialHistory?: Array}>}
     */
    async handle(message: any, context: any) {
        const startTime = Date.now();
        console.log('[FastPath] ⚡ Traitement ultra-rapide (Mini-Boucle)');
        const MAX_FAST_STEPS = 2;
        let startMessages = [];

        try {
            // 1. Sélectionner les outils les plus pertinents (max 3)
            const quickTools = await this._getQuickTools(message.text);

            // 2. Construire l'historique initial
            // Si context.history est déjà un tableau de {role, content}, on l'utilise
            // Sinon on prend context.recentMessages
            startMessages = [
                { role: 'system', content: context.systemPrompt },
                ...(context.history || context.recentMessages || []).slice(-3), // Réduction à 3 pour alléger le payload
                { role: 'user', content: message.text }
            ];

            let history = [...startMessages];
            let lastResponse: any = null;

            // 3. Mini-Boucle (Max 2 itérations)
            for (let i = 0; i < MAX_FAST_STEPS; i++) {
                console.log(`[FastPath] 🔄 Itération ${i + 1}/${MAX_FAST_STEPS}`);

                // Appel LLM
                const response = await providerRouter.chat(history, {
                    family: this.FAST_FAMILY,
                    model: this.FAST_MODEL,
                    tools: quickTools.length > 0 ? quickTools : undefined,
                    maxTokens: this.MAX_TOKENS,
                    skipClassification: true
                });

                lastResponse = response;

                // [FALLBACK] Vérifier si le modèle a écrit l'outil dans le texte (Hallucination XML)
                // On le fait AVANT d'ajouter à l'historique pour que l'objet soit complet
                if (!response.toolCalls || response.toolCalls.length === 0) {
                    const textToolCalls = extractToolCallsFromText(response.content || '');

                    if (textToolCalls.length > 0) {
                        console.log(`[FastPath] 🕵️ ${textToolCalls.length} outils extraits du texte (XML Hallucination)`);

                        response.toolCalls = textToolCalls.map((call: any) => ({
                            id: `call_${Math.random().toString(36).substring(7)}`,
                            type: 'function',
                            function: {
                                name: call.name,
                                arguments: call.arguments
                            }
                        }));

                        // On nettoie le content car il a été transformé en action
                        response.content = this._cleanToolCallsFromText(response.content);
                    }
                }

                // Ajouter la réponse assistant à l'historique (Maintenant garanti complet)
                if (response.message) {
                    history.push(response.message);
                } else {
                    history.push({ 
                        role: 'assistant', 
                        content: response.content || '',
                        // Inclure les tool_calls (natifs ou extraits)
                        ...(response.toolCalls && response.toolCalls.length > 0 && { tool_calls: response.toolCalls })
                    });
                }

                // Cas A: Réponse texte directe (pas d'outil détecté, ni natif ni extrait)
                if (!response.toolCalls || response.toolCalls.length === 0) {
                    console.log(`[FastPath] ✅ Réponse directe trouvée.`);

                    // CLEANUP: Supprimer les tags <thought>
                    let cleanContent = (response.content || '')
                        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                        .trim();

                    cleanContent = this._cleanToolCallsFromText(cleanContent);

                    return {
                        type: 'RESPONSE',
                        content: cleanContent,
                        latency: Date.now() - startTime
                    };
                }

                // Cas B: Outil demandé
                console.log(`[FastPath] 🛠️ Outils demandés: ${response.toolCalls.length}`);

                // Si on est à la dernière itération et qu'il veut ENCORE utiliser un outil -> ESCALADE
                // (Car l'exécution de cet outil nécessiterait une 3ème itération pour générer la réponse finale)
                if (i === MAX_FAST_STEPS - 1) {
                    console.log(`[FastPath] ⚠️ Limite d'étapes atteinte (Demande d'outil au step 2) -> ESCALADE`);
                    // On n'exécute PAS l'outil, on passe la main avec l'historique incluant la demande d'outil
                    return {
                        type: 'ESCALATE',
                        partialHistory: history,
                        reason: 'max_steps_reached'
                    };
                }

                // Exécution des outils (Support multi-tools parallel)
                try {
                    const toolResults = await Promise.all(response.toolCalls.map((call: any) =>
                        this._executeSingleTool(call, message, context)
                    ));

                    // Ajouter les résultats à l'historique
                    let communicationHandled = false;

                    for (let j = 0; j < response.toolCalls.length; j++) {
                        const callName = response.toolCalls[j].function.name;
                        const tResult = toolResults[j] || {};
                        
                        history.push({
                            role: 'tool',
                            tool_call_id: response.toolCalls[j].id || `call_${Math.random().toString(36).substring(7)}`,
                            name: callName,
                            content: JSON.stringify(tResult) // Secure empty results
                        });

                        // Anti-Doublon: Seulement si l'IA a déja envoyé un vrai message texte, on ne doit pas renvoyer son texte.
                        // On exclut react_to_message car c'est juste un emoji, le texte de la réponse finale est quand même attendu !
                        if (tResult.success && callName === 'send_message') {
                            communicationHandled = true;
                        }
                    }

                    // Si on est au dernier tour ET que la communication texte a été gérée par send_message,
                    // inutile de rendre la réponse texte finale de l'IA (qui créerait un doublon)
                    if (i === MAX_FAST_STEPS - 1 && communicationHandled) {
                        return {
                            type: 'RESPONSE',
                            content: '', // Vide pour ne pas déclencher le sendText de core
                            latency: Date.now() - startTime
                        };
                    }

                } catch (e: any) {
                    console.error(`[FastPath] ❌ Erreur exécution outils: ${e.message}`);
                    // En cas d'erreur critique d'outil, on continue la boucle pour voir si l'IA peut récupérer
                    // ou on laisse l'IA gérer l'erreur au tour suivant.
                }
            }

            // Si on sort de la boucle sans return (ne devrait pas arriver avec le check i === max-1 mais sécurité)
            return {
                type: 'ESCALATE',
                partialHistory: history,
                reason: 'loop_exhausted'
            };

        } catch (error: any) {
            console.error('[FastPath] ❌ Erreur:', error.message);
            return {
                type: 'ERROR',
                error: error.message
            };
        }
    }

    /**
     * Récupère les 3 outils les plus pertinents pour ce message
     */
    async _getQuickTools(text: any) {
        try {
            // Utiliser le RAG de pluginLoader pour obtenir les outils pertinents
            const relevantTools = await pluginLoader.getRelevantTools(text, 3, 5);
            return relevantTools || [];
        } catch (e: any) {
            console.warn('[FastPath] Erreur récupération outils:', e.message);
            // Fallback: outils de base
            return [];
        }
    }

    /**
     * Exécute un seul outil (pas de boucle ReAct)
     */
    async _executeSingleTool(toolCall: any, message: any, context: any) {
        const toolName = toolCall.function.name;
        let args = {};

        try {
            args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e: any) {
            console.warn('[FastPath] Erreur parsing arguments:', e.message);
        }

        // Exécuter via pluginLoader
        const result = await pluginLoader.execute(toolName, args, {
            transport: this.transport,
            message,
            chatId: message.chatId,
            sender: message.sender,
            isGroup: message.isGroup,
            authority: context.authority
        });

        console.log(`[FastPath] 🛠️ Résultat ${toolName}:`,
            result?.success ? '✅' : '❌',
            result?.message?.substring(0, 50) || ''
        );

        return result;
    }

    /**
     * Nettoie les tool calls textuels de la réponse
     */
    _cleanToolCallsFromText(text: any) {
        if (!text) return text;

        // Patterns de tool calls textuels à nettoyer
        const patterns = [
            /<tool_call>[\s\S]*?<\/tool_call>/gi,
            /<tool_code>[\s\S]*?<\/tool_code>/gi,
            /<function>[\s\S]*?<\/function>/gi, // [FIX] Hallucination function tag
            /<([a-zA-Z0-9_]+)>[\s\S]*?<\/\1>/gi, // [FIX] GENERIC XML TAG (Catch-all for hallucinations)
            /```json\s*\{[\s\S]*?"name"[\s\S]*?\}[\s\S]*?```/gi,
            /```xml\s*<tool_code>[\s\S]*?<\/tool_code>\s*```/gi,
            /\[TOOL_CALL:.*?\]/gi,
        ];

        let cleaned = text;
        for (const pattern of patterns) {
            cleaned = cleaned.replace(pattern, '');
        }

        return cleaned.trim();
    }

    /**
     * Vérifie si le message nécessite un fallback vers AgenticPath
     * (Appelé si FastPath échoue ou retourne une réponse vide)
     */
    shouldFallbackToAgentic(result: any, originalText: any) {
        // Pas de réponse générée
        if (!result.response && !result.toolExecuted) {
            return true;
        }

        // Réponse trop courte pour une question longue
        if (originalText.length > 100 && result.response?.length < 50) {
            return true;
        }

        // La réponse contient des indicateurs qu'il faudrait plus de contexte
        const needsMoreContext = /je ne sais pas|je n'ai pas accès|impossible de|désolé,?\s+je/i;
        if (result.response && needsMoreContext.test(result.response)) {
            return true;
        }

        return false;
    }
}

export default FastPathHandler;
