\set ON_ERROR_STOP on

SELECT current_database() AS current_database;
SELECT version() AS version;
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1;

\! python3 /srv/vlworkhub/infra/pgsql/data-migration/migrate_staging.py compare
