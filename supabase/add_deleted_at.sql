-- ============================================
-- Add deleted_at field for soft delete support
-- ============================================

-- Add the column for soft delete
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient filtering of non-deleted experiments
CREATE INDEX IF NOT EXISTS idx_experiments_deleted_at
ON experiments (deleted_at)
WHERE deleted_at IS NULL;
