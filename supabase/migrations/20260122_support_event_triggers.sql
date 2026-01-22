-- Migration: support_event_triggers.sql
-- Date: 2026-01-22
-- Objectif: Ajouter le support pour les déclencheurs événementiels (Wait for Message)

-- 1. Ajouter les colonnes de trigger
ALTER TABLE public.autonomous_goals
ADD COLUMN IF NOT EXISTS trigger_type text DEFAULT 'TIME', -- 'TIME', 'EVENT'
ADD COLUMN IF NOT EXISTS trigger_event text,             -- 'WAIT_FOR_MESSAGE', 'WAIT_FOR_JOIN'...
ADD COLUMN IF NOT EXISTS trigger_condition jsonb DEFAULT '{}'::jsonb;

-- 2. Contrainte de validation sur le type
ALTER TABLE public.autonomous_goals
ADD CONSTRAINT autonomous_goals_trigger_type_check 
CHECK (trigger_type = ANY (ARRAY['TIME'::text, 'EVENT'::text]));

-- 3. Commentaire
COMMENT ON COLUMN public.autonomous_goals.trigger_type IS 'Type de déclencheur: TIME (horaire) ou EVENT (événement)';
COMMENT ON COLUMN public.autonomous_goals.trigger_condition IS 'Conditions JSON pour le déclencheur événementiel (ex: {sender: "xyz"})';
