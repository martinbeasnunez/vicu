-- Add status field to experiments table
-- Run this in the Supabase SQL Editor

ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'testing';

-- Add a comment for documentation
COMMENT ON COLUMN experiments.status IS 'Experiment status: testing, scale, iterate, kill, paused';
