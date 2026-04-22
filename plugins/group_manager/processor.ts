// @ts-nocheck
// plugins/group_manager/processor.js
// Processeur hybride : Regex local → LLM contextuel (économique)

import { filterDB, whitelistDB, warningsDB, configDB } from './database.js';
import { moderationActions } from './actions.js';
import { providerRouter } from '../../providers/index.js';

/**
 * Processeur de filtrage hybride
 * Niveau 0: Regex local (gratuit)
 * Niveau 1: LLM contextuel (si mot-clé détecté)
 */
export class FilterProcessor {
    cache: any;
    cacheExpiry: any;

    constructor() {
        this.cache = new Map(); // Cache des filtres par groupe
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Point d'entrée principal - analyse un message
     * @returns {Object|null} Action à exécuter ou null si OK
     */
    async process(message: any, transport: any) {
        const { chatId: groupJid, sender, text, isGroup } = message;

        // Seulement pour les groupes
        if (!isGroup) return null;

        // Récupérer la config du groupe
        const config = await configDB.get(groupJid);

        // Si le filtrage n'est pas actif, on ignore
        if (!config?.is_filtering_active) return null;

        // Vérifier si l'utilisateur est whitelisté
        const isWhitelisted = await whitelistDB.isWhitelisted(groupJid, sender);
        if (isWhitelisted) {
            console.log(`[Filter] ${sender} est whitelisté, ignoré`);
            return null;
        }

        // Récupérer les filtres (avec cache)
        const filters = await this._getFiltersWithCache(groupJid);
        if (!filters.length) return null;

        // NIVEAU 0: Analyse Regex locale (gratuit)
        const matchedFilter = this._regexMatch(text, filters);

        if (!matchedFilter) {
            return null; // Pas de mot-clé suspect, on passe
        }

        console.log(`[Filter] Mot-clé détecté: "${matchedFilter.keyword}" dans "${text.substring(0, 50)}..."`);

        // NIVEAU 1: Analyse contextuelle par LLM (coûteux mais précis)
        const decision = await this._contextualAnalysis(text, matchedFilter);

        if (!decision.shouldAct) {
            console.log(`[Filter] LLM: Pas d'action requise (${decision.reason})`);
            return null;
        }

        // Exécuter l'action appropriée
        return await this._executeAction(
            transport,
            groupJid,
            sender,
            matchedFilter,
            decision,
            config
        );
    }

    /**
     * Récupère les filtres avec cache
     */
    async _getFiltersWithCache(groupJid: any) {
        const cached = this.cache.get(groupJid);
        if (cached && Date.now() - cached.time < this.cacheExpiry) {
            return cached.filters;
        }

        const filters = await filterDB.getFilters(groupJid);
        this.cache.set(groupJid, { filters, time: Date.now() });
        return filters;
    }

    /**
     * Invalide le cache d'un groupe
     */
    invalidateCache(groupJid: any) {
        this.cache.delete(groupJid);
    }

    /**
     * NIVEAU 0: Match par Regex local (gratuit)
     */
    _regexMatch(text: any, filters: any) {
        const textLower = text.toLowerCase();

        for (const filter of filters) {
            // Vérifier le mot-clé principal
            if (textLower.includes(filter.keyword.toLowerCase())) {
                return filter;
            }

            // Vérifier les variantes regex
            if (filter.regex_variants?.length) {
                for (const variant of filter.regex_variants) {
                    try {
                        const regex = new RegExp(variant, 'i');
                        if (regex.test(text)) {
                            return filter;
                        }
                    } catch (e: any) {
                        // Regex invalide, on ignore
                    }
                }
            }
        }

        return null;
    }

    /**
     * NIVEAU 1: Analyse contextuelle par LLM
     */
    async _contextualAnalysis(text: any, filter: any) {
        const prompt = `Tu es un modérateur de groupe WhatsApp. Analyse ce message:

MESSAGE: "${text}"

MOT-CLÉ DÉTECTÉ: "${filter.keyword}"
RÈGLE ADMIN: "${filter.context_rule || 'Interdire tout usage sérieux, tolérer l\'humour.'}"
SÉVÉRITÉ PAR DÉFAUT: ${filter.severity}

QUESTION: Ce message viole-t-il la règle ? Réponds UNIQUEMENT en JSON:
{
    "shouldAct": true/false,
    "reason": "explication courte",
    "severity": "warn" ou "ban" ou "ignore"
}`;

        try {
            const response = await providerRouter.chat([
                { role: 'user', content: prompt }
            ], { temperature: 0.1 }); // Basse température pour cohérence

            // Parser le JSON de la réponse
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // Fallback si pas de JSON valide
            return { shouldAct: false, reason: 'Réponse IA non parseable' };

        } catch (error: any) {
            console.error('[Filter] Erreur analyse contextuelle:', error);
            // En cas d'erreur API, on applique la règle par défaut
            return {
                shouldAct: true,
                reason: 'Fallback (erreur API)',
                severity: filter.severity
            };
        }
    }

    /**
     * Exécute l'action de modération appropriée
     */
    async _executeAction(transport: any, groupJid: any, userJid: any, filter: any, decision: any, config: any) {
        const severity = decision.severity || filter.severity;
        const reason = `${filter.keyword}: ${decision.reason}`;

        // Ajouter le warning dans la DB
        await warningsDB.add(groupJid, userJid, reason, filter.id);

        // Compter les warnings actuels
        const warningCount = await warningsDB.count(groupJid, userJid);
        const maxWarnings = config.warning_limit || 3;

        console.log(`[Filter] ${userJid} - Warning ${warningCount}/${maxWarnings} (${severity})`);

        // Décider de l'action
        if (severity === 'ban' || (config.auto_ban && warningCount >= maxWarnings)) {
            // Ban direct ou limite atteinte
            return await moderationActions.ban(transport, groupJid, userJid, reason);
        } else if (severity === 'kick') {
            return await moderationActions.kick(transport, groupJid, userJid, reason);
        } else if (severity === 'mute') {
            return await moderationActions.mute(transport, groupJid, userJid, reason);
        } else {
            // Warning standard
            return await moderationActions.warn(
                transport, groupJid, userJid, reason, warningCount, maxWarnings
            );
        }
    }

    /**
     * Génère des variantes de mots-clés via IA
     * (Pour mise à jour périodique)
     */
    async generateVariants(keyword: any) {
        const prompt = `Génère des variantes et contournements possibles pour le mot interdit "${keyword}".
Inclus: typos volontaires, leetspeak, espaces, caractères spéciaux.
Réponds UNIQUEMENT avec un tableau JSON de regex patterns, exemple:
["h.?i.?t.?l.?e.?r", "h1tl3r", "adolf"]`;

        try {
            const response = await providerRouter.chat([
                { role: 'user', content: prompt }
            ], { temperature: 0.3 });

            const jsonMatch = response.content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return [];
        } catch (error: any) {
            console.error('[Filter] Erreur génération variantes:', error);
            return [];
        }
    }
}

export const filterProcessor = new FilterProcessor();
export default filterProcessor;
