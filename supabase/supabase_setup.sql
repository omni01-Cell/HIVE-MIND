-- =============================================================================
-- HIVE-MIND - Script de Configuration Supabase
-- =============================================================================
-- Version: 2.0.0
-- Date: 2026-01-23
-- 
-- SCRIPT IDEMPOTENT: Peut être exécuté plusieurs fois sans erreur.
-- Crée la structure complète de la base de données depuis zéro.
--
-- USAGE:
--   1. Connectez-vous à votre projet Supabase
--   2. Ouvrez l'éditeur SQL
--   3. Collez et exécutez ce script entier
--
-- PRÉREQUIS:
--   - Extension pgvector activée (pour les embeddings)
-- =============================================================================

-- ============================================================================
-- SECTION 0: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- SECTION 1: TABLES FONDAMENTALES (Users, Groups)
-- ============================================================================

-- Table des utilisateurs WhatsApp
CREATE TABLE IF NOT EXISTS public.users (
    jid text NOT NULL,
    lid text UNIQUE,                                    -- LID WhatsApp (nouveau format)
    username text,
    interaction_count bigint DEFAULT 0,
    hash character varying,                             -- Hash pour déduplication
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (jid)
);

COMMENT ON TABLE public.users IS 'Utilisateurs WhatsApp avec mapping JID/LID';
COMMENT ON COLUMN public.users.lid IS 'Link ID WhatsApp - nouveau format d''identifiant';

-- Table des groupes WhatsApp
CREATE TABLE IF NOT EXISTS public.groups (
    jid text NOT NULL,
    name text,
    description text,
    bot_mission text,                                   -- Mission personnalisée du bot
    founder_jid text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT groups_pkey PRIMARY KEY (jid),
    CONSTRAINT groups_founder_jid_fkey FOREIGN KEY (founder_jid) REFERENCES public.users(jid) ON DELETE SET NULL
);

COMMENT ON TABLE public.groups IS 'Groupes WhatsApp avec leur configuration';

-- ============================================================================
-- SECTION 2: ADMINISTRATION & MODÉRATION
-- ============================================================================

-- Admins globaux du bot (SuperUsers)
CREATE TABLE IF NOT EXISTS public.global_admins (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    jid text,
    role text CHECK (role IN ('owner', 'moderator')),
    name text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT global_admins_pkey PRIMARY KEY (id),
    CONSTRAINT global_admins_jid_fkey FOREIGN KEY (jid) REFERENCES public.users(jid) ON DELETE CASCADE
);

COMMENT ON TABLE public.global_admins IS 'Administrateurs globaux du bot (SuperUsers)';

-- Admins par groupe (sync depuis WhatsApp)
CREATE TABLE IF NOT EXISTS public.group_admins (
    group_jid text NOT NULL,
    user_jid text NOT NULL,
    role text DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    promoted_at timestamptz DEFAULT now(),
    promoted_by text,
    CONSTRAINT group_admins_pkey PRIMARY KEY (group_jid, user_jid),
    CONSTRAINT group_admins_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid) ON DELETE CASCADE,
    CONSTRAINT group_admins_user_jid_fkey FOREIGN KEY (user_jid) REFERENCES public.users(jid) ON DELETE CASCADE
);

COMMENT ON TABLE public.group_admins IS 'Admins WhatsApp par groupe - synchronisés depuis le cache Redis';

CREATE INDEX IF NOT EXISTS idx_group_admins_user_jid ON public.group_admins(user_jid);

-- Configuration par groupe
CREATE TABLE IF NOT EXISTS public.group_configs (
    group_jid text NOT NULL,
    welcome_message text,
    is_filtering_active boolean DEFAULT false,
    warning_limit integer DEFAULT 3,
    auto_ban boolean DEFAULT false,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT group_configs_pkey PRIMARY KEY (group_jid),
    CONSTRAINT group_configs_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid) ON DELETE CASCADE
);

COMMENT ON TABLE public.group_configs IS 'Configuration de modération par groupe';

-- Filtres de mots-clés par groupe
CREATE TABLE IF NOT EXISTS public.group_filters (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    group_jid text,
    keyword text NOT NULL,
    regex_variants jsonb DEFAULT '[]'::jsonb,
    context_rule text,
    severity text CHECK (severity IN ('warn', 'kick', 'ban', 'mute')),
    created_by text,
    CONSTRAINT group_filters_pkey PRIMARY KEY (id),
    CONSTRAINT group_filters_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid) ON DELETE CASCADE
);

COMMENT ON TABLE public.group_filters IS 'Filtres de contenu par groupe';

-- Historique des actions de modération
CREATE TABLE IF NOT EXISTS public.group_member_history (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    group_jid text,
    user_jid text,
    action text CHECK (action IN ('add', 'remove', 'promote', 'demote')),
    created_at timestamptz DEFAULT now(),
    CONSTRAINT group_member_history_pkey PRIMARY KEY (id),
    CONSTRAINT group_member_history_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid) ON DELETE CASCADE
);

COMMENT ON TABLE public.group_member_history IS 'Historique des changements de membres';

-- Whitelist par groupe
CREATE TABLE IF NOT EXISTS public.group_whitelist (
    group_jid text NOT NULL,
    user_jid text NOT NULL,
    added_by text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT group_whitelist_pkey PRIMARY KEY (group_jid, user_jid),
    CONSTRAINT group_whitelist_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid) ON DELETE CASCADE,
    CONSTRAINT group_whitelist_user_jid_fkey FOREIGN KEY (user_jid) REFERENCES public.users(jid) ON DELETE CASCADE
);

COMMENT ON TABLE public.group_whitelist IS 'Utilisateurs exemptés des règles de modération';

-- Avertissements utilisateurs
CREATE TABLE IF NOT EXISTS public.user_warnings (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    group_jid text,
    user_jid text,
    reason text,
    filter_id bigint,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT user_warnings_pkey PRIMARY KEY (id),
    CONSTRAINT user_warnings_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid) ON DELETE CASCADE,
    CONSTRAINT user_warnings_user_jid_fkey FOREIGN KEY (user_jid) REFERENCES public.users(jid) ON DELETE CASCADE,
    CONSTRAINT user_warnings_filter_id_fkey FOREIGN KEY (filter_id) REFERENCES public.group_filters(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.user_warnings IS 'Avertissements de modération par utilisateur';

-- ============================================================================
-- SECTION 3: MÉMOIRE & CONNAISSANCES
-- ============================================================================

-- Mémoires conversationnelles avec embeddings
CREATE TABLE IF NOT EXISTS public.memories (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    chat_id text NOT NULL,
    content text NOT NULL,
    role text CHECK (role IN ('user', 'assistant', 'system')),
    embedding vector(1024),                             -- Embedding 1024 dimensions
    decay_score numeric DEFAULT 0.5,                    -- Score de décroissance mémoire
    recall_count integer DEFAULT 0,                     -- Nombre de fois rappelée
    archived_at timestamptz,                            -- Date d'archivage
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT memories_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.memories IS 'Mémoires conversationnelles avec decay et recall';

CREATE INDEX IF NOT EXISTS idx_memories_chat_id ON public.memories(chat_id);
CREATE INDEX IF NOT EXISTS idx_memories_decay_score ON public.memories(decay_score) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memories_archived ON public.memories(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_recall_count ON public.memories(recall_count);

-- Facts (Données structurées)
CREATE TABLE IF NOT EXISTS public.facts (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    chat_id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT facts_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.facts IS 'Faits extraits des conversations (key-value)';

CREATE INDEX IF NOT EXISTS idx_facts_chat_id ON public.facts(chat_id);

-- Knowledge Graph: Entités
CREATE TABLE IF NOT EXISTS public.entities (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    chat_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding vector(1024),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT entities_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.entities IS 'Entités du knowledge graph (personnes, lieux, concepts)';

CREATE INDEX IF NOT EXISTS idx_entities_chat_id ON public.entities(chat_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON public.entities(type);

-- Knowledge Graph: Relations
CREATE TABLE IF NOT EXISTS public.relationships (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    chat_id text NOT NULL,
    source_id uuid,
    target_id uuid,
    relation_type text NOT NULL,
    strength double precision DEFAULT 1.0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT relationships_pkey PRIMARY KEY (id),
    CONSTRAINT relationships_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.entities(id) ON DELETE CASCADE,
    CONSTRAINT relationships_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.entities(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.relationships IS 'Relations entre entités du knowledge graph';

-- ============================================================================
-- SECTION 4: OUTILS & ACTIONS AGENTIQUES
-- ============================================================================

-- Catalogue des outils du bot
CREATE TABLE IF NOT EXISTS public.bot_tools (
    name text NOT NULL,
    plugin_name text NOT NULL,
    description text NOT NULL,
    definition jsonb NOT NULL,
    embedding vector(1024),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT bot_tools_pkey PRIMARY KEY (name)
);

COMMENT ON TABLE public.bot_tools IS 'Catalogue des outils avec embeddings pour RAG';

-- Actions exécutées par l'agent
CREATE TABLE IF NOT EXISTS public.agent_actions (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    chat_id text NOT NULL,
    tool_name text NOT NULL,
    params jsonb,
    result jsonb,
    status text CHECK (status IN ('active', 'success', 'error', 'interrupted', 'completed')),
    error_message text,
    steps jsonb DEFAULT '[]'::jsonb,                    -- Étapes du planner
    created_at timestamptz DEFAULT now(),
    CONSTRAINT agent_actions_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.agent_actions IS 'Historique des actions de l''agent';
COMMENT ON COLUMN public.agent_actions.steps IS 'Étapes validées par le Planner pour reprise après crash';

CREATE INDEX IF NOT EXISTS idx_agent_actions_chat_id ON public.agent_actions(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_status ON public.agent_actions(status);

-- Scores de performance des outils
CREATE TABLE IF NOT EXISTS public.action_scores (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    action_id bigint,
    tool character varying NOT NULL,
    success boolean NOT NULL,
    execution_time_ms integer,
    result_quality numeric DEFAULT 0.5,
    user_feedback character varying,
    detected_reaction text,
    final_score numeric NOT NULL,
    learned text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT action_scores_pkey PRIMARY KEY (id),
    CONSTRAINT action_scores_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.agent_actions(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.action_scores IS 'Métriques de performance pour amélioration continue';

CREATE INDEX IF NOT EXISTS idx_action_scores_tool ON public.action_scores(tool);
CREATE INDEX IF NOT EXISTS idx_action_scores_score ON public.action_scores(final_score);
CREATE INDEX IF NOT EXISTS idx_action_scores_created ON public.action_scores(created_at DESC);

-- ============================================================================
-- SECTION 5: AUTOMATISATION & GOALS
-- ============================================================================

-- Objectifs autonomes
CREATE TABLE IF NOT EXISTS public.autonomous_goals (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    target_chat_id text,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending',
    priority integer DEFAULT 5,
    execute_at timestamptz,
    result text,
    origin text,
    trigger_type text DEFAULT 'TIME' CHECK (trigger_type IN ('TIME', 'EVENT')),
    trigger_event text,                                 -- 'WAIT_FOR_MESSAGE', 'WAIT_FOR_JOIN'
    trigger_condition jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT autonomous_goals_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.autonomous_goals IS 'Objectifs autonomes avec déclencheurs temporels ou événementiels';

CREATE INDEX IF NOT EXISTS idx_autonomous_goals_status ON public.autonomous_goals(status);
CREATE INDEX IF NOT EXISTS idx_autonomous_goals_execute_at ON public.autonomous_goals(execute_at) WHERE status = 'pending';

-- Rappels
CREATE TABLE IF NOT EXISTS public.reminders (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    chat_id text NOT NULL,
    message text NOT NULL,
    remind_at timestamptz NOT NULL,
    sent boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT reminders_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.reminders IS 'Rappels programmés par les utilisateurs';

CREATE INDEX IF NOT EXISTS idx_reminders_pending ON public.reminders(remind_at) WHERE sent = false;

-- ============================================================================
-- SECTION 6: VUES UTILITAIRES
-- ============================================================================

-- Vue de performance des outils
CREATE OR REPLACE VIEW public.tool_performance AS
SELECT 
    tool,
    count(*) AS total_uses,
    round(avg(final_score)::numeric, 3) AS avg_score,
    round((sum(CASE WHEN success THEN 1 ELSE 0 END)::numeric / count(*)::numeric), 3) AS success_rate,
    round(avg(execution_time_ms)::numeric, 0) AS avg_execution_ms,
    max(created_at) AS last_used
FROM public.action_scores
GROUP BY tool
ORDER BY avg(final_score) DESC;

COMMENT ON VIEW public.tool_performance IS 'Dashboard de performance des outils';

-- Vue des groupes actifs avec stats
CREATE OR REPLACE VIEW public.active_groups AS
SELECT 
    g.jid,
    g.name,
    g.bot_mission,
    gc.warning_limit,
    gc.is_filtering_active,
    (SELECT count(*) FROM public.group_admins ga WHERE ga.group_jid = g.jid) AS admin_count,
    (SELECT count(*) FROM public.user_warnings uw WHERE uw.group_jid = g.jid) AS warning_count,
    g.updated_at
FROM public.groups g
LEFT JOIN public.group_configs gc ON g.jid = gc.group_jid
ORDER BY g.updated_at DESC;

COMMENT ON VIEW public.active_groups IS 'Groupes avec statistiques de modération';

-- ============================================================================
-- SECTION 7: TRIGGERS AUTOMATIQUES
-- ============================================================================

-- Fonction pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers sur les tables avec updated_at
DO $$
BEGIN
    -- users
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at
            BEFORE UPDATE ON public.users
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    -- groups
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_groups_updated_at') THEN
        CREATE TRIGGER update_groups_updated_at
            BEFORE UPDATE ON public.groups
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    -- entities
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_entities_updated_at') THEN
        CREATE TRIGGER update_entities_updated_at
            BEFORE UPDATE ON public.entities
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    -- group_configs
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_group_configs_updated_at') THEN
        CREATE TRIGGER update_group_configs_updated_at
            BEFORE UPDATE ON public.group_configs
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    -- bot_tools
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bot_tools_updated_at') THEN
        CREATE TRIGGER update_bot_tools_updated_at
            BEFORE UPDATE ON public.bot_tools
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- SECTION 8: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Activer RLS sur toutes les tables (le bot utilise service_role qui bypass)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_member_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomous_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FIN DU SCRIPT
-- ============================================================================

-- Résumé des tables créées
DO $$
BEGIN
    RAISE NOTICE '=== HIVE-MIND Supabase Setup Complete ===';
    RAISE NOTICE 'Tables créées: 18';
    RAISE NOTICE '- Fondamentales: users, groups';
    RAISE NOTICE '- Administration: global_admins, group_admins, group_configs';
    RAISE NOTICE '- Modération: group_filters, group_whitelist, group_member_history, user_warnings';
    RAISE NOTICE '- Mémoire: memories, facts, entities, relationships';
    RAISE NOTICE '- Agentic: bot_tools, agent_actions, action_scores';
    RAISE NOTICE '- Automation: autonomous_goals, reminders';
    RAISE NOTICE 'Vues: tool_performance, active_groups';
    RAISE NOTICE '=========================================';
END $$;
