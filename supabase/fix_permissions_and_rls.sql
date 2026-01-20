-- ============================================================
-- RESTAURATION DES DROITS FONDAMENTAUX
-- ============================================================

-- 1. On s'assure que le "service_role" a le droit d'utiliser le schéma public
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- 2. "L'Option Nucléaire" pour les tables :
-- On donne TOUS les droits (Lecture, Écriture, Modif, Suppression) 
-- sur TOUTES les tables actuelles au service_role.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- 3. On n'oublie pas les séquences (pour les IDs auto-incrémentés)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. Pour le futur : On dit à la base que toute nouvelle table créée 
-- devra automatiquement donner les droits au service_role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- ============================================================
-- ACTIVATION DU RLS (Row Level Security)
-- ============================================================
-- Active RLS sur toutes les tables connues pour sécuriser les accès directs.
-- Le "service_role" (utilisé par le bot) contourne le RLS par défaut.
-- Sans policies définies, personne d'autre ne pourra accéder aux données.

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomous_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_member_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
