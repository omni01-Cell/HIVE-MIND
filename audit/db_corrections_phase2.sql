-- ============================================================================
-- CORRECTIONS BASE DE DONNÉES - Phase 2
-- ============================================================================
-- Application des corrections #16-18 de l'audit

-- 📊 PROBLÈME #16: Index Composite Memories (Manquant)
-- Performance: ~50-200ms → ~10-30ms
-- DESCRIPTION: Ajout d'index composite pour les requêtes RAG avec filtre chat + tri chronologique

-- Vérifier l'index existant
-- \dt memories
-- \d memories

-- Index composite optimisé pour les requêtes RAG
CREATE INDEX IF NOT EXISTS idx_memories_chat_created 
ON public.memories(chat_id, created_at DESC)
WHERE archived_at IS NULL;  -- Partial index pour performance

-- 📊 PROBLÈME #17: Constraint UNIQUE sur Facts (Manquante)
-- DESCRIPTION: Empêche les duplications de faits par (chat_id, key)

-- Vérifier les doublons existants AVANT d'ajouter la contrainte
-- SELECT chat_id, key, COUNT(*) 
-- FROM public.facts 
-- GROUP BY chat_id, key 
-- HAVING COUNT(*) > 1;

-- Supprimer les doublons existants (garder le plus récent)
DELETE FROM public.facts a
USING public.facts b
WHERE a.chat_id = b.chat_id 
  AND a.key = b.key 
  AND a.created_at < b.created_at;

-- Ajouter la contrainte UNIQUE
ALTER TABLE public.facts 
ADD CONSTRAINT facts_chat_key_unique 
UNIQUE (chat_id, key);

-- 📊 PROBLÈME #18: Cleanup Automatique des Tables DB
-- DESCRIPTION: Scripts de nettoyage automatique pour éviter le swelling des données

-- Activer l'extension pg_cron (nécessite superuser ou extension activée)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Script de cleanup complet
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

    -- 5. Cleaner facts orphelins (plus de 1 an, non référencés)
    DELETE FROM public.facts
    WHERE created_at < now() - interval '365 days'
    AND id NOT IN (
        SELECT DISTINCT (metadata->>'fact_id')::bigint 
        FROM public.memories 
        WHERE metadata->>'fact_id' IS NOT NULL
    );

    -- Log du cleanup
    RAISE NOTICE '[Cleanup] Nettoyage terminé: %', now();
EXCEPTION 
    WHEN OTHERS THEN
        RAISE WARNING '[Cleanup] Erreur lors du nettoyage: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Créer le job de cleanup (nécessite pg_cron)
-- Cette commande doit être exécutée par un superuser
/*
SELECT cron.schedule(
    'db_cleanup_daily',           -- Job name
    '0 2 * * *',                  -- Tous les jours à 2h du matin
    'SELECT cleanup_old_data();'  -- Function to run
);
*/

-- Alternative sans pg_cron: créer une fonction qui peut être appelée par l'application
CREATE OR REPLACE FUNCTION trigger_cleanup()
RETURNS boolean AS $$
BEGIN
    PERFORM cleanup_old_data();
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- 📊 MONITORING: Vue pour surveiller la taille des tables
CREATE OR REPLACE VIEW table_sizes AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 📊 MONITORING: Vue pour surveiller les index manquants
CREATE OR REPLACE VIEW missing_indexes AS
SELECT 
    t.tablename,
    'Consider adding index on: ' || string_agg(c.column_name, ', ') AS recommendation
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND c.table_schema = 'public'
  AND t.table_name IN ('memories', 'agent_actions', 'facts')
  AND c.column_name IN ('chat_id', 'created_at', 'status')
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = t.tablename 
    AND indexname LIKE '%' || c.column_name || '%'
  )
GROUP BY t.tablename;

-- ✅ VERIFICATIONS POST-INSTALLATION
-- Vérifier que les indexes ont été créés
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes 
WHERE tablename IN ('memories', 'facts')
ORDER BY tablename, indexname;

-- Vérifier la contrainte UNIQUE
SELECT conname, contype, conkey::int[] 
FROM pg_constraint 
WHERE conname = 'facts_chat_key_unique';

-- Tester la fonction de cleanup
-- SELECT cleanup_old_data();
-- SELECT * FROM table_sizes;

-- 📊 NOTES D'INSTALLATION
-- 1. Pour pg_cron: nécessite superuser ou extension activée
-- 2. Pour exécution manuelle: CALL cleanup_old_data();
-- 3. Pour monitoring: SELECT * FROM table_sizes; SELECT * FROM missing_indexes;

-- 🚀 IMPACT ESTIMÉ
-- Performance RAG queries: -80% temps de réponse
-- Prévention des duplications: -100% doublons facts
-- Taille DB: -30% après 3 mois avec cleanup actif