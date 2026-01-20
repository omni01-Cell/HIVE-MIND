-- supabase/supabase_setup.sql
-- Schéma complet de la base de données HIVE-MIND (Mis à jour 10/10)
-- Ce fichier contient la définition de toutes les tables, vues et contraintes.

-- 1. Tables Fondamentales (Users, Groups)
CREATE TABLE IF NOT EXISTS public.users (
  jid text NOT NULL,
  lid text UNIQUE,
  username text,
  interaction_count bigint DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  hash character varying,
  CONSTRAINT users_pkey PRIMARY KEY (jid)
);

CREATE TABLE IF NOT EXISTS public.groups (
  jid text NOT NULL,
  name text,
  description text,
  bot_mission text,
  founder_jid text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT groups_pkey PRIMARY KEY (jid),
  CONSTRAINT groups_founder_jid_fkey FOREIGN KEY (founder_jid) REFERENCES public.users(jid)
);

-- 2. Configuration & Modération
CREATE TABLE IF NOT EXISTS public.global_admins (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  jid text,
  role text CHECK (role = ANY (ARRAY['owner'::text, 'moderator'::text])),
  name text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT global_admins_pkey PRIMARY KEY (id),
  CONSTRAINT global_admins_jid_fkey FOREIGN KEY (jid) REFERENCES public.users(jid)
);

CREATE TABLE IF NOT EXISTS public.group_configs (
  group_jid text NOT NULL,
  welcome_message text,
  is_filtering_active boolean DEFAULT false,
  warning_limit integer DEFAULT 3,
  auto_ban boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT group_configs_pkey PRIMARY KEY (group_jid),
  CONSTRAINT group_configs_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid)
);

CREATE TABLE IF NOT EXISTS public.group_filters (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  group_jid text,
  keyword text NOT NULL,
  regex_variants jsonb DEFAULT '[]'::jsonb,
  context_rule text,
  severity text CHECK (severity = ANY (ARRAY['warn'::text, 'kick'::text, 'ban'::text, 'mute'::text])),
  created_by text,
  CONSTRAINT group_filters_pkey PRIMARY KEY (id),
  CONSTRAINT group_filters_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid)
);

CREATE TABLE IF NOT EXISTS public.group_member_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  group_jid text,
  user_jid text,
  action text CHECK (action = ANY (ARRAY['add'::text, 'remove'::text, 'promote'::text, 'demote'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT group_member_history_pkey PRIMARY KEY (id),
  CONSTRAINT group_member_history_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid)
);

CREATE TABLE IF NOT EXISTS public.group_whitelist (
  group_jid text NOT NULL,
  user_jid text NOT NULL,
  added_by text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT group_whitelist_pkey PRIMARY KEY (group_jid, user_jid),
  CONSTRAINT group_whitelist_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid),
  CONSTRAINT group_whitelist_user_jid_fkey FOREIGN KEY (user_jid) REFERENCES public.users(jid)
);

CREATE TABLE IF NOT EXISTS public.user_warnings (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  group_jid text,
  user_jid text,
  reason text,
  filter_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_warnings_pkey PRIMARY KEY (id),
  CONSTRAINT user_warnings_group_jid_fkey FOREIGN KEY (group_jid) REFERENCES public.groups(jid),
  CONSTRAINT user_warnings_user_jid_fkey FOREIGN KEY (user_jid) REFERENCES public.users(jid),
  CONSTRAINT user_warnings_filter_id_fkey FOREIGN KEY (filter_id) REFERENCES public.group_filters(id)
);

-- 3. Mémoire & Connaissances (Updated 10/10)
CREATE TABLE IF NOT EXISTS public.memories (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  chat_id text NOT NULL,
  content text NOT NULL,
  role text CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])),
  embedding USER-DEFINED,
  created_at timestamp with time zone DEFAULT now(),
  -- Colonnes ajoutées pour Memory Decay (Module 10/10)
  decay_score numeric DEFAULT 0.5,
  archived_at timestamp with time zone,
  recall_count integer DEFAULT 0,
  CONSTRAINT memories_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.facts (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  chat_id text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT facts_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.entities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding USER-DEFINED,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT entities_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.relationships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  source_id uuid,
  target_id uuid,
  relation_type text NOT NULL,
  strength double precision DEFAULT 1.0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT relationships_pkey PRIMARY KEY (id),
  CONSTRAINT relationships_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.entities(id),
  CONSTRAINT relationships_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.entities(id)
);

-- 4. Actions & Agentic (Updated 10/10)
CREATE TABLE IF NOT EXISTS public.bot_tools (
  name text NOT NULL,
  plugin_name text NOT NULL,
  description text NOT NULL,
  definition jsonb NOT NULL,
  embedding USER-DEFINED,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bot_tools_pkey PRIMARY KEY (name)
);

CREATE TABLE IF NOT EXISTS public.agent_actions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  chat_id text NOT NULL,
  tool_name text NOT NULL,
  params jsonb,
  result jsonb,
  status text CHECK (status = ANY (ARRAY['success'::text, 'error'::text])),
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT agent_actions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.autonomous_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  target_chat_id text,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending'::text,
  priority integer DEFAULT 5,
  execute_at timestamp with time zone,
  result text,
  origin text,
  CONSTRAINT autonomous_goals_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.reminders (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  chat_id text NOT NULL,
  message text NOT NULL,
  remind_at timestamp with time zone NOT NULL,
  sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reminders_pkey PRIMARY KEY (id)
);

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
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT action_scores_pkey PRIMARY KEY (id),
  CONSTRAINT action_scores_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.agent_actions(id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_memories_decay_score ON memories(decay_score) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_recall_count ON memories(recall_count);

CREATE INDEX IF NOT EXISTS idx_action_scores_tool ON action_scores(tool);
CREATE INDEX IF NOT EXISTS idx_action_scores_score ON action_scores(final_score);
CREATE INDEX IF NOT EXISTS idx_action_scores_created ON action_scores(created_at DESC);

-- 6. Vues
CREATE OR REPLACE VIEW public.tool_performance WITH (security_invoker = on) AS
 SELECT tool,
    count(*) AS total_uses,
    avg(final_score) AS avg_score,
    sum(
        CASE
            WHEN success THEN 1
            ELSE 0
        END)::double precision / count(*)::double precision AS success_rate,
    avg(execution_time_ms) AS avg_execution_ms,
    max(created_at) AS last_used
   FROM action_scores
  GROUP BY tool
  ORDER BY (avg(final_score)) DESC;
