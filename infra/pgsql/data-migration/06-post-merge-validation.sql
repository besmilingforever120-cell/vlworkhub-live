\set ON_ERROR_STOP on

SELECT current_database() AS current_database;
DO $$
BEGIN
	IF current_database() <> 'vlworkhub_merge_staging' THEN
		RAISE EXCEPTION 'Refusing to write outside staging';
	END IF;
END $$;

\! python3 /srv/vlworkhub/infra/pgsql/data-migration/migrate_staging.py validate
