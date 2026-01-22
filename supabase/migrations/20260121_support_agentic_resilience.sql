-- Migration: support_agentic_resilience.sql
-- Date: 2026-01-21
-- Objectif: Ajouter le support pour la persistance des étapes du Planner et les nouveaux statuts

-- 1. Ajouter la colonne 'steps' pour stocker la progression du plan
ALTER TABLE public.agent_actions 
ADD COLUMN IF NOT EXISTS steps jsonb DEFAULT '[]'::jsonb;

-- 2. Mettre à jour la contrainte de vérification du status
-- D'abord, on supprime l'ancienne contrainte restrictive (success/error uniquement)
ALTER TABLE public.agent_actions 
DROP CONSTRAINT IF EXISTS agent_actions_status_check;

-- Ensuite, on ajoute la nouvelle contrainte incluant les états agentiques
ALTER TABLE public.agent_actions 
ADD CONSTRAINT agent_actions_status_check 
CHECK (status = ANY (ARRAY[
    'active'::text, 
    'success'::text, 
    'error'::text, 
    'interrupted'::text, 
    'completed'::text
]));

-- 3. Commentaire pour documentation
COMMENT ON COLUMN public.agent_actions.steps IS 'Liste des étapes validées par le Planner pour reprise après crash';
