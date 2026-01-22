-- Add reminder tracking columns to step_assignments
ALTER TABLE step_assignments
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

-- Add same columns to action_assignments for consistency
ALTER TABLE action_assignments
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

-- Index for efficient querying of pending assignments needing reminders
CREATE INDEX IF NOT EXISTS idx_step_assignments_pending_reminders
ON step_assignments(status, created_at, reminder_count)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_action_assignments_pending_reminders
ON action_assignments(status, created_at, reminder_count)
WHERE status = 'pending';
