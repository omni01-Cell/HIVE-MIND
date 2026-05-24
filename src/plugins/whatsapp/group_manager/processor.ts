// @ts-nocheck
// plugins/group_manager/processor.js
// Hybrid Processor: Local Regex → Contextual LLM (cost-effective)

import { filterDB, whitelistDB, warningsDB, configDB } from './database.js';
import { moderationActions } from './actions.js';
import { tryParseJson } from '../../../utils/ResponseFormatEnforcer.js';

/**
 * Hybrid filtering processor
 * Level 0: Local Regex (Free)
 * Level 1: Contextual LLM (if keyword detected)
 */
export class FilterProcessor {
    cache: any;
    cacheExpiry: any;

    constructor() {
        this.cache = new Map(); // Cache des filtres par groupe
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Main entry point - analyzes a message
     * @returns {Object|null} Action to execute or null if OK
     */
    async process(message: any, transport: any) {
        const { chatId: groupJid, sender, text, isGroup } = message;

        // Groups only
        if (!isGroup) return null;

        // Get group config
        const config = await configDB.get(groupJid);

        // If filtering is not active, ignore
        if (!config?.is_filtering_active) return null;

        // Check if user is whitelisted
        const isWhitelisted = await whitelistDB.isWhitelisted(groupJid, sender);
        if (isWhitelisted) {
            console.log(`[Filter] ${sender} is whitelisted, skipping`);
            return null;
        }

        // Get filters (with cache)
        const filters = await this._getFiltersWithCache(groupJid);
        if (!filters.length) return null;

        // LEVEL 0: Local Regex Analysis (Free)
        const matchedFilter = this._regexMatch(text, filters);

        if (!matchedFilter) {
            return null; // No suspicious keyword, pass
        }

        console.log(`[Filter] Keyword detected: "${matchedFilter.keyword}" in "${text.substring(0, 50)}..."`);

        // LEVEL 1: Contextual Analysis via LLM (Precise but costly)
        const decision = await this._contextualAnalysis(text, matchedFilter);

        if (!decision.shouldAct) {
            console.log(`[Filter] LLM: No action required (${decision.reason})`);
            return null;
        }

        // Execute appropriate action
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
     * Gets filters with cache
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
     * Invalidates a group's cache
     */
    invalidateCache(groupJid: any) {
        this.cache.delete(groupJid);
    }

    /**
     * LEVEL 0: Local Regex Match (Free)
     */
    _regexMatch(text: any, filters: any) {
        const textLower = text.toLowerCase();

        for (const filter of filters) {
            // Check main keyword
            if (textLower.includes(filter.keyword.toLowerCase())) {
                return filter;
            }

            // Check regex variants
            if (filter.regex_variants?.length) {
                for (const variant of filter.regex_variants) {
                    try {
                        const regex = new RegExp(variant, 'i');
                        if (regex.test(text)) {
                            return filter;
                        }
                    } catch (e: any) {
                        // Invalid regex, ignore
                    }
                }
            }
        }

        return null;
    }

    /**
     * LEVEL 1: Contextual Analysis via LLM
     */
    async _contextualAnalysis(text: any, filter: any) {
        const prompt = `You are a WhatsApp group moderator. Analyze this message:

MESSAGE: "${text}"

DETECTED KEYWORD: "${filter.keyword}"
ADMIN RULE: "${filter.context_rule || 'Forbid any serious use, tolerate humor.'}"
DEFAULT SEVERITY: ${filter.severity}

QUESTION: Does this message violate the rule?

<output_format>
Answer ONLY in JSON matching this format:
{
    "shouldAct": true,
    "reason": "short explanation",
    "severity": "warn"
}

Few-shot examples:
- {"shouldAct": true, "reason": "Severe hate speech matched forbidden keyword.", "severity": "ban"}
- {"shouldAct": false, "reason": "Keyword used in a harmless educational context.", "severity": "ignore"}
</output_format>`;

        try {
            const { providerRouter } = await import('../../../providers/index.js');
            const response = await providerRouter.chat([
                { role: 'user', content: prompt }
            ], { temperature: 0.1 }); // Low temperature for consistency

            const parsed = tryParseJson<any>(response.content);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }

            // Fallback if no valid JSON
            return { shouldAct: false, reason: 'AI response not parseable' };

        } catch (error: any) {
            console.error('[Filter] Contextual analysis error:', error);
            // On API error, apply default rule
            return {
                shouldAct: true,
                reason: 'Fallback (API error)',
                severity: filter.severity
            };
        }
    }

    /**
     * Executes the appropriate moderation action
     */
    async _executeAction(transport: any, groupJid: any, userJid: any, filter: any, decision: any, config: any) {
        const severity = decision.severity || filter.severity;
        const reason = `${filter.keyword}: ${decision.reason}`;

        // Add warning to DB
        await warningsDB.add(groupJid, userJid, reason, filter.id);

        // Count current warnings
        const warningCount = await warningsDB.count(groupJid, userJid);
        const maxWarnings = config.warning_limit || 3;

        console.log(`[Filter] ${userJid} - Warning ${warningCount}/${maxWarnings} (${severity})`);

        // Decide action
        if (severity === 'ban' || (config.auto_ban && warningCount >= maxWarnings)) {
            // Direct ban or limit reached
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
     * Generates keyword variants via AI
     * (For periodic updates)
     */
    async generateVariants(keyword: any) {
        const prompt = `Generate possible variants and bypasses for the forbidden word "${keyword}".
Include: intentional typos, leetspeak, spaces, special characters.

<output_format>
Answer ONLY with a JSON array of regex patterns. No introduction, no explanations.

Few-shot example:
["h.?i.?t.?l.?e.?r", "h1tl3r", "adolf"]
</output_format>`;

        try {
            const { providerRouter } = await import('../../../providers/index.js');
            const response = await providerRouter.chat([
                { role: 'user', content: prompt }
            ], { temperature: 0.3 });

            const parsed = tryParseJson<any[]>(response.content);
            if (Array.isArray(parsed)) {
                return parsed;
            }
            return [];
        } catch (error: any) {
            console.error('[Filter] Variant generation error:', error);
            return [];
        }
    }
}

export const filterProcessor = new FilterProcessor();
export default filterProcessor;
