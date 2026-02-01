// audit/apply_db_corrections.js
// ============================================================================
// Script d'application des corrections de base de données - Phase 2
// ============================================================================
// Ce script applique les corrections SQL de manière sécurisée

import { supabase } from '../services/supabase.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Applique les corrections de base de données de la Phase 2
 */
export async function applyDBCorrections() {
    console.log('🚀 Application des corrections de base de données - Phase 2');
    
    const corrections = [
        {
            name: 'Index Composite Memories',
            sql: `
                CREATE INDEX IF NOT EXISTS idx_memories_chat_created 
                ON public.memories(chat_id, created_at DESC)
                WHERE archived_at IS NULL;
            `,
            description: 'Optimisation des requêtes RAG avec filtre chat + tri chronologique'
        },
        {
            name: 'Constraint UNIQUE Facts',
            sql: `
                -- Supprimer les doublons existants (garder le plus récent)
                DELETE FROM public.facts a
                USING public.facts b
                WHERE a.chat_id = b.chat_id 
                  AND a.key = b.key 
                  AND a.created_at < b.created_at;

                -- Ajouter la contrainte UNIQUE
                ALTER TABLE public.facts 
                ADD CONSTRAINT IF NOT EXISTS facts_chat_key_unique 
                UNIQUE (chat_id, key);
            `,
            description: 'Empêche les duplications de faits par (chat_id, key)'
        },
        {
            name: 'Fonction Cleanup',
            sql: `
                CREATE OR REPLACE FUNCTION cleanup_old_data()
                RETURNS void AS $$
                BEGIN
                    -- 1. Supprimer memories archivées > 90 jours
                    DELETE FROM public.memories
                    WHERE archived_at IS NOT NULL
                    AND archived_at < now() - interval '90 days';

                    -- 2. Supprimer agent_actions terminées > 60 jours
                    DELETE FROM public.agent_actions
                    WHERE status IN ('completed', 'interrupted')
                    AND created_at < now() - interval '60 days';

                    -- 3. Supprimer action_scores > 1 an
                    DELETE FROM public.action_scores
                    WHERE created_at < now() - interval '365 days';

                    -- 4. Supprimer user_warnings > 2 ans
                    DELETE FROM public.user_warnings
                    WHERE created_at < now() - interval '730 days';

                    -- Log du cleanup
                    RAISE NOTICE '[Cleanup] Nettoyage terminé: %', now();
                EXCEPTION 
                    WHEN OTHERS THEN
                        RAISE WARNING '[Cleanup] Erreur lors du nettoyage: %', SQLERRM;
                END;
                $$ LANGUAGE plpgsql;
            `,
            description: 'Fonction de nettoyage automatique des anciennes données'
        },
        {
            name: 'Vue Monitoring Table Sizes',
            sql: `
                CREATE OR REPLACE VIEW table_sizes AS
                SELECT 
                    schemaname,
                    tablename,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
                    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
            `,
            description: 'Vue pour surveiller la taille des tables'
        }
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const correction of corrections) {
        try {
            console.log(`\n📋 Application: ${correction.name}`);
            console.log(`   Description: ${correction.description}`);
            
            const { error } = await supabase.rpc('exec_sql', {
                sql: correction.sql.trim()
            });

            if (error) {
                console.error(`   ❌ Erreur: ${error.message}`);
                errorCount++;
            } else {
                console.log(`   ✅ Appliqué avec succès`);
                successCount++;
            }

        } catch (err) {
            console.error(`   ❌ Exception: ${err.message}`);
            errorCount++;
        }
    }

    // Vérifications post-application
    console.log('\n🔍 Vérifications post-application:');
    
    try {
        // Vérifier les indexes
        const { data: indexes } = await supabase.rpc('exec_sql', {
            sql: `
                SELECT schemaname, tablename, indexname, indexdef
                FROM pg_indexes 
                WHERE tablename IN ('memories', 'facts')
                AND (indexname LIKE '%chat_created%' OR indexname LIKE '%chat_key_unique%')
            `
        });
        
        if (indexes) {
            console.log('✅ Indexes créés:');
            indexes.forEach(idx => console.log(`   - ${idx.indexname} sur ${idx.tablename}`));
        }

        // Vérifier la taille des tables
        const { data: sizes } = await supabase.rpc('exec_sql', {
            sql: 'SELECT * FROM table_sizes;'
        });
        
        if (sizes) {
            console.log('\n📊 Tailles des tables:');
            sizes.slice(0, 5).forEach(table => {
                console.log(`   - ${table.tablename}: ${table.size}`);
            });
        }

    } catch (verifyErr) {
        console.warn('⚠️ Erreur lors des vérifications:', verifyErr.message);
    }

    // Statistiques finales
    console.log('\n📈 Résultat final:');
    console.log(`   ✅ Corrections appliquées: ${successCount}`);
    console.log(`   ❌ Erreurs: ${errorCount}`);
    console.log(`   📊 Taux de succès: ${Math.round((successCount / corrections.length) * 100)}%`);

    if (errorCount === 0) {
        console.log('\n🎉 Toutes les corrections de base de données ont été appliquées avec succès!');
        
        // Proposer d'exécuter le cleanup immédiatement
        console.log('\n💡 Vous pouvez maintenant:');
        console.log('   1. Exécuter le cleanup: CALL cleanup_old_data();');
        console.log('   2. Planifier le cleanup automatique via pg_cron');
        console.log('   3. Monitorer avec: SELECT * FROM table_sizes;');
        
        return { success: true, message: 'Corrections appliquées avec succès' };
    } else {
        console.log('\n⚠️ Certaines corrections ont échoué. Vérifiez les logs ci-dessus.');
        return { success: false, message: `${errorCount} corrections ont échoué` };
    }
}

/**
 * Fonction utilitaire pour exécuter du SQL brut
 * Nécessite que la fonction exec_sql soit créée dans Supabase
 */
export async function execSQL(sql) {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
        console.error('❌ Erreur SQL:', error.message);
        return { success: false, error: error.message };
    }
    
    return { success: true, data };
}

/**
 * Exécuter le nettoyage des données
 */
export async function runCleanup() {
    try {
        console.log('🧹 Exécution du nettoyage des données...');
        
        const { data, error } = await supabase.rpc('cleanup_old_data');
        
        if (error) {
            console.error('❌ Erreur cleanup:', error.message);
            return false;
        }
        
        console.log('✅ Nettoyage terminé avec succès');
        return true;
        
    } catch (err) {
        console.error('❌ Exception cleanup:', err.message);
        return false;
    }
}

// Si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🚀 Script de corrections de base de données - Phase 2');
    console.log('⚠️  Assurez-vous que la fonction exec_sql est créée dans Supabase');
    
    applyDBCorrections().then(result => {
        console.log('\n🏁 Script terminé:', result.message);
        process.exit(result.success ? 0 : 1);
    });
}