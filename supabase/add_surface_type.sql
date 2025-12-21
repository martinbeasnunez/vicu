-- Add surface_type column to experiments table
-- Run this in the Supabase SQL Editor

-- Add surface_type column with default 'landing' for backwards compatibility
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS surface_type TEXT DEFAULT 'landing';

-- Add a comment for documentation
COMMENT ON COLUMN experiments.surface_type IS 'Type of experiment surface: landing (public page), messages (message pack for existing contacts), ritual (recurring checklist/habit)';

-- Note: Existing experiments without surface_type will default to 'landing'
