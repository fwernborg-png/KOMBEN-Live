create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- SECURITY:
-- ddld_cron_token skapas medvetet inte från Git.
-- Secret måste sättas separat i Supabase Vault i den
-- miljö där DD/LD-cron ska vara aktiv.
;
