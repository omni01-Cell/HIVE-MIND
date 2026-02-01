-- audit/jsonb_validation_triggers.sql
-- ============================================================================
-- Triggers de validation JSONB - Phase 3
-- ============================================================================
-- Valide la structure des données JSONB avant insertion/mise à jour

-- ============================================================
-- VALIDATION agent_actions.params
-- ============================================================

CREATE OR REPLACE FUNCTION validate_agent_actions_params()
RETURNS TRIGGER AS $$
BEGIN
    -- Valider que params est un JSON valide
    IF NEW.params IS NULL THEN
        RAISE EXCEPTION 'params ne peut pas être NULL';
    END IF;
    
    -- Valider la structure minimale
    IF NOT (NEW.params ? 'goal') THEN
        RAISE EXCEPTION 'params doit contenir un champ "goal"';
    END IF;
    
    IF NOT (NEW.params ? 'context') THEN
        RAISE EXCEPTION 'params doit contenir un champ "context"';
    END IF;
    
    -- Valider que goal est une string non vide
    IF NEW.params->>'goal' IS NULL OR length(NEW.params->>'goal') = 0 THEN
        RAISE EXCEPTION 'params.goal ne peut pas être vide';
    END IF;
    
    -- Valider la longueur maximale (éviter les payloads trop gros)
    IF length(NEW.params::text) > 10000 THEN
        RAISE EXCEPTION 'params trop volumineux (> 10KB)';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger
DROP TRIGGER IF EXISTS validate_agent_actions_params_trigger ON public.agent_actions;
CREATE TRIGGER validate_agent_actions_params_trigger
    BEFORE INSERT OR UPDATE ON public.agent_actions
    FOR EACH ROW
    EXECUTE FUNCTION validate_agent_actions_params();

-- ============================================================
-- VALIDATION bot_tools.definition
-- ============================================================

CREATE OR REPLACE FUNCTION validate_bot_tools_definition()
RETURNS TRIGGER AS $$
BEGIN
    -- Valider que definition est un JSON valide
    IF NEW.definition IS NULL THEN
        RAISE EXCEPTION 'definition ne peut pas être NULL';
    END IF;
    
    -- Valider la structure minimale requise
    IF NOT (NEW.definition ? 'name') THEN
        RAISE EXCEPTION 'definition doit contenir un champ "name"';
    END IF;
    
    IF NOT (NEW.definition ? 'description') THEN
        RAISE EXCEPTION 'definition doit contenir un champ "description"';
    END IF;
    
    IF NOT (NEW.definition ? 'parameters') THEN
        RAISE EXCEPTION 'definition doit contenir un champ "parameters"';
    END IF;
    
    -- Valider que name est une string alphanumérique
    IF NEW.definition->>'name' !~ '^[a-zA-Z0-9_]+$' THEN
        RAISE EXCEPTION 'definition.name doit être alphanumérique (a-z, A-Z, 0-9, _)';
    END IF;
    
    -- Valider la longueur maximale
    IF length(NEW.definition::text) > 5000 THEN
        RAISE EXCEPTION 'definition trop volumineuse (> 5KB)';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger
DROP TRIGGER IF EXISTS validate_bot_tools_definition_trigger ON public.bot_tools;
CREATE TRIGGER validate_bot_tools_definition_trigger
    BEFORE INSERT OR UPDATE ON public.bot_tools
    FOR EACH ROW
    EXECUTE FUNCTION validate_bot_tools_definition();

-- ============================================================
-- VALIDATION memories.metadata
-- ============================================================

CREATE OR REPLACE FUNCTION validate_memories_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Valider que metadata est un JSON valide (peut être NULL)
    IF NEW.metadata IS NOT NULL THEN
        -- Valider la structure si présente
        IF NEW.metadata ? 'source' THEN
            -- Valider que source est une string valide
            IF NEW.metadata->>'source' NOT IN ('user', 'assistant', 'tool', 'system') THEN
                RAISE EXCEPTION 'metadata.source doit être: user, assistant, tool, ou system';
            END IF;
        END IF;
        
        -- Valider la longueur maximale
        IF length(NEW.metadata::text) > 2000 THEN
            RAISE EXCEPTION 'metadata trop volumineux (> 2KB)';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger
DROP TRIGGER IF EXISTS validate_memories_metadata_trigger ON public.memories;
CREATE TRIGGER validate_memories_metadata_trigger
    BEFORE INSERT OR UPDATE ON public.memories
    FOR EACH ROW
    EXECUTE FUNCTION validate_memories_metadata();

-- ============================================================
-- VALIDATION GENERAL JSONB
-- ============================================================

-- Fonction utilitaire pour valider tout JSONB
CREATE OR REPLACE FUNCTION validate_jsonb_structure(json_data jsonb, required_fields text[])
RETURNS boolean AS $$
BEGIN
    IF json_data IS NULL THEN
        RETURN false;
    END IF;
    
    -- Vérifier chaque champ requis
    FOR i IN 1..array_length(required_fields, 1)
    LOOP
        IF NOT (json_data ? required_fields[i]) THEN
            RETURN false;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- LOGGING ET MONITORING
-- ============================================================

-- Table pour tracker les violations
CREATE TABLE IF NOT EXISTS jsonb_validation_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name text NOT NULL,
    operation text NOT NULL, -- INSERT ou UPDATE
    error_message text NOT NULL,
    attempted_data jsonb,
    created_at timestamp DEFAULT now()
);

-- Fonction de logging des violations
CREATE OR REPLACE FUNCTION log_jsonb_violation()
RETURNS TRIGGER AS $$
BEGIN
    -- Logger l'erreur mais ne pas bloquer (pour la production)
    INSERT INTO jsonb_validation_logs (table_name, operation, error_message, attempted_data)
    VALUES (TG_TABLE_NAME, TG_OP, TG_EXCEPTION_DETAIL, NEW);
    
    -- Dans la vraie production, on pourrait envoyer une alerte ici
    RAISE WARNING 'JSONB validation failed on %: %', TG_TABLE_NAME, TG_EXCEPTION_DETAIL;
    
    -- Permettre l'insertion malgré l'erreur (mode permissif)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TESTS DE VALIDATION
-- ============================================================

-- Test 1: Valider une insertion correcte
/*
INSERT INTO agent_actions (chat_id, tool_name, params, status, created_at) VALUES
('test123', 'search_tool', '{"goal": "Test goal", "context": {"test": true}}', 'active', now());
-- ✅ Devrait réussir
*/

-- Test 2: Valider une insertion incorrecte
/*
INSERT INTO agent_actions (chat_id, tool_name, params, status, created_at) VALUES
('test123', 'search_tool', '{"invalid": "no goal field"}', 'active', now());
-- ❌ Devrait échouer avec message d'erreur
*/

-- Test 3: Vérifier les logs de violation
/*
SELECT * FROM jsonb_validation_logs ORDER BY created_at DESC LIMIT 10;
*/

-- ============================================================
-- FONCTIONS DE MAINTENANCE
-- ============================================================

-- Fonction pour obtenir les statistiques de validation
CREATE OR REPLACE FUNCTION get_validation_stats()
RETURNS TABLE(table_name text, total_checks bigint, failed_checks bigint, success_rate numeric) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        table_name,
        count(*) as total_checks,
        count(*) FILTER (WHERE error_message IS NOT NULL) as failed_checks,
        round((1.0 - count(*) FILTER (WHERE error_message IS NOT NULL)::numeric / count(*)) * 100, 2) as success_rate
    FROM jsonb_validation_logs
    GROUP BY table_name
    ORDER BY failed_checks DESC;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour nettoyer les vieux logs
CREATE OR REPLACE FUNCTION cleanup_validation_logs(days_to_keep int DEFAULT 30)
RETURNS int AS $$
DECLARE
    deleted_count int;
BEGIN
    DELETE FROM jsonb_validation_logs 
    WHERE created_at < now() - interval '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- NOTES D'UTILISATION
-- ============================================================

-- Pour désactiver temporairement un trigger:
-- ALTER TABLE agent_actions DISABLE TRIGGER validate_agent_actions_params_trigger;

-- Pour réactiver:
-- ALTER TABLE agent_actions ENABLE TRIGGER validate_agent_actions_params_trigger;

-- Pour voir tous les triggers sur une table:
-- \d agent_actions

-- Pour voir les violations récentes:
-- SELECT * FROM jsonb_validation_logs ORDER BY created_at DESC LIMIT 20;

-- Pour obtenir les statistiques:
-- SELECT * FROM get_validation_stats();

-- Pour nettoyer les vieux logs:
-- SELECT cleanup_validation_logs(7); -- Garder 7 jours