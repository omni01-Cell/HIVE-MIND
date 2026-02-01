-- Fonction exec_sql pour permettre l'exécution de SQL dynamique
-- ⚠️ À exécuter MANUELLEMENT dans le dashboard Supabase (SQL Editor)
-- Cette fonction permet à l'application d'exécuter du SQL brut

CREATE OR REPLACE FUNCTION exec_sql(sql_text text)
RETURNS TABLE(result text) 
LANGUAGE plpgsql
AS $$
BEGIN
    -- Sécurité: limiter les opérations autorisées
    IF sql_text ILIKE '%DROP%DATABASE%' OR 
       sql_text ILIKE '%DROP%TABLE%' OR 
       sql_text ILIKE '%DELETE%FROM%pg_%' OR
       sql_text ILIKE '%TRUNCATE%' THEN
        RAISE EXCEPTION 'Opération non autorisée pour des raisons de sécurité';
    END IF;
    
    -- Exécuter le SQL et retourner les résultats
    RETURN QUERY EXECUTE sql_text;
    
EXCEPTION 
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Erreur SQL: %', SQLERRM;
END;
$$;

-- Alternative plus sécurisée avec restrictions
CREATE OR REPLACE FUNCTION exec_sql_safe(sql_text text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    result_text text;
BEGIN
    -- Vérifications de sécurité
    IF sql_text ILIKE '%DROP%' OR 
       sql_text ILIKE '%ALTER%TABLE%DROP%' OR 
       sql_text ILIKE '%TRUNCATE%' OR
       sql_text ILIKE '%DELETE%FROM%' THEN
        RETURN '❌ Opération non autorisée';
    END IF;
    
    -- Autoriser seulement SELECT, INSERT, UPDATE, CREATE, ALTER (add/modify)
    IF NOT (sql_text ~* '^\s*(SELECT|INSERT|UPDATE|CREATE|ALTER|DROP\s+INDEX|CREATE\s+INDEX)' OR 
            sql_text ~* '^\s*--' OR 
            sql_text ~* '^\s*$') THEN
        RETURN '❌ Type de requête non autorisé';
    END IF;
    
    -- Pour les requêtes qui ne retournent pas de données
    IF sql_text ~* '^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)' THEN
        EXECUTE sql_text;
        RETURN '✅ Requête exécutée avec succès';
    END IF;
    
    -- Pour les requêtes SELECT qui retournent des données
    EXECUTE 'SELECT json_agg(row_to_json(t))::text FROM (' || sql_text || ') t' INTO result_text;
    RETURN result_text;
    
EXCEPTION 
    WHEN OTHERS THEN
        RETURN '❌ Erreur: ' || SQLERRM;
END;
$$;

-- Donner les permissions nécessaires
GRANT EXECUTE ON FUNCTION exec_sql TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql_safe TO authenticated;

-- Test de la fonction
-- SELECT exec_sql('SELECT * FROM table_sizes LIMIT 5');
-- SELECT exec_sql_safe('SELECT * FROM table_sizes LIMIT 5');