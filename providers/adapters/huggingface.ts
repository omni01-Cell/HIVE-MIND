// @ts-nocheck

// providers/adapters/huggingface.js
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class HuggingFaceAdapter {
    client: any;

    constructor() {
        this.client = null;
        this._initClient();
    }

    _initClient() {
        try {
            const credsPath = join(__dirname, '..', '..', 'config', 'credentials.json');
            const creds = JSON.parse(readFileSync(credsPath, 'utf-8'));
            const token = creds.familles_ia?.HF_TOKEN;

            if (token && !token.startsWith('VOTRE')) {
                this.client = new OpenAI({
                    baseURL: "https://router.huggingface.co/v1",
                    apiKey: token,
                });
            } else {
                console.warn('[HuggingFace] Token HF_TOKEN manquant ou placeholder');
            }
        } catch (e: any) {
            console.warn('[HuggingFace] Erreur lecture credentials:', e.message);
        }
    }

    async chat(messages: any, options: any = {}) {
        if (!this.client) {
            throw new Error("HuggingFace Adapter non initialisé (Token manquant)");
        }

        try {
            const completion = await this.client.chat.completions.create({
                model: options.model || "meta-llama/Meta-Llama-3-8B-Instruct",
                messages: messages,
                max_tokens: options.max_tokens || 1000,
                temperature: options.temperature || 0.7,
            });

            return {
                content: completion.choices[0].message.content,
                metadata: {
                    model: completion.model,
                    usage: completion.usage
                }
            };
        } catch (error: any) {
            console.error(`[HuggingFace] Error: ${error.message}`);
            if (error.status === 429) {
                throw new Error("Quota Hugging Face dépassé (Rate Limit)");
            }
            throw error;
        }
    }
}

// Export a singleton instance (since router likely expects an object with chat method)
// OR export the Class if router does `new Adapter()`.
// Based on `loadAdapters` doing `registerAdapter(name, adapter.default)`,
// and strict usage `providerRouter.chat()` which likely calls `adapter.chat()`,
// we should export an INSTANCE.
export default new HuggingFaceAdapter();
