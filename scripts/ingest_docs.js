import { createClient } from '@supabase/supabase-js';
import { EmbeddingsService } from '../services/ai/EmbeddingsService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config'; // Chargement .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CHUNK_SIZE = 1500;
const DB_TEXT_DIR = path.join(__dirname, '..', 'db_text');
const CONFIG_DIR = path.join(__dirname, '..', 'config');

console.log('📚 Démarrage de l\'ingestion de documents...');

// 1. Initialisation
async function init() {
    // Charger credentials
    const credPath = path.join(CONFIG_DIR, 'credentials.json');
    if (!fs.existsSync(credPath)) {
        console.error('❌ Fichier config/credentials.json introuvable.');
        process.exit(1);
    }
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

    // Charger models config
    const modelsConfigPath = path.join(CONFIG_DIR, 'models_config.json');
    let modelsConfig = {};
    if (fs.existsSync(modelsConfigPath)) {
        modelsConfig = JSON.parse(fs.readFileSync(modelsConfigPath, 'utf-8'));
    }
    const embeddingConfig = modelsConfig.reglages_generaux?.embeddings?.primary || {};

    // Supabase
    let sbUrl = creds.supabase?.url;
    if (!sbUrl || sbUrl.includes('SUPABASE_') || sbUrl.includes('VOTRE_')) {
        sbUrl = process.env.SUPABASE_URL;
    }

    let sbKey = creds.supabase?.service_role_key || creds.supabase?.key;
    if (!sbKey || sbKey.includes('SUPABASE_') || sbKey.includes('VOTRE_')) {
        sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    }

    if (!sbUrl || !sbKey) {
        console.error('❌ Credentials Supabase manquants/invalides.');
        console.error('   Vérifiez .env (SUPABASE_URL, SUPABASE_KEY) ou credentials.json');
        process.exit(1);
    }

    const supabase = createClient(sbUrl, sbKey);

    // Résolution intelligente des clés API (JSON -> ENV)
    function resolveKey(keyName, jsonValue) {
        if (!jsonValue || jsonValue.startsWith('VOTRE_')) {
            if (jsonValue && process.env[jsonValue]) return process.env[jsonValue];
            if (keyName === 'gemini') return process.env.GEMINI_API_KEY || process.env.VOTRE_CLE_GEMINI;
            if (keyName === 'openai') return process.env.OPENAI_API_KEY;
        }
        return jsonValue;
    }

    // Embeddings
    const embeddings = new EmbeddingsService({
        geminiKey: resolveKey('gemini', creds.familles_ia?.gemini),
        openaiKey: resolveKey('openai', creds.familles_ia?.openai),
        model: embeddingConfig.model || 'text-embedding-004', // Modèle par défaut plus récent
        dimensions: embeddingConfig.dimensions || 768
    });

    return { supabase, embeddings };
}

// 2. Traitement fichier
function splitByChunks(text, chunkSize) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
}

// 3. Main
async function run() {
    const { supabase, embeddings } = await init();

    // Vérifier dossier
    if (!fs.existsSync(DB_TEXT_DIR)) {
        fs.mkdirSync(DB_TEXT_DIR);
        console.log(`📁 Dossier créé: ${DB_TEXT_DIR}`);
        console.log('⚠️ Veuillez y déposer vos fichiers .txt et relancer le script.');
        process.exit(0);
    }

    const files = fs.readdirSync(DB_TEXT_DIR).filter(f => f.endsWith('.txt'));

    if (files.length === 0) {
        console.log('⚠️ Aucun fichier .txt trouvé dans db_text/');
        process.exit(0);
    }

    // Nettoyage préalable (Optionnel, ici on le fait pour éviter les doublons brutaux)
    console.log('🧹 Nettoyage de la base de connaissances actuelle (chat_id=global)...');
    const { error: delError } = await supabase
        .from('memories')
        .delete()
        .eq('chat_id', 'global')
        .eq('role', 'system'); // Sécurité pour ne pas supprimer d'autres trucs si on utilise global pour autre chose

    if (delError) console.error('Erreur nettoyage:', delError);

    let totalChunks = 0;

    for (const file of files) {
        console.log(`\n📄 Traitement de: ${file}`);
        const content = fs.readFileSync(path.join(DB_TEXT_DIR, file), 'utf-8');

        const chunks = splitByChunks(content, CHUNK_SIZE);
        console.log(`   -> Découpé en ${chunks.length} segments.`);

        for (let i = 0; i < chunks.length; i++) {
            const chunkContent = `[Source: ${file} (Part ${i + 1}/${chunks.length})]\n${chunks[i]}`;

            // Génération Embedding
            // Utiliser taskType 'RETRIEVAL_DOCUMENT' pour Gemini
            const vector = await embeddings.embed(chunkContent, 'RETRIEVAL_DOCUMENT');

            if (vector) {
                // Insertion
                const { error } = await supabase
                    .from('memories')
                    .insert({
                        chat_id: 'global', // ID Spécial
                        content: chunkContent,
                        role: 'system',    // Considéré comme une instruction/connaissance système
                        embedding: vector
                    });

                if (error) {
                    console.error(`   ❌ Erreur insertion chunk ${i}:`, error.message);
                } else {
                    process.stdout.write('.');
                    totalChunks++;
                }
            } else {
                console.error(`   ❌ Echec embedding chunk ${i}`);
            }

            // Petite pause pour rate limit
            await new Promise(r => setTimeout(r, 200));
        }
    }

    console.log(`\n\n✅ Terminé ! ${totalChunks} segments ingérés dans la mémoire globale.`);
}

run().catch(console.error);
