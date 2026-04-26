// services/finops/CostTracker.ts
// ============================================================================
// Kill Switch Financier — Inspiré de Claude Code cost-tracker.ts
// Calcule le coût par requête via pricing.json et déclenche un arrêt
// de sécurité si le budget de session est dépassé.
// ============================================================================

import { readFileSync } from 'fs';
import { join } from 'path';
import { eventBus, BotEvents } from '../../core/events.js';

/** Structure d'une entrée de prix par modèle */
interface PricingEntry {
    readonly input: number;
    readonly output: number;
}

/** Structure du fichier pricing.json */
interface PricingConfig {
    readonly default: PricingEntry;
    readonly models: Record<string, PricingEntry>;
}

/** Résultat d'un enregistrement d'usage */
interface UsageRecord {
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly inputCost: number;
    readonly outputCost: number;
    readonly totalCost: number;
    readonly sessionTotal: number;
    readonly budgetSafe: boolean;
}

export class CostTracker {
    private readonly pricing: PricingConfig;
    private currentSessionCost: number = 0;
    private readonly maxSessionBudget: number;
    private readonly sessionStartTime: number = Date.now();

    constructor(maxBudget: number = 2.00) {
        this.maxSessionBudget = maxBudget;

        try {
            const pricingPath = join(process.cwd(), 'config', 'pricing.json');
            this.pricing = JSON.parse(readFileSync(pricingPath, 'utf-8'));
        } catch {
            console.warn('[CostTracker] ⚠️ pricing.json non trouvé, utilisation des prix par défaut.');
            this.pricing = { default: { input: 0.15, output: 0.60 }, models: {} };
        }
    }

    /**
     * Calcule le coût d'un appel et l'ajoute au total de session.
     * Retourne false si le budget est dépassé (Kill Switch).
     *
     * Pattern Claude Code : `addToTotalCost(costUSD, durationMs)`
     * mais ici on calcule aussi le coût au lieu de le recevoir pré-calculé.
     */
    public recordUsage(modelId: string, promptTokens: number, completionTokens: number): UsageRecord {
        const rates = this.pricing.models[modelId] || this.pricing.default;

        const inputCost = (promptTokens / 1_000_000) * rates.input;
        const outputCost = (completionTokens / 1_000_000) * rates.output;
        const totalCost = inputCost + outputCost;

        this.currentSessionCost += totalCost;

        const budgetSafe = this.currentSessionCost <= this.maxSessionBudget;

        // Log conditionnel pour éviter le spam sur les appels gratuits
        if (totalCost > 0) {
            console.log(`[FinOps] 💸 Coût requête: $${totalCost.toFixed(5)} (${modelId}) | Session: $${this.currentSessionCost.toFixed(4)} / $${this.maxSessionBudget.toFixed(2)}`);
        }

        if (!budgetSafe) {
            console.error(`[FinOps] 🚨 KILL SWITCH ! Budget dépassé ($${this.currentSessionCost.toFixed(2)} > $${this.maxSessionBudget})`);
            eventBus.publish(BotEvents.SYSTEM_ERROR, {
                type: 'BUDGET_EXCEEDED',
                sessionCost: this.currentSessionCost,
                maxBudget: this.maxSessionBudget
            });
        }

        return {
            model: modelId,
            promptTokens,
            completionTokens,
            inputCost,
            outputCost,
            totalCost,
            sessionTotal: this.currentSessionCost,
            budgetSafe
        };
    }

    /** Coût total de la session en cours */
    public getSessionCost(): number {
        return this.currentSessionCost;
    }

    /** Durée de la session en ms */
    public getSessionDuration(): number {
        return Date.now() - this.sessionStartTime;
    }

    /** Résumé formaté (inspiré de Claude Code `formatTotalCost`) */
    public formatSummary(): string {
        const durationSec = Math.round(this.getSessionDuration() / 1000);
        return `💰 Session: $${this.currentSessionCost.toFixed(4)} | Durée: ${durationSec}s | Budget: $${this.maxSessionBudget.toFixed(2)}`;
    }

    /** Reset pour tests ou nouvelle session */
    public reset(): void {
        this.currentSessionCost = 0;
    }
}

/** Singleton global */
export const costTracker = new CostTracker();
