-- Add a free-text "user_name" column to audit entries so the History
-- panel can display "11:32:05 · Dr. Smith · Set Joshi 6a-4p" without a
-- full auth setup. Names are typed by the clerk/provider directly in the
-- Board header and persisted in their browser; this column just stores
-- whatever name was active at the time the entry was written.

alter table public.audit_log
  add column if not exists user_name text;
