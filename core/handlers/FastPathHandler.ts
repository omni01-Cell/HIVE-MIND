// core/handlers/FastPathHandler.js
// ============================================================================
// FAST PATH HANDLER - Réponse directe ultra-rapide (sans boucle ReAct)
// Objectif: Latence < 1s pour 95% des messages (conversations simples)
// ============================================================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { providerRouter } from '../../providers/index.js';
import { pluginLoader } from '../../plugins/loader.js';
import { extractToolCallsFromText, parseToolArguments } from '../../utils/toolCallExtractor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Handler pour le mode FastPath
 * Traite les messages simples avec un seul appel LLM
 */
export class FastPathHandler {
    transport: any;
    MAX_TOKENS: any;
    FAST_CATEGORY: string;

    constructor(transport: any) {
        this.transport = transport;
        this.MAX_TOKENS = 500; // Réponses concises
        this.FAST_CATEGORY = 'FAST_CHAT'; // Résolu dynamiquement via models_config.json
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
            let usedModel: string | null = null;

            // 3. Mini-Boucle (Max 2 itérations)
            for (let i = 0; i < MAX_FAST_STEPS; i++) {
                console.log(`[FastPath] 🔄 Itération ${i + 1}/${MAX_FAST_STEPS}`);

                // Appel LLM via le Smart Router (respecte quotas, circuit breaker, reliability, fallback)
                const response = await providerRouter.chat(history, {
                    category: this.FAST_CATEGORY,   // Résolu par le router → primary/fallback depuis config
                    tools: quickTools.length > 0 ? quickTools : undefined,
                    maxTokens: this.MAX_TOKENS,
                    skipClassification: true         // On fournit déjà la catégorie, pas besoin du classifier LLM
                });

                lastResponse = response;
                usedModel = response.usedModel || usedModel;

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
     * Récupère les outils pertinents pour ce message
     */
    async _getQuickTools(text: any) {
        try {
            // Utiliser le RAG de pluginLoader pour obtenir les outils pertinents
            const relevantTools = await pluginLoader.getRelevantTools(text, 3, 5);
            
            // [PTC] Injecter le meta-tool code_execution SEULEMENT si le modèle FastPath est capable
            // Les modèles Tier C (<20B params) ne génèrent pas du code JS fiable
            const ptcEnabled = process.env.PTC_ENABLED !== 'false';
            if (ptcEnabled) {
                // Résoudre le modèle primary FAST_CHAT depuis la config (même source que le router)
                const primaryModel = this._resolvePrimaryModel();
                const ptcTier = this._getModelPtcTier(primaryModel);
                if (ptcTier !== 'C') {
                    const { ptcExecutor } = await import('../../services/ptc/index.js');
                    const codeExecToolDef = ptcExecutor.buildCodeExecutionToolDef(relevantTools);
                    relevantTools.push(codeExecToolDef);
                } else {
                    console.log(`[FastPath] ⏭️ PTC désactivé pour ${primaryModel} (Tier C)`);
                }
            }
            
            return relevantTools || [];
        } catch (e: any) {
            console.warn('[FastPath] Erreur récupération outils:', e.message);
            // Fallback: outils de base
            return [];
        }
    }

    /**
     * Résout le modèle primary de la catégorie FAST_CHAT depuis models_config.json
     */
    _resolvePrimaryModel(): string {
        try {
            const configPath = join(__dirname, '..', '..', 'config', 'models_config.json');
            const config = JSON.parse(readFileSync(configPath, 'utf8'));
            return config.reglages_generaux?.chat_recipes?.categories?.[this.FAST_CATEGORY]?.primary || 'unknown';
        } catch { return 'unknown'; }
    }

    /**
     * Récupère le ptc_tier d'un modèle depuis la config
     */
    _getModelPtcTier(modelId: string): string {
        try {
            const configPath = join(__dirname, '..', '..', 'config', 'models_config.json');
            const config = JSON.parse(readFileSync(configPath, 'utf8'));
            
            for (const family of Object.values(config.familles || {}) as any[]) {
                for (const model of family.modeles || []) {
                    if (model.id === modelId) return model.ptc_tier || 'C';
                }
            }
        } catch { /* fallback */ }
        return 'C'; // Sécurité : inconnu = pas de PTC
    }

    /**
     * Exécute un seul outil (pas de boucle ReAct)
     */
    async _executeSingleTool(toolCall: any, message: any, context: any) {
        const toolName = toolCall.function.name;
        let args: any = {};

        try {
            args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e: any) {
            console.warn('[FastPath] Erreur parsing arguments:', e.message);
        }

        // [PTC] Route spéciale pour code_execution dans le FastPath
        if (toolName === 'code_execution') {
            try {
                const { ptcExecutor, buildToolFunctions } = await import('../../services/ptc/index.js');
                const relevantTools = await this._getQuickTools(message.text);
                
                const toolFns = buildToolFunctions(
                    relevantTools,
                    (name: string, toolArgs: any, ctx: any) => pluginLoader.execute(name, toolArgs, ctx),
                    {
                        transport: this.transport,
                        message,
                        chatId: message.chatId,
                        sender: message.sender,
                        sourceChannel: message.sourceChannel,
                        onProgress: (status: string) => {
                            console.log(`[FastPath PTC Progress] ${status}`);
                        }
                    }
                );
                
                const ptcResult = await ptcExecutor.execute(args.code, toolFns);
                return ptcResult;
            } catch (err: any) {
                console.error('[FastPath] Erreur PTC:', err);
                return { success: false, error: err.message };
            }
        }

        // Exécuter via pluginLoader pour les autres outils
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
