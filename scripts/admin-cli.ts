#!/usr/bin/env node
// scripts/admin-cli.js
// CLI pour exécuter les commandes admin du bot

// CRITIQUE: Charger .env AVANT tout import de service
import 'dotenv/config';

import { container } from '../core/ServiceContainer.js';
import * as logger from '../utils/logger.js';
import { StateManager } from '../services/state/StateManager.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    console.log('\n🤖 Bot Admin CLI\n');

    if (!command) {
        logger.help();
        process.exit(0);
    }

    // Initialisation via ServiceContainer
    await container.init({ mode: 'cli' });

    const redis = container.get('redis');
    const adminService = container.get('adminService');
    const supabase = container.get('supabase');

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
                const embeddings = container.get('embeddings');

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

                    // 2. Charger la liste des tables depuis config/db-reset-tables.json
                    const { readFileSync } = await import('fs');
                    const { join, dirname } = await import('path');
                    const { fileURLToPath } = await import('url');
                    const __dirname3 = dirname(fileURLToPath(import.meta.url));

                    let tablesToFlush = [];
                    try {
                        const tablesConfigPath = join(__dirname3, '..', 'config', 'db-reset-tables.json');
                        tablesToFlush = JSON.parse(readFileSync(tablesConfigPath, 'utf-8'));
                    } catch (e) {
                        console.error('❌ Impossible de charger config/db-reset-tables.json, fallback statique.');
                        tablesToFlush = ['memories', 'facts', 'groups']; // Min fallback
                    }

                    console.log(`   - Nettoyage de ${tablesToFlush.length} tables...`);

                    // 3. Suppression des données tables standard
                    for (const table of tablesToFlush) {
                        console.log(`     🗑️ Vidage de ${table}...`);

                        // Stratégie de suppression selon la table
                        let query = supabase.from(table).delete();

                        const PROTECTED_TABLES = [
                            'users', 'groups', 'global_admins', 'group_admins',
                            'group_configs', 'autonomous_goals', 'agent_actions'
                        ];

                        if (PROTECTED_TABLES.includes(table)) {
                            query = query.neq('jid', 'x_not_found_x');
                        } else if (table === 'bot_tools') {
                            query = query.neq('name', 'x_not_found_x');
                        } else if (table === 'group_whitelist' || table === 'group_admins') {
                            query = query.neq('group_jid', 'x_not_found_x');
                        } else if (table === 'autonomous_goals') {
                            query = query.neq('title', 'x_not_found_x');
                        } else {
                            // Tables avec ID numeric ou UUID
                            query = query.neq('id', '00000000-0000-0000-0000-000000000000');
                        }

                        const { error } = await query;
                        if (error) {
                            if (error.message.includes('does not exist')) {
                                console.warn(`     ⚠️ Table ${table} inexistante, ignoré.`);
                            } else {
                                console.error(`     ❌ Erreur sur ${table}: ${error.message}`);
                            }
                        }
                    }

                    // 4. Nettoyage des Users (Sauf Admins)
                    console.log('   - Nettoyage des Users non-admins...');
                    if (adminJids.length > 0) {
                        const { error } = await supabase
                            .from('users')
                            .delete()
                            .filter('jid', 'not.in', `(${adminJids.join(',')})`);

                        if (error) console.error('❌ Erreur nettoyage users:', error.message);
                    } else {
                        await supabase.from('users').delete().neq('jid', 'x');
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
