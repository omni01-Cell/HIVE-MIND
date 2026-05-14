interface McpToolsContext {
    transport?: any;
    chatId?: string;
    [key: string]: any;
}

export default {
    name: 'mcp_tools',
    description: 'Provide tools dynamically loaded from connected MCP Servers.',
    version: '1.0.0',
    enabled: true,

    // toolDefinitions will be populated dynamically
    toolDefinitions: [] as any[],
    
    async init() {
        console.log('[MCP Plugin] Fetching tools from connected servers...');
        try {
            const { default: mcpClient } = await import('../../../services/mcpClient.js');
            const tools = await mcpClient.getTools();
            this.toolDefinitions = tools;
            console.log(`[MCP Plugin] Loaded ${tools.length} MCP tools.`);
        } catch (e: any) {
            console.error('[MCP Plugin] Failed to initialize tools:', e.message);
        }
    },
    async execute(args: unknown, context: McpToolsContext, toolName: string) {
        const { transport, chatId } = context || {};
        
        // toolName format: mcp__SERVERNAME__TOOLNAME
        const parts = toolName.split('__');
        if (parts.length === 3 && parts[0] === 'mcp') {
            const serverName = parts[1];
            const mcpToolName = parts[2];
            
            console.log(`[MCP Plugin] Executing ${mcpToolName} on server ${serverName}`);
            const { default: mcpClient } = await import('../../../services/mcpClient.js');
            const result = await mcpClient.callTool(serverName, mcpToolName, args as Record<string, unknown>);
            
            return {
                success: result.success,
                message: result.success ? "MCP tool executed successfully" : `MCP tool failed: ${result.error}`,
                data: result.data,
                raw: result.raw
            };
        }
        
        return {
            success: false,
            message: `[MCP Plugin] Unknown tool format: ${toolName}`
        };
    }
};
