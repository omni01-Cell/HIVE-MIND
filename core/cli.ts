import readline from 'readline';
import { exec } from 'child_process';
import { db, supabase } from '../services/supabase.js';

/**
 * Terminal Interface Implementation
 * Handles local commands during bot execution
 */
class CliInterface {
    rl: any;

    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'BOT> '
        });

        this.rl.on('line', (line: any) => {
            this.handleCommand(line.trim());
        });

        console.log('[CLI] Terminal interface ready. Type "help" for commands.');
        this.rl.prompt();
    }

    async handleCommand(cmd: any) {
        if (!cmd) {
            this.rl.prompt();
            return;
        }

        const [command, ...args] = cmd.split(' ');

        switch (command.toLowerCase()) {
            case 'help':
                console.log(`
📚 Available Commands:
  doc ingest   - Run document ingestion script
  doc clear    - Clear "global" knowledge base
  doc status   - Check knowledge base stats
  exit         - Stop the bot
                `);
                break;

            case 'exit':
                console.log('Shutting down...');
                process.exit(0);
                break;

            case 'doc':
                await this.handleDocCommand(args);
                break;

            default:
                console.log(`Unknown command: ${command}`);
        }

        this.rl.prompt();
    }

    async handleDocCommand(args: any) {
        const subCmd = args[0]?.toLowerCase();

        if (subCmd === 'ingest') {
            console.log('⚙️ Starting ingestion script...');
            exec('node scripts/ingest_docs.js', (error, stdout, stderr) => {
                if (error) console.error(`[Ingest Error] ${error.message}`);
                // if (stderr) console.error(`[Ingest Stderr] ${stderr}`);
                if (stdout) console.log(stdout);
                console.log('✅ Ingestion process finished.');
                this.rl.prompt(); // Re-prompt after async op
            });
            return; // Return early, prompt handled in callback
        }

        if (subCmd === 'clear') {
            if (!supabase) {
                console.error('❌ Supabase not connected.');
            } else {
                console.log('🗑️ Clearing global knowledge base...');
                const { error, count } = await supabase
                    .from('memories')
                    .delete({ count: 'exact' })
                    .eq('chat_id', 'global');

                if (error) console.error(`❌ Error: ${error.message}`);
                else console.log(`✅ Cleared ${count} items.`);
            }
        }

        if (subCmd === 'status') {
            if (!supabase) {
                console.error('❌ Supabase not connected.');
            } else {
                const { error, count } = await supabase
                    .from('memories')
                    .select('*', { count: 'exact', head: true })
                    .eq('chat_id', 'global');

                if (error) console.error(`❌ Error: ${error.message}`);
                else console.log(`📚 Knowledge Base Status: ${count} documents (chunks).`);
            }
        }
    }
}

export const cli = new CliInterface();
