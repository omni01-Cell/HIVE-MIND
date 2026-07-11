/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { uiTelemetryService, type ModelMetrics, type RoleMetrics, type ToolCallStats, type SessionMetrics } from './UIStateContext.js';

export enum ToolCallDecision {
  ACCEPT = 'accept',
  REJECT = 'reject',
  MODIFY = 'modify',
  AUTO_ACCEPT = 'auto_accept',
}

function areModelMetricsEqual(a: ModelMetrics, b: ModelMetrics): boolean {
    if (
        a.api.totalRequests !== b.api.totalRequests ||
    a.api.totalErrors !== b.api.totalErrors ||
    a.api.totalLatencyMs !== b.api.totalLatencyMs
    ) {
        return false;
    }
    if (
        a.tokens.input !== b.tokens.input ||
    a.tokens.prompt !== b.tokens.prompt ||
    a.tokens.candidates !== b.tokens.candidates ||
    a.tokens.total !== b.tokens.total ||
    a.tokens.cached !== b.tokens.cached ||
    a.tokens.thoughts !== b.tokens.thoughts ||
    a.tokens.tool !== b.tokens.tool
    ) {
        return false;
    }
    return true;
}

function areToolCallStatsEqual(a: ToolCallStats, b: ToolCallStats): boolean {
    if (
        a.count !== b.count ||
    a.success !== b.success ||
    a.fail !== b.fail ||
    a.durationMs !== b.durationMs
    ) {
        return false;
    }
    if (
        a.decisions[ToolCallDecision.ACCEPT] !==
      b.decisions[ToolCallDecision.ACCEPT] ||
    a.decisions[ToolCallDecision.REJECT] !==
      b.decisions[ToolCallDecision.REJECT] ||
    a.decisions[ToolCallDecision.MODIFY] !==
      b.decisions[ToolCallDecision.MODIFY] ||
    a.decisions[ToolCallDecision.AUTO_ACCEPT] !==
      b.decisions[ToolCallDecision.AUTO_ACCEPT]
    ) {
        return false;
    }
    return true;
}

function areMetricsEqual(a: SessionMetrics, b: SessionMetrics): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    try {
        const anyA = a as any;
        const anyB = b as any;

        if (anyA.totalTokens !== anyB.totalTokens || anyA.inputTokens !== anyB.inputTokens || anyA.outputTokens !== anyB.outputTokens) {
            return false;
        }

        // Safe files comparison
        if (anyA.files && anyB.files) {
            if (anyA.files.totalLinesAdded !== anyB.files.totalLinesAdded || anyA.files.totalLinesRemoved !== anyB.files.totalLinesRemoved) {
                return false;
            }
        } else if (!!anyA.files !== !!anyB.files) {
            return false;
        }

        // Safe tools comparison
        const toolsA = anyA.tools || anyA.toolCalls;
        const toolsB = anyB.tools || anyB.toolCalls;
        if (toolsA && toolsB) {
            const callsA = toolsA.totalCalls ?? toolsA.count ?? 0;
            const callsB = toolsB.totalCalls ?? toolsB.count ?? 0;
            const successA = toolsA.totalSuccess ?? toolsA.success ?? 0;
            const successB = toolsB.totalSuccess ?? toolsB.success ?? 0;
            const failA = toolsA.totalFail ?? toolsA.fail ?? 0;
            const failB = toolsB.totalFail ?? toolsB.fail ?? 0;

            if (callsA !== callsB || successA !== successB || failA !== failB) {
                return false;
            }
        } else if (!!toolsA !== !!toolsB) {
            return false;
        }

        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

export type { SessionMetrics, ModelMetrics, RoleMetrics };

export interface SessionStatsState {
  sessionId: string;
  sessionStartTime: Date;
  metrics: SessionMetrics;
  lastPromptTokenCount: number;
  promptCount: number;
}

export interface ComputedSessionStats {
  totalApiTime: number;
  totalToolTime: number;
  agentActiveTime: number;
  apiTimePercent: number;
  toolTimePercent: number;
  cacheEfficiency: number;
  totalDecisions: number;
  successRate: number;
  agreementRate: number;
  totalCachedTokens: number;
  totalInputTokens: number;
  totalPromptTokens: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
}

// Defines the final "value" of our context, including the state
// and the functions to update it.
interface SessionStatsContextValue {
  stats: SessionStatsState;
  startNewPrompt: () => void;
  getPromptCount: () => number;
}

// --- Context Definition ---

const SessionStatsContext = createContext<SessionStatsContextValue | undefined>(
    undefined
);

// --- Provider Component ---

export const SessionStatsProvider: React.FC<{
  children: React.ReactNode;
  sessionId: string;
}> = ({ children, sessionId }) => {
    const [stats, setStats] = useState<SessionStatsState>({
        sessionId,
        sessionStartTime: new Date(),
        metrics: uiTelemetryService.getMetrics(),
        lastPromptTokenCount: 0,
        promptCount: 0
    });

    useEffect(() => {
        const handleUpdate = ({
            metrics,
            lastPromptTokenCount
        }: {
      metrics: SessionMetrics;
      lastPromptTokenCount: number;
    }) => {
            setStats((prevState) => {
                if (
                    prevState.lastPromptTokenCount === lastPromptTokenCount &&
          areMetricsEqual(prevState.metrics, metrics)
                ) {
                    return prevState;
                }
                return {
                    ...prevState,
                    metrics,
                    lastPromptTokenCount
                };
            });
        };

        const handleClear = (newSessionId?: string) => {
            setStats((prevState) => ({
                ...prevState,
                sessionId: newSessionId || prevState.sessionId,
                sessionStartTime: new Date(),
                promptCount: 0
            }));
        };

        uiTelemetryService.on('update', handleUpdate);
        uiTelemetryService.on('clear', handleClear);
        // Set initial state
        handleUpdate({
            metrics: uiTelemetryService.getMetrics(),
            lastPromptTokenCount: uiTelemetryService.getLastPromptTokenCount()
        });

        return () => {
            uiTelemetryService.off('update', handleUpdate);
            uiTelemetryService.off('clear', handleClear);
        };
    }, []);

    const startNewPrompt = useCallback(() => {
        setStats((prevState) => ({
            ...prevState,
            promptCount: prevState.promptCount + 1
        }));
    }, []);

    const getPromptCount = useCallback(
        () => stats.promptCount,
        [stats.promptCount]
    );

    const value = useMemo(
        () => ({
            stats,
            startNewPrompt,
            getPromptCount
        }),
        [stats, startNewPrompt, getPromptCount]
    );

    return (
        <SessionStatsContext.Provider value={value}>
            {children}
        </SessionStatsContext.Provider>
    );
};

// --- Consumer Hook ---

export const useSessionStats = () => {
    const context = useContext(SessionStatsContext);
    if (context === undefined) {
        throw new Error(
            'useSessionStats must be used within a SessionStatsProvider'
        );
    }
    return context;
};
