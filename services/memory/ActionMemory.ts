/**
 * services/memory/ActionMemory.ts
 * Dynamic action memory service.
 * Allows the bot to remember ongoing actions when the conversation subject changes.
 */

import { redis } from '../redisClient.js';
import { supabase } from '../supabase.js';

export interface ActionStep {
  step: string;
  timestamp: number;
}

export interface OngoingAction {
  id: string;
  chatId: string;
  type: string;
  goal: string;
  context: any;
  priority: number;
  status: 'active' | 'completed' | 'interrupted';
  steps: ActionStep[];
  startedAt: number;
  updatedAt?: number;
  expiresAt?: number;
}

export class ActionMemory {
  private readonly keyPrefix = 'action:';
  private readonly defaultTTL = 3600; // 1 hour
  private initialized = false;

  constructor() {
    this.startOrphanCleanup();
  }

  /**
   * Initializes the service.
   */
  public init(): void {
    this.initialized = true;
  }

  /**
   * Starts a new action.
   * @param chatId Chat ID.
   * @param action { type, goal, context, priority }
   * @returns Action ID.
   */
  async startAction(chatId: string, { type, goal, context = {}, priority = 5 }: Partial<OngoingAction>): Promise<string | null> {
    const actionId = `${chatId}:${Date.now()}`;
    const actionData: any = {
      id: actionId,
      chatId,
      type,
      goal,
      context: JSON.stringify(context),
      priority: priority.toString(),
      status: 'active',
      steps: JSON.stringify([]),
      startedAt: Date.now().toString(),
      expiresAt: (Date.now() + (this.defaultTTL * 1000)).toString()
    };

    try {
      // Store in Redis with TTL
      const key = `${this.keyPrefix}${chatId}`;
      await redis.hSet(key, actionData);
      await redis.expire(key, this.defaultTTL);

      // Log in Supabase for history
      if (supabase) {
        await supabase.from('agent_actions').insert({
          chat_id: chatId,
          tool_name: type,
          params: JSON.stringify({ goal, context }),
          status: 'active'
        });
      }

      console.log(`[ActionMemory] 🎬 Action started: ${type} (${goal})`);
      return actionId;
    } catch (error: any) {
      console.error('[ActionMemory] Error startAction:', error.message);
      return null;
    }
  }

  /**
   * Retrieves the active action for a chat.
   * @param chatId Chat ID.
   * @returns Action object or null.
   */
  async getActiveAction(chatId: string): Promise<OngoingAction | null> {
    try {
      const key = `${this.keyPrefix}${chatId}`;
      const data = await redis.hGetAll(key);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      // Reconstruct action object from Redis hash
      return {
        id: data.id,
        chatId: data.chatId,
        type: data.type,
        goal: data.goal,
        steps: JSON.parse(data.steps || '[]'),
        status: data.status as any,
        startedAt: parseInt(data.startedAt),
        updatedAt: data.updatedAt ? parseInt(data.updatedAt) : undefined,
        context: JSON.parse(data.context || '{}'),
        priority: parseInt(data.priority)
      };
    } catch (error: any) {
      console.error(`[ActionMemory] Error getActiveAction ${chatId}:`, error.message);
      return null;
    }
  }

  /**
   * Automatic cleanup of orphan actions (every hour).
   * @private
   */
  private startOrphanCleanup(): void {
    setInterval(async () => {
      // We don't block cleanup even if not "initialized" as long as clients are ready
      try {
        console.log('[ActionMemory] 🧹 Starting orphan actions cleanup...');
        await this._cleanupRedisOrphans();
        await this._cleanupSupabaseOrphans();
        console.log('[ActionMemory] ✅ Cleanup completed');
      } catch (error: any) {
        console.error('[ActionMemory] ❌ Cleanup error:', error.message);
      }
    }, 60 * 60 * 1000);
  }

  private async _cleanupRedisOrphans(): Promise<void> {
    try {
      const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24h
      const pattern = 'action:*';
      const keys = await redis.keys(pattern);
      
      let cleaned = 0;
      for (const key of keys) {
        const data = await redis.hGetAll(key);
        if (!data || Object.keys(data).length === 0) continue;

        const updatedAt = data.updatedAt ? parseInt(data.updatedAt) : parseInt(data.startedAt);
        if (data.status === 'active' && updatedAt < cutoffTime) {
          await redis.del(key);
          cleaned++;
          console.log(`[ActionMemory] 🗑️ Orphan action removed from Redis: ${key}`);
        }
      }
      
      if (cleaned > 0) {
        console.log(`[ActionMemory] Cleaned ${cleaned} orphan Redis actions`);
      }
    } catch (error: any) {
      console.error('[ActionMemory] Redis cleanup error:', error.message);
    }
  }

  private async _cleanupSupabaseOrphans(): Promise<void> {
    if (!supabase) return;
    try {
      const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
      
      const { count } = await supabase
        .from('agent_actions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lt('created_at', cutoffTime);
      
      if (count && count > 0) {
        console.log(`[ActionMemory] Removing ${count} orphan Supabase actions...`);
        const { error } = await supabase
          .from('agent_actions')
          .delete()
          .eq('status', 'active')
          .lt('created_at', cutoffTime);
        
        if (error) {
          console.error('[ActionMemory] Supabase cleanup error:', error.message);
        } else {
          console.log(`[ActionMemory] ✅ ${count} orphan Supabase actions removed`);
        }
      }
    } catch (error: any) {
      console.error('[ActionMemory] Supabase cleanup error:', error.message);
    }
  }

  /**
   * Updates an action step.
   * @param chatId Chat ID.
   * @param step Step description.
   */
  async updateStep(chatId: string, step: string): Promise<boolean> {
    try {
      const action = await this.getActiveAction(chatId);
      if (!action) return false;

      action.steps.push({
        step,
        timestamp: Date.now()
      });

      const key = `${this.keyPrefix}${chatId}`;
      await redis.hSet(key, 'steps', JSON.stringify(action.steps));
      await redis.hSet(key, 'updatedAt', Date.now().toString());

      if (supabase) {
        await supabase.from('agent_actions')
          .update({ steps: JSON.stringify(action.steps) })
          .eq('chat_id', chatId)
          .eq('status', 'active');
      }

      return true;
    } catch (error: any) {
      console.error('[ActionMemory] updateStep error:', error.message);
      return false;
    }
  }

  /**
   * Completes an action.
   * @param chatId Chat ID.
   * @param result Action result.
   */
  async completeAction(chatId: string, result: any): Promise<boolean> {
    try {
      const action = await this.getActiveAction(chatId);
      if (!action) return false;

      const key = `${this.keyPrefix}${chatId}`;
      await redis.hSet(key, 'status', 'completed');
      await redis.hSet(key, 'result', JSON.stringify(result));
      await redis.hSet(key, 'updatedAt', Date.now().toString());

      if (supabase) {
        await supabase.from('agent_actions')
          .update({
            status: 'completed',
            result: JSON.stringify(result)
          })
          .eq('chat_id', chatId)
          .eq('tool_name', action.type)
          .is('result', null)
          .order('created_at', { ascending: false })
          .limit(1);
      }

      // Expire from Redis after 60s
      await redis.expire(key, 60);

      console.log(`[ActionMemory] ✅ Action completed: ${action.type}`);
      return true;
    } catch (error: any) {
      console.error('[ActionMemory] completeAction error:', error.message);
      return false;
    }
  }

  /**
   * Interrupts an ongoing action.
   * @param chatId Chat ID.
   * @param reason Reason for interruption.
   */
  async interruptAction(chatId: string, reason: string): Promise<boolean> {
    try {
      const action = await this.getActiveAction(chatId);
      if (!action) return false;

      const key = `${this.keyPrefix}${chatId}`;
      await redis.hSet(key, 'status', 'interrupted');
      await redis.hSet(key, 'interruptReason', reason);
      await redis.hSet(key, 'updatedAt', Date.now().toString());

      console.log(`[ActionMemory] ⏸️ Action interrupted: ${action.type} (${reason})`);
      await redis.expire(key, 300); // 5 minutes

      return true;
    } catch (error: any) {
      console.error('[ActionMemory] interruptAction error:', error.message);
      return false;
    }
  }

  async hasActiveAction(chatId: string): Promise<boolean> {
    const action = await this.getActiveAction(chatId);
    return action !== null && action.status === 'active';
  }

  async cleanupChatActions(chatId: string): Promise<void> {
    try {
      console.log(`[ActionMemory] 🧹 Cleaning up actions for chat: ${chatId}`);
      
      const key = `${this.keyPrefix}${chatId}`;
      await redis.del(key);
      
      if (supabase) {
        const { error } = await supabase
          .from('agent_actions')
          .update({ status: 'interrupted', completed_at: new Date().toISOString() })
          .eq('chat_id', chatId)
          .eq('status', 'active');
        
        if (error) {
          console.error(`[ActionMemory] Supabase cleanup error for ${chatId}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error(`[ActionMemory] cleanupChatActions error for ${chatId}:`, error.message);
    }
  }

  async formatForPrompt(chatId: string): Promise<string> {
    const action = await this.getActiveAction(chatId);
    if (!action) return '';

    const elapsed = Math.floor((Date.now() - action.startedAt) / 1000);
    const stepsText = action.steps.length > 0
      ? action.steps.map(s => `  - ${s.step}`).join('\n')
      : '  (No steps completed)';

    return `
### 🎯 ONGOING ACTION
- **Type**: ${action.type}
- **Goal**: ${action.goal}
- **Started**: ${elapsed}s ago
- **Steps**:
${stepsText}

**IMPORTANT**: An action is currently in progress. You can:
1. Continue this action if the user message is related.
2. Pause it and return later if the subject changed.
3. Abandon it if the user explicitly asks to stop.
`;
  }

  async getResumableActions(limit: number = 10): Promise<any[]> {
    if (!supabase) return [];
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('agent_actions')
        .select('*')
        .eq('status', 'active')
        .gt('created_at', cutoffTime)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data as any[]).map(row => ({
        id: row.id,
        chatId: row.chat_id,
        type: row.tool_name,
        params: typeof row.params === 'string' ? JSON.parse(row.params) : row.params,
        steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []),
        createdAt: new Date(row.created_at).getTime()
      }));
    } catch (error: any) {
      console.error('[ActionMemory] getResumableActions error:', error.message);
      return [];
    }
  }

  async rehydrateAction(chatId: string, actionId: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { data, error } = await supabase
        .from('agent_actions')
        .select('*')
        .eq('id', actionId)
        .single();

      if (error || !data) throw new Error('Action not found in Supabase');

      const actionData: any = {
        id: data.id.toString(),
        chatId: data.chat_id,
        type: data.tool_name,
        goal: typeof data.params === 'string' ? JSON.parse(data.params).goal : data.params.goal,
        context: typeof data.params === 'string' ? JSON.parse(data.params).context : JSON.stringify(data.params.context || {}),
        priority: '5',
        status: 'active',
        steps: typeof data.steps === 'string' ? data.steps : JSON.stringify(data.steps || []),
        startedAt: new Date(data.created_at).getTime().toString(),
        expiresAt: (Date.now() + (this.defaultTTL * 1000)).toString()
      };

      const key = `${this.keyPrefix}${chatId}`;
      await redis.hSet(key, actionData);
      await redis.expire(key, this.defaultTTL);

      console.log(`[ActionMemory] 💧 Action rehydrated in Redis: ${data.tool_name}`);
      return true;
    } catch (error: any) {
      console.error('[ActionMemory] rehydrateAction error:', error.message);
      return false;
    }
  }
}

export const actionMemory = new ActionMemory();
export default actionMemory;
