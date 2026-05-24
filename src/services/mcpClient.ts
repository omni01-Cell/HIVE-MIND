import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface McpServerConfig {
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

class McpClientService {
  private clients: Map<string, Client> = new Map();
  private toolsCache: any[] = [];
  private connectingPromise: Promise<void> | null = null;

  constructor() {}

  private loadConfig(): Record<string, McpServerConfig> {
    const configPath = join(process.cwd(), '.mcprc');
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (e) {
        console.error('[MCP] Failed to parse .mcprc', e);
      }
    }
    return {};
  }

  async connectAll() {
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = (async () => {
      const config = this.loadConfig();
      for (const [name, serverDef] of Object.entries(config)) {
        if (this.clients.has(name)) continue;

        try {
          const transport = serverDef.type === 'sse' && serverDef.url
            ? new SSEClientTransport(new URL(serverDef.url))
            : new StdioClientTransport({
                command: serverDef.command!,
                args: serverDef.args || [],
                env: { ...process.env, ...(serverDef.env || {}) } as Record<string, string>,
              });

          const client = new Client(
            { name: 'hive-mind', version: '1.0.0' },
            { capabilities: {} }
          );

          await client.connect(transport);
          this.clients.set(name, client);
          console.log(`[MCP] ✅ Connected to server: ${name}`);
        } catch (e: any) {
          console.error(`[MCP] ❌ Failed to connect to server ${name}:`, e.message);
        }
      }
    })();

    return this.connectingPromise;
  }

  async getTools() {
    await this.connectAll();
    
    // We recreate the cache to catch any newly connected servers
    const tools: any[] = [];
    for (const [name, client] of this.clients.entries()) {
      try {
        const result = await client.request(
          { method: 'tools/list' },
          ListToolsResultSchema
        );
        for (const tool of result.tools) {
          tools.push({
            type: 'function',
            function: {
              name: `mcp__${name}__${tool.name}`,
              description: tool.description || `MCP Tool from ${name}`,
              parameters: tool.inputSchema
            },
            // Metadata for routing later
            _mcpServer: name,
            _mcpTool: tool.name
          });
        }
      } catch (e: any) {
        console.error(`[MCP] Failed to get tools from ${name}:`, e.message);
      }
    }
    this.toolsCache = tools;
    return tools;
  }

  async callTool(serverName: string, toolName: string, args: any) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`[MCP] Server ${serverName} not connected`);
    }

    try {
      const result = await client.callTool(
        {
          name: toolName,
          arguments: args
        },
        CallToolResultSchema
      );

      if (result.isError) {
        return { success: false, error: result.error || 'Unknown MCP error', isError: true };
      }

      if ('toolResult' in result) {
        return { success: true, data: result.toolResult };
      }

      if ('content' in result && Array.isArray(result.content)) {
          const texts = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          return { success: true, data: texts, raw: result.content };
      }
      return { success: true, data: result };
    } catch (e: any) {
      console.error(`[MCP] Failed to call tool ${toolName} on ${serverName}:`, e.message);
      return { success: false, error: e.message };
    }
  }
}

export const mcpClient = new McpClientService();
export default mcpClient;
