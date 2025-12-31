-- Add user_id column to experiments table for multi-user support
-- This migration adds authentication-based user filtering

-- Add user_id column with default for existing data
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'demo-user';

-- Create index for efficient user-based queries
CREATE INDEX IF NOT EXISTS idx_experiments_user_id ON experiments(user_id);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_experiments_user_status ON experiments(user_id, status);

-- Update RLS policies (if RLS is enabled in the future)
-- For now, we'll handle user filtering at the application level
