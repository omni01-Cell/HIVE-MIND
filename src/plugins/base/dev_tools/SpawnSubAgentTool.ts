// plugins/dev_tools/SpawnSubAgentTool.ts
// ============================================================================
// Sub-Agent Creator Tool (Swarm Orchestration)
// Allows HIVE-MIND to dynamically instantiate specialized sub-agents
// via the universal SubAgentEngine.
// ============================================================================

import { SubAgentEngine } from '../../../services/agentic/SubAgentEngine.js';
import { pluginLoader } from '../../loader.js';

export default {
    name: 'spawn_sub_agent',
    description: 'Instantiates and executes a specialized sub-agent to accomplish a complex task in the background.',
    version: '1.0.0',
    enabled: true,

    toolDefinitions: [
        {
            type: 'function',
            function: {
                name: 'spawn_sub_agent',
                description: 'Creates an autonomous sub-agent (Swarm) with a specific role and precise tools to accomplish a complex mission in the background. Use it to delegate long tasks or those requiring sharp specialization (e.g., fact-checking, code analysis, generating a complex research report).',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'The name of the sub-agent (e.g., "FactChecker", "MathGenius", "CodeReviewer").'
                        },
                        persona: {
                            type: 'string',
                            description: 'The complete system prompt that defines the personality, role, and strict rules of the sub-agent (e.g. "You are a cybersecurity expert. Your mission is...").'
                        },
                        tools: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'The exact list of tools this sub-agent is allowed to use (e.g., ["duckduck_search", "read_file", "list_directory"]). ATTENTION: only give strictly necessary tools!'
                        },
                        mission: {
                            type: 'string',
                            description: 'The exact instructions and task the sub-agent must accomplish.'
                        }
                    },
                    required: ['name', 'persona', 'tools', 'mission']
                }
            }
        }
    ],

    async execute(args: any, context: any, toolName: string) {
        if (toolName !== 'spawn_sub_agent') return null;

        const { name, persona, tools, mission } = args;
        
        console.log(`[Swarm Orchestration] 🧬 Dynamically creating sub-agent: ${name}`);
        console.log(`[Swarm Orchestration] 🛠️ Tools allocated: ${tools.join(', ')}`);

        // Prevent delegation of critical tools like bash_eval unless explicitly verified
        const safeTools = tools.filter((tool: string) => tool !== 'bash_eval');

        if (safeTools.length !== tools.length) {
            console.warn(`[Swarm Orchestration] ⚠️ bash_eval was removed for security reasons.`);
        }

        const dynamicEngine = new SubAgentEngine({
            name: name,
            systemPrompt: persona,
            allowedTools: safeTools,
            maxIterations: 10, // Reasonable limit for a dynamic agent
            category: 'AGENTIC' // Force use of a reasoning model
        });

        const result = await dynamicEngine.run(mission, context);
        
        return {
            success: result.success,
            message: result.message
        };
    }
};
