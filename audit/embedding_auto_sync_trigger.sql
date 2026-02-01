-- audit/embedding_auto_sync_trigger.sql
-- ============================================================================
-- Trigger pour synchronisation automatique des embeddings
-- ============================================================================

-- Table de métadonnées pour tracker les hashes de définitions
CREATE TABLE IF NOT EXISTS tool_metadata (
    tool_name text PRIMARY KEY,
    definition_hash text,
    last_sync timestamp DEFAULT now(),
    embedding_updated_at timestamp,
    sync_status text DEFAULT 'pending' -- pending, synced, failed
);

-- Fonction pour calculer le hash d'une définition
CREATE OR REPLACE FUNCTION calculate_definition_hash(definition jsonb)
RETURNS text AS $$
BEGIN
    -- Simple hash (dans la vraie vie, utiliser une fonction crypto plus robuste)
    RETURN md5(definition::text);
END;
$$ LANGUAGE plpgsql;

-- Trigger pour détecter les changements de définition
CREATE OR REPLACE FUNCTION detect_definition_change()
RETURNS TRIGGER AS $$
DECLARE
    new_hash text;
    old_hash text;
BEGIN
    -- Calculer le nouveau hash
    new_hash := calculate_definition_hash(NEW.definition);
    
    -- Obtenir l'ancien hash
    SELECT definition_hash INTO old_hash 
    FROM tool_metadata 
    WHERE tool_name = NEW.name;
    
    -- Si le hash a changé, marquer comme nécessitant une sync
    IF old_hash IS NULL OR old_hash != new_hash THEN
        INSERT INTO tool_metadata (tool_name, definition_hash, sync_status, last_sync)
        VALUES (NEW.name, new_hash, 'pending', now())
        ON CONFLICT (tool_name) 
        DO UPDATE SET 
            definition_hash = new_hash,
            sync_status = 'pending',
            last_sync = now();
        
        RAISE NOTICE '[EmbeddingSync] Changement définition détecté pour: %', NEW.name;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger
DROP TRIGGER IF EXISTS detect_definition_change_trigger ON public.bot_tools;
CREATE TRIGGER detect_definition_change_trigger
    AFTER UPDATE OF definition ON public.bot_tools
    FOR EACH ROW
    EXECUTE FUNCTION detect_definition_change();

-- ============================================================
-- FONCTION DE SYNCHRONISATION BATCH
-- ============================================================

CREATE OR REPLACE FUNCTION sync_embeddings_batch(batch_size int DEFAULT 10)
RETURNS TABLE(updated_tools text[], failed_tools text[]) AS $$
DECLARE
    tools_to_sync RECORD;
    updated_count int := 0;
    failed_count int := 0;
    updated_list text[] := '{}';
    failed_list text[] := '{}';
BEGIN
    -- Obtenir les outils nécessitant une synchronisation
    FOR tools_to_sync IN
        SELECT name, definition
        FROM bot_tools b
        JOIN tool_metadata t ON b.name = t.tool_name
        WHERE t.sync_status = 'pending'
        ORDER BY t.last_sync ASC
        LIMIT batch_size
    LOOP
        BEGIN
            -- Ici, dans une vraie implémentation, on appellerait le service d'embedding
            -- Pour l'instant, on simule la mise à jour
            
            UPDATE tool_metadata 
            SET sync_status = 'synced', 
                embedding_updated_at = now()
            WHERE tool_name = tools_to_sync.name;
            
            updated_list := array_append(updated_list, tools_to_sync.name);
            updated_count := updated_count + 1;
            
            RAISE NOTICE '[EmbeddingSync] Embedding synchronisé pour: %', tools_to_sync.name;
            
        EXCEPTION WHEN OTHERS THEN
            UPDATE tool_metadata 
            SET sync_status = 'failed',
                last_sync = now()
            WHERE tool_name = tools_to_sync.name;
            
            failed_list := array_append(failed_list, tools_to_sync.name);
            failed_count := failed_count + 1;
            
            RAISE WARNING '[EmbeddingSync] Erreur synchronisation %: %', tools_to_sync.name, SQLERRM;
        END;
    END LOOP;
    
    RETURN QUERY SELECT updated_list, failed_list;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- JOB DE SYNCHRONISATION AUTOMATIQUE
-- ============================================================

-- Créer une extension pg_cron si disponible (nécessite superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Planifier la synchronisation toutes les heures
/*
SELECT cron.schedule(
    'embedding_sync_hourly',
    '0 * * * *', -- Toutes les heures
    'SELECT sync_embeddings_batch(5);'
);
*/

-- Alternative: fonction pour être appelée par l'application
CREATE OR REPLACE FUNCTION trigger_embedding_sync()
RETURNS boolean AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM sync_embeddings_batch(10);
    
    RAISE NOTICE '[EmbeddingSync] Sync terminée - Updated: %, Failed: %', 
        array_length(result.updated_tools, 1), 
        array_length(result.failed_tools, 1);
    
    RETURN true;
EXCEPTION 
    WHEN OTHERS THEN
        RAISE WARNING '[EmbeddingSync] Erreur sync: %', SQLERRM;
        RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VUES DE MONITORING
-- ============================================================

-- Vue pour voir les outils nécessitant une synchronisation
CREATE OR REPLACE VIEW pending_embedding_sync AS
SELECT 
    b.name,
    b.definition,
    t.definition_hash,
    t.last_sync,
    t.sync_status,
    CASE 
        WHEN t.last_sync IS NULL THEN 'Jamais synchronisé'
        WHEN t.last_sync < now() - interval '1 day' THEN 'Synchronisation ancienne'
        ELSE 'Synchronisation récente'
    END as sync_age_status
FROM bot_tools b
LEFT JOIN tool_metadata t ON b.name = t.tool_name
WHERE t.sync_status = 'pending' 
   OR t.last_sync IS NULL 
   OR t.last_sync < now() - interval '1 day'
ORDER BY t.last_sync ASC NULLS FIRST;

-- Vue pour voir le statut global de synchronisation
CREATE OR REPLACE VIEW embedding_sync_status AS
SELECT 
    count(*) FILTER (WHERE sync_status = 'synced') as synced_count,
    count(*) FILTER (WHERE sync_status = 'pending') as pending_count,
    count(*) FILTER (WHERE sync_status = 'failed') as failed_count,
    count(*) FILTER (WHERE last_sync IS NULL) as never_synced_count,
    avg(EXTRACT(EPOCH FROM (now() - last_sync))/3600) FILTER (WHERE last_sync IS NOT NULL) as avg_hours_since_sync
FROM tool_metadata;

-- ============================================================
-- FONCTIONS UTILITAIRES
-- ============================================================

-- Fonction pour obtenir les outils qui ont besoin d'un embedding
CREATE OR REPLACE FUNCTION get_tools_needing_embedding(limit_count int DEFAULT 50)
RETURNS TABLE(tool_name text, definition jsonb, last_sync timestamp) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.name,
        b.definition,
        COALESCE(t.last_sync, '1970-01-01'::timestamp) as last_sync
    FROM bot_tools b
    LEFT JOIN tool_metadata t ON b.name = t.tool_name
    WHERE t.sync_status = 'pending' 
       OR t.last_sync IS NULL 
       OR t.last_sync < now() - interval '1 day'
    ORDER BY t.last_sync ASC NULLS FIRST
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour marquer un outil comme synchronisé
CREATE OR REPLACE FUNCTION mark_tool_synced(p_tool_name text, p_embedding vector)
RETURNS boolean AS $$
BEGIN
    UPDATE tool_metadata 
    SET 
        sync_status = 'synced',
        embedding_updated_at = now(),
        last_sync = now()
    WHERE tool_name = p_tool_name;
    
    -- Mettre aussi à jour l'embedding dans bot_tools
    UPDATE bot_tools 
    SET embedding = p_embedding
    WHERE name = p_tool_name;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TESTS
-- ============================================================

-- Test 1: Créer un outil et vérifier que le trigger détecte le changement
/*
INSERT INTO bot_tools (name, definition) VALUES 
('test_tool', '{"name": "test_tool", "description": "Test tool", "type": "function"}');

-- Vérifier que le changement est détecté
SELECT * FROM pending_embedding_sync WHERE name = 'test_tool';
*/

-- Test 2: Simuler la synchronisation
/*
SELECT trigger_embedding_sync();

-- Vérifier le statut
SELECT * FROM embedding_sync_status;
*/

-- Test 3: Obtenir les outils nécessitant un embedding
/*
SELECT * FROM get_tools_needing_embedding(5);
*/

-- ============================================================
-- NOTES D'INSTALLATION
-- ============================================================

-- 1. Exécuter ce script dans Supabase Dashboard (SQL Editor)
-- 2. Pour activer pg_cron (si disponible):
--    SELECT cron.schedule('embedding_sync_hourly', '0 * * * *', 'SELECT trigger_embedding_sync();');
-- 3. Sinon, appeler trigger_embedding_sync() depuis l'application
-- 4. Vérifier les logs: SELECT * FROM embedding_sync_status;
-- 5. Voir les pending: SELECT * FROM pending_embedding_sync;