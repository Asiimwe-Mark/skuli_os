-- Add exit_date to students for transfer/graduated status
ALTER TABLE students ADD COLUMN IF NOT EXISTS exit_date date;
