#!/usr/bin/env node
// scripts/admin-cli.js
// CLI pour exécuter les commandes admin du bot

// CRITIQUE: Charger .env AVANT tout import de service
import 'dotenv/config';

import { redis, ensureConnected } from '../services/redisClient.js';
import { adminService } from '../services/adminService.js';
import { supabase } from '../services/supabase.js';
import * as logger from '../utils/logger.js';
import { StateManager } from '../services/state/StateManager.js';
import { LockManager } from '../services/state/LockManager.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    console.log('\n🤖 Bot Admin CLI\n');

    if (!command) {
        logger.help();
        process.exit(0);
    }

    // Connexions
    await ensureConnected();
    await adminService.init();

    switch (command) {
        // Debug
        case 'debug:on':
            logger.enableDebug();
            break;
        case 'debug:off':
            logger.disableDebug();
            break;
        case 'debug:status':
            console.log(logger.debugStatus());
            break;
        case 'debug:reset':
            logger.resetDebug();
            break;
        case 'debug:categories':
            const cats = args.slice(1);
            if (cats.length === 0) {
                console.log('Usage: npm run cli debug:categories mention authority social');
            } else {
                logger.setDebugCategories(cats);
            }
            break;

        case 'debug:identity':
            const subCmd = args[1];
            if (subCmd === 'on') {
                await redis.set('config:debug:identity', 'true');
                console.log('🕵️‍♂️ Debug Identité : ACTIVÉ (Logs de fusion et auto-link visibles)');
            } else if (subCmd === 'off') {
                await redis.set('config:debug:identity', 'false');
                console.log('🕵️‍♂️ Debug Identité : DÉSACTIVÉ');
            } else {
                const current = await redis.get('config:debug:identity');
                console.log(`État actuel Debug Identité: ${current === 'true' ? '✅ ON' : '❌ OFF'}`);
                console.log('Usage: npm run cli debug:identity [on|off]');
            }
            break;

        // Redis
        case 'redis:stats':
            const stats = await logger.redisStats(redis);
            console.log('📊 Statistiques Redis:', stats);
            break;
        case 'redis:flush':
            const confirm = args[1] === '--yes';
            if (!confirm) {
                console.log('⚠️ ATTENTION: Cette commande efface tout le cache!');
                console.log('   Utilisez: npm run cli redis:flush --yes');
            } else {
                console.log('💾 Tentative de sync avant flush...');
                try { await StateManager.processSyncQueue(1000); } catch (e) { }

                const result = await logger.flushRedisCache(redis);
                console.log('Résultat:', result);
            }
            break;
        case 'redis:clear-group':
            const groupJid = args[1];
            if (!groupJid) {
                console.log('Usage: npm run cli redis:clear-group groupJid@g.us');
            } else {
                // await logger.clearGroupCache(redis, groupJid); // Ancienne méthode
                const cacheKey = `group:${groupJid}:meta`;
                await redis.del(cacheKey);
                console.log(`🗑️ Cache groupe effacé: ${cacheKey}`);
            }
            break;

        // ============================================================
        // NOUVELLE SECTION : GESTION D'ÉTAT (STATE MANAGEMENT)
        // ============================================================

        case 'state:sync':
            console.log('💾 Forçage de la synchronisation (Redis -> Supabase)...');
            try {
                // On appelle le worker manuellement
                await StateManager.processSyncQueue(1000); // Batch large
                console.log('✅ Synchronisation terminée.');
            } catch (e) {
                console.error('❌ Erreur sync:', e.message);
            }
            break;

        case 'state:inspect':
            const targetJid = args[1];
            if (!targetJid) {
                console.log('Usage: npm run cli state:inspect <jid>');
                break;
            }

            console.log(`🔍 Inspection de l'état pour : ${targetJid}`);

            // 1. Lire les données brutes
            const data = await redis.hGetAll(`user:${targetJid}:data`);

            // 2. Vérifier les verrous
            const isLocked = await redis.exists(`lock:user:${targetJid}`);

            // 3. Vérifier si en attente de sync
            const isQueued = await redis.sIsMember('queue:sync:users', targetJid);

            console.log({
                redisData: data,
                locked: isLocked ? '🔒 OUI' : '🔓 NON',
                pendingSync: isQueued ? '⏳ OUI' : '✅ NON'
            });
            break;

        case 'state:release-lock':
            const lockTarget = args[1]; // ex: le JID
            if (!lockTarget) {
                console.log('Usage: npm run cli state:release-lock <jid>');
                break;
            }

            // On force la suppression de la clé de lock
            const lockKey = `lock:user:${lockTarget}`;
            const result = await redis.del(lockKey);

            if (result) console.log(`🔓 Verrou sauté pour ${lockTarget}`);
            else console.log(`⚠️ Aucun verrou trouvé pour ${lockTarget}`);
            break;

        // Admin
        case 'admin:refresh':
            await logger.refreshAdminCache(adminService);
            break;
        case 'admin:list':
            const admins = await adminService.listAdmins();
            console.log('👑 Admins globaux:');
            admins.forEach(a => console.log(`   - ${a.jid} (${a.role})`));
            break;

        case 'admin:add':
            const addJid = args[1];
            const addName = args[2] || 'Admin'; // Nom par défaut
            const addRole = args[3] || 'moderator'; // Rôle par défaut

            if (!addJid) {
                console.log('Usage: npm run cli admin:add <jid> [name] [role]');
                break;
            }

            const added = await adminService.addAdmin(addJid, addName, addRole);
            if (added) console.log(`✅ Admin ajouté : ${addJid} (${addRole})`);
            else console.log('❌ Erreur lors de l\'ajout de l\'admin.');
            break;

        case 'admin:remove':
            const removeJid = args[1];
            if (!removeJid) {
                console.log('Usage: npm run cli admin:remove <jid>');
                break;
            }

            const removed = await adminService.removeAdmin(removeJid);
            if (removed) console.log(`✅ Admin retiré : ${removeJid}`);
            else console.log('❌ Erreur lors du retrait ou admin inexistant.');
            break;

        // Tools
        case 'tools:index':
            console.log('🔧 Indexation des outils du bot...\n');
            try {
                const { pluginLoader } = await import('../plugins/loader.js');
                const { EmbeddingsService } = await import('../services/ai/EmbeddingsService.js');
                const { readFileSync } = await import('fs');
                const { join, dirname } = await import('path');
                const { fileURLToPath } = await import('url');

                // Charger les credentials pour EmbeddingsService
                const __dirname2 = dirname(fileURLToPath(import.meta.url));
                const credentials = JSON.parse(readFileSync(join(__dirname2, '..', 'config', 'credentials.json'), 'utf-8'));
                const modelsConfig = JSON.parse(readFileSync(join(__dirname2, '..', 'config', 'models_config.json'), 'utf-8'));

                // Résoudre les variables d'environnement (comme ServiceContainer)
                let geminiKey = credentials.familles_ia?.gemini;
                let openaiKey = credentials.familles_ia?.openai;

                if (geminiKey && geminiKey.startsWith('VOTRE_') && process.env[geminiKey]) {
                    geminiKey = process.env[geminiKey];
                }
                if (openaiKey && openaiKey.startsWith('VOTRE_') && process.env[openaiKey]) {
                    openaiKey = process.env[openaiKey];
                }

                // Récupérer la config d'embedding
                const embeddingConfig = modelsConfig.reglages_generaux?.embeddings?.primary || {};

                const embeddings = new EmbeddingsService({
                    geminiKey,
                    openaiKey,
                    model: embeddingConfig.model || 'gemini-embedding-001',
                    dimensions: embeddingConfig.dimensions || 1024
                });

                // Charger les plugins
                await pluginLoader.loadAll();
                const tools = pluginLoader.getToolDefinitions();
                const currentToolNames = tools.map(t => t.function?.name).filter(Boolean);

                console.log(`📦 ${tools.length} outil(s) trouvé(s)\n`);

                // 1. Nettoyer les outils obsolètes (qui n'existent plus dans les plugins)
                const { data: existingTools } = await supabase
                    .from('bot_tools')
                    .select('name');

                if (existingTools?.length) {
                    const obsoleteTools = existingTools
                        .map(t => t.name)
                        .filter(name => !currentToolNames.includes(name));

                    if (obsoleteTools.length > 0) {
                        console.log(`🗑️  Suppression de ${obsoleteTools.length} outil(s) obsolète(s)...`);
                        for (const name of obsoleteTools) {
                            await supabase.from('bot_tools').delete().eq('name', name);
                            console.log(`  ✓ Supprimé: ${name}`);
                        }
                        console.log('');
                    }
                }

                // 2. Indexer les outils actuels
                let indexed = 0;
                for (const tool of tools) {
                    const toolName = tool.function?.name;
                    const description = tool.function?.description || '';

                    if (!toolName) continue;

                    // Générer l'embedding
                    const textForEmbed = `${toolName}: ${description}`;
                    const vector = await embeddings.embed(textForEmbed);

                    if (vector) {
                        // Upsert dans Supabase
                        const { error } = await supabase
                            .from('bot_tools')
                            .upsert({
                                name: toolName,
                                plugin_name: toolName.split('_')[0], // Guess plugin from prefix
                                description: description,
                                definition: tool,
                                embedding: vector,
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'name' });

                        if (error) {
                            console.log(`  ❌ ${toolName}: ${error.message}`);
                        } else {
                            console.log(`  ✓ ${toolName}`);
                            indexed++;
                        }
                    } else {
                        console.log(`  ⚠️ ${toolName}: Échec embedding`);
                    }
                }

                console.log(`\n✅ ${indexed}/${tools.length} outils indexés dans bot_tools`);
            } catch (e) {
                console.error('❌ Erreur indexation:', e.message);
            }
            break;

        // Database
        case 'db:reset-data':
            const confirmDb = args[1] === '--yes';
            if (!confirmDb) {
                console.log('⚠️ ATTENTION: Cette commande efface TOUTES les données de la base SQL!');
                console.log('   (Elle conserve uniquement les Admins Globaux et leurs comptes User)');
                console.log('   Utilisez: npm run cli db:reset-data --yes');
            } else {
                console.log('🛑 DÉMARRAGE DU NETTOYAGE DE LA BASE DE DONNÉES...');

                try {
                    // 1. Récupérer les Admins Globaux
                    const admins = await adminService.listAdmins();
                    const adminJids = admins.map(a => a.jid);
                    console.log(`👑 ${adminJids.length} Admin(s) Global(aux) identifié(s) (seront conservés).`);

                    // 2. Liste des tables à vider (ordre respectant les FK si possible, mais delete cascade peut aider)
                    // On vide tout sauf 'global_admins' et 'users' (qu'on filtre après)
                    const tablesToFlush = [
                        'agent_actions',
                        'autonomous_goals',
                        'bot_tools',
                        'relationships',     // FK vers entities
                        'entities',
                        'facts',
                        'user_warnings',     // FK vers groups, users, filters
                        'group_member_history', // FK vers groups
                        'group_whitelist',   // FK vers groups, users
                        'group_filters',     // FK vers groups
                        'group_configs',     // FK vers groups
                        'reminders',
                        'memories',
                        'groups'             // FK vers users (founder) - Safe à supprimer après les dépendances
                    ];

                    // 3. Suppression des données tables standard
                    for (const table of tablesToFlush) {
                        const { error } = await supabase
                            .from(table)
                            .delete()
                            .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack pour "tout supprimer" si id UUID/Int

                        // Pour les tables sans colonne ID (ex: group_configs, groups avec JID), on utilise une autre condition
                        // Heureusement supabase delete() sans filtre est souvent bloqué, donc on met un filtre bidon tjrs vrai
                        // Mais .neq('id'...) échoue si pas de colonne ID.

                        // Approche plus robuste par table :
                        let delQuery = supabase.from(table).delete();

                        if (['groups', 'group_configs'].includes(table)) {
                            delQuery = delQuery.neq('jid', 'contrived_value'); // Delete all where jid != '...'
                        } else if (table === 'bot_tools') {
                            delQuery = delQuery.neq('name', 'contrived_value');
                        } else if (table === 'group_whitelist') {
                            delQuery = delQuery.neq('group_jid', 'contrived_value');
                        } else {
                            // Tables avec ID (bigint ou uuid)
                            delQuery = delQuery.neq('id', 0); // Pour bigint
                            // Si c'est UUID, ça va peut-être rater sur le type ? Supabase est permissif souvent.
                            // On tente un filtre générique "not null"
                        }

                        // DELETE ALL générique souvent bloqué sans WHERE.
                        // On va itérer proprement.
                    }

                    // V2 Plus simple et brutale :
                    console.log('   - Nettoyage des tables dépendantes...');
                    await supabase.from('relationships').delete().neq('chat_id', 'x');
                    await supabase.from('entities').delete().neq('chat_id', 'x');
                    await supabase.from('agent_actions').delete().neq('id', 0);
                    await supabase.from('autonomous_goals').delete().neq('title', '');
                    await supabase.from('bot_tools').delete().neq('name', '');
                    await supabase.from('facts').delete().neq('id', 0);
                    await supabase.from('user_warnings').delete().neq('id', 0);
                    await supabase.from('group_member_history').delete().neq('id', 0);
                    await supabase.from('group_whitelist').delete().neq('group_jid', 'x');
                    await supabase.from('group_filters').delete().neq('id', 0);
                    await supabase.from('group_configs').delete().neq('group_jid', 'x');
                    await supabase.from('reminders').delete().neq('id', 0);
                    await supabase.from('memories').delete().neq('id', 0);

                    // Suppression des groups (après avoir viré les dépendances)
                    console.log('   - Suppression des Groupes...');
                    await supabase.from('groups').delete().neq('jid', 'x');

                    // 4. Nettoyage des Users (Sauf Admins)
                    console.log('   - Nettoyage des Users non-admins...');
                    if (adminJids.length > 0) {
                        // Supprime tous les users DONT le JID N'EST PAS dans la liste des admins
                        const { error: errUser, count } = await supabase
                            .from('users')
                            .delete()
                            .not('jid', 'in', `(${adminJids.map(id => `"${id}"`).join(',')})`);
                        // Note: .not('jid', 'in', array) est mieux géré par le client JS
                    } else {
                        // Aucun admin ? On vide tout alors.
                        await supabase.from('users').delete().neq('jid', 'x');
                    }

                    // Optimisation : Utilisation de la syntaxe correcte Supabase JS pour "NOT IN"
                    if (adminJids.length > 0) {
                        const { error } = await supabase
                            .from('users')
                            .delete()
                            .not('jid', 'in', `(${adminJids.join(',')})`); // Attention format

                        // Re-essai plus propre pour users
                        // On ne peut pas faire "not in" array facilement sur delete direct parfois.
                        // On va faire : delete().filter('jid', 'not.in', adminJids)
                        await supabase
                            .from('users')
                            .delete()
                            .filter('jid', 'not.in', `(${adminJids.join(',')})`);
                    }

                    console.log('✅ Base de données réinitialisée avec succès !');

                } catch (e) {
                    console.error('❌ Erreur lors du reset DB:', e);
                }
            }
            break;

        // System
        case 'status':
            const status = await logger.systemStatus({ redis, supabase, adminService });
            console.log('\n📊 État du système:');
            console.log(JSON.stringify(status, null, 2));
            break;

        // Help
        case 'help':
            logger.help();
            break;

        default:
            console.log(`❌ Commande inconnue: ${command}`);
            console.log('   Utilisez: npm run cli help');
    }

    process.exit(0);
}

main().catch(err => {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
});
