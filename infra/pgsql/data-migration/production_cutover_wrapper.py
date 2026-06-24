#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from migrate_staging import MERGE_KEYS, PROTECTED_TABLES, build_merge_sql

ROOT = Path('/srv/vlworkhub')
PRODUCTION_DB = 'vlworkhub'
OLD_DB = 'vlworkhub'
OLD_HOST = 'ismail@192.168.1.47'
OLD_COMPOSE_DIR = '/home/ismail/vlworkhub'
OLD_CONTAINER = 'vlworkhub-postgres'
OLD_WRITE_SERVICES = ('api', 'hr-app', 'main-platform')
OLD_REQUIRED_RUNNING_SERVICE = 'postgres'
CUTOVER_SCHEMA = 'cutover_import'
CONFIRM_PHRASE = 'VLWORKHUB_PRODUCTION_CUTOVER_APPROVED'

DEFAULT_STAGING_PROOF_MANIFEST = ROOT / 'infra' / 'pgsql' / 'data-migration' / 'staging_proof_manifest.json'
DEFAULT_EXPECTED_RECON = ROOT / 'infra' / 'pgsql' / 'data-migration' / 'expected_reconciliation_45.tsv'
DEFAULT_FINAL_BACKUP_DIR = ROOT / 'backups' / 'final-cutover'
DEFAULT_FREEZE_MARKER = ROOT / 'backups' / 'final-cutover' / 'old-app-frozen.marker'
DEFAULT_FINGERPRINT_DIR = ROOT / 'backups' / 'final-cutover' / 'fingerprints'


class CutoverError(RuntimeError):
    pass


def run(cmd: list[str], input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, input=input_text, text=True, capture_output=True, check=False)


def prod_psql(sql: str, db: str = PRODUCTION_DB) -> str:
    proc = run([
        'docker', 'compose', 'exec', '-T', 'postgres',
        'psql', '-U', 'postgres', '-d', db,
        '-At', '-F', '\t', '-c', sql,
    ])
    if proc.returncode != 0:
        raise CutoverError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout


def prod_psql_script(sql_script: str, db: str = PRODUCTION_DB) -> str:
    proc = run([
        'docker', 'compose', 'exec', '-T', 'postgres',
        'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db,
    ], input_text=sql_script)
    if proc.returncode != 0:
        raise CutoverError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout


def old_psql(sql: str) -> str:
    proc = run([
        'ssh', OLD_HOST,
        'docker', 'exec', '-i', OLD_CONTAINER,
        'psql', '-U', 'postgres', '-d', OLD_DB,
        '-At', '-F', '\t', '-c', sql,
    ])
    if proc.returncode != 0:
        raise CutoverError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout


def old_ssh(cmd: str) -> str:
    proc = run(['ssh', OLD_HOST, cmd])
    if proc.returncode != 0:
        raise CutoverError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout


def guard_production_target(target_db: str) -> None:
    if target_db != PRODUCTION_DB:
        raise CutoverError(f'refusing to run against non-production target database {target_db!r}')
    current = prod_psql('SELECT current_database();', db=target_db).strip()
    if current != PRODUCTION_DB:
        raise CutoverError(f'refusing to run: current_database()={current!r}, expected {PRODUCTION_DB!r}')


def verify_staging_proof_manifest(manifest_path: Path, target_db: str) -> None:
    if not manifest_path.exists():
        raise CutoverError(f'missing staging proof manifest: {manifest_path}')
    data = json.loads(manifest_path.read_text())

    if data.get('verdict') != 'STAGING MIGRATION PASSED':
        raise CutoverError('staging proof verdict is not STAGING MIGRATION PASSED')
    if data.get('staging_database') != 'vlworkhub_merge_staging':
        raise CutoverError('staging proof database mismatch')
    if data.get('shared_tables') != 45:
        raise CutoverError('shared_tables must equal 45')

    classification = data.get('classification', {})
    expected = {
        'SAFE_AUTO': 38,
        'PRESERVE_NEW_ONLY': 6,
        'DERIVED_REBUILD': 1,
        'MANUAL_CONFLICT_REQUIRED': 0,
    }
    if classification != expected:
        raise CutoverError(f'classification totals mismatch: expected={expected}, got={classification}')
    if classification.get('MANUAL_CONFLICT_REQUIRED', 0) > 0:
        raise CutoverError('MANUAL_CONFLICT_REQUIRED must be 0')
    if data.get('protected_tables_unchanged') is not True:
        raise CutoverError('protected table verification is not true in staging proof')
    if data.get('migration_created_orphans') is not False:
        raise CutoverError('migration_created_orphans must be false in staging proof')

    hash_entries = data.get('hashes', {})
    required_files = {
        'migrate_staging.py': ROOT / 'infra' / 'pgsql' / 'data-migration' / 'migrate_staging.py',
        'production_cutover_wrapper.py': ROOT / 'infra' / 'pgsql' / 'data-migration' / 'production_cutover_wrapper.py',
        'expected_reconciliation_45.tsv': ROOT / 'infra' / 'pgsql' / 'data-migration' / 'expected_reconciliation_45.tsv',
    }
    for key, path in required_files.items():
        expected_hash = hash_entries.get(key)
        if not expected_hash:
            raise CutoverError(f'missing hash entry for {key} in staging proof manifest')
        actual_hash = sha256_of(path)
        if actual_hash != expected_hash:
            raise CutoverError(f'hash mismatch for {key}: expected={expected_hash}, actual={actual_hash}')

    if data.get('target_database') and data['target_database'] != target_db:
        raise CutoverError(f"manifest target database mismatch: expected {data['target_database']!r}, got {target_db!r}")


def latest_backup(path: Path, pattern: str) -> Path:
    matches = sorted(path.glob(pattern))
    if not matches:
        raise CutoverError(f'no files found for pattern {pattern!r} in {path}')
    return matches[-1]


def verify_backup_artifacts(backup_dir: Path) -> tuple[Path, Path]:
    old_backup = latest_backup(backup_dir, 'old-final-*.backup')
    new_backup = latest_backup(backup_dir, 'new-precutover-*.backup')
    for backup in (old_backup, new_backup):
        list_file = backup.with_suffix(backup.suffix + '.list')
        sha_file = backup.with_suffix(backup.suffix + '.sha256')
        if not list_file.exists():
            raise CutoverError(f'missing pg_restore list file: {list_file}')
        if not sha_file.exists():
            raise CutoverError(f'missing sha256 file: {sha_file}')
    return old_backup, new_backup


def verify_old_app_frozen(marker_path: Path) -> None:
    if not marker_path.exists():
        raise CutoverError(f'missing old-app freeze marker: {marker_path}')
    content = marker_path.read_text().strip()
    if content != 'OLD_APP_FROZEN_CONFIRMED':
        raise CutoverError('old-app freeze marker content mismatch')


def running_old_services() -> set[str]:
    out = old_ssh(f"cd {OLD_COMPOSE_DIR} && docker compose ps --status running --services")
    return {line.strip() for line in out.splitlines() if line.strip()}


def verify_old_services_frozen() -> None:
    running = running_old_services()
    still_running = [svc for svc in OLD_WRITE_SERVICES if svc in running]
    if still_running:
        raise CutoverError(f'old write-capable services still running: {still_running}')
    if OLD_REQUIRED_RUNNING_SERVICE not in running:
        raise CutoverError(f"required old database service '{OLD_REQUIRED_RUNNING_SERVICE}' is not running")


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def verify_source_fingerprints_stable(fingerprint_dir: Path) -> None:
    required = [
        fingerprint_dir / 'old-source-fingerprint-freeze.tsv',
        fingerprint_dir / 'old-source-fingerprint-postdump.tsv',
        fingerprint_dir / 'old-source-fingerprint-premerge.tsv',
    ]
    for p in required:
        if not p.exists():
            raise CutoverError(f'missing source fingerprint snapshot: {p}')
    hashes = {p.name: sha256_of(p) for p in required}
    if len(set(hashes.values())) != 1:
        raise CutoverError(f'source fingerprints differ across freeze/postdump/premerge: {hashes}')


def list_prod_tables() -> list[str]:
    out = prod_psql(
        "SELECT table_schema || '.' || table_name FROM information_schema.tables "
        "WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1;"
    )
    return [line.strip() for line in out.splitlines() if line.strip()]


def list_columns(table: str) -> list[str]:
    schema, name = table.split('.', 1)
    out = prod_psql(
        f"SELECT column_name FROM information_schema.columns WHERE table_schema='{schema}' AND table_name='{name}' ORDER BY ordinal_position;"
    )
    return [line.strip() for line in out.splitlines() if line.strip()]


def ensure_cutover_schema() -> None:
    prod_psql(f'CREATE SCHEMA IF NOT EXISTS {CUTOVER_SCHEMA};')


def create_cutover_shadow_tables() -> None:
    ensure_cutover_schema()
    for table in list_prod_tables():
        schema, name = table.split('.', 1)
        shadow = f'{CUTOVER_SCHEMA}.{schema}_{name}'
        prod_psql(f'DROP TABLE IF EXISTS {shadow} CASCADE;')
        prod_psql(f'CREATE TABLE {shadow} (LIKE {table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);')


def import_old_data() -> None:
    dump = run([
        'ssh', OLD_HOST,
        'docker', 'exec', '-i', OLD_CONTAINER,
        'pg_dump', '-U', 'postgres', '-d', OLD_DB,
        '--data-only', '--column-inserts', '--no-owner', '--no-privileges',
    ])
    if dump.returncode != 0:
        raise CutoverError(dump.stderr.strip() or dump.stdout.strip())
    transformed = re.sub(r'INSERT INTO ([a-z_]+)\.([A-Za-z0-9_]+) \(', rf'INSERT INTO {CUTOVER_SCHEMA}.\1_\2 (', dump.stdout)
    load = run([
        'docker', 'compose', 'exec', '-T', 'postgres',
        'psql', '-U', 'postgres', '-d', PRODUCTION_DB,
    ], input_text=transformed)
    if load.returncode != 0:
        raise CutoverError(load.stderr.strip() or load.stdout.strip())


def merge_table(table: str, key_columns: list[str]) -> None:
    if table in PROTECTED_TABLES:
        return
    cols = list_columns(table)
    if not cols:
        return
    shadow = f"{CUTOVER_SCHEMA}.{table.replace('.', '_')}"
    update_sql, insert_sql = build_merge_sql(table, key_columns, cols, shadow)
    if update_sql:
        prod_psql(update_sql)
    prod_psql(insert_sql)


def merge_all_tables() -> None:
    for table, key_columns in MERGE_KEYS.items():
        try:
            merge_table(table, key_columns)
        except Exception as error:
            raise CutoverError(f'{table}: {error}') from error


def rebuild_training_tables() -> None:
    prod_psql(
        """
        INSERT INTO hr.training_assignment_users (organization_id, assignment_id, user_id)
        SELECT DISTINCT ta.organization_id, ta.id, u.id
        FROM hr.training_assignments ta
        JOIN public.users u ON u.organization_id = ta.organization_id
        WHERE ta.assignee_name IS NOT NULL
        ON CONFLICT (organization_id, assignment_id, user_id) DO NOTHING;
        """
    )
    prod_psql(
        """
        WITH unique_names AS (
          SELECT organization_id,
                 BTRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS full_name,
                 MIN(id::text)::uuid AS user_id,
                 COUNT(*) AS row_count
          FROM public.users
          WHERE status = 'active'
          GROUP BY organization_id, BTRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
        )
        UPDATE hr.training_completions tc
        SET user_id = names.user_id
        FROM unique_names names
        WHERE tc.user_id IS NULL
          AND names.row_count = 1
          AND tc.organization_id = names.organization_id
          AND BTRIM(COALESCE(tc.user_name, '')) = names.full_name;
        """
    )


def repair_sequences() -> None:
    seqs = prod_psql(
        "SELECT schemaname, sequencename FROM pg_sequences "
        "WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;"
    )
    for line in seqs.splitlines():
        if not line.strip():
            continue
        schema, seq = line.split('\t')[:2]
        m = re.search(r'^(?P<table>.+?)_id_seq$', seq)
        if not m:
            continue
        table = m.group('table')
        max_id = prod_psql(f'SELECT COALESCE(MAX(id),0) FROM {schema}.{table};').strip() or '0'
        prod_psql(f"SELECT setval('{schema}.{seq}', GREATEST({int(max_id)}, 1), true);")


def write_reconciliation_output(expected_recon_path: Path, output_dir: Path, target_db: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f'reconciliation-{datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")}.tsv'
    lines = expected_recon_path.read_text().splitlines()
    header = lines[0]
    with out_path.open('w', encoding='utf-8') as f:
        f.write(header + '\n')
        for line in lines[1:]:
            if not line.strip():
                continue
            cols = line.split('\t')
            table = cols[0]
            old_count = old_psql(f'SELECT count(*) FROM {table};').strip()
            new_count = prod_psql(f'SELECT count(*) FROM {table};', db=target_db).strip()
            f.write(line + f'\told_now={old_count}\tprod_now={new_count}\n')
    return out_path


def build_transaction_sql(target_db: str) -> str:
    statements: list[str] = ['BEGIN;']

    statements.append(f'CREATE SCHEMA IF NOT EXISTS {CUTOVER_SCHEMA};')
    for table in list_prod_tables():
        schema, name = table.split('.', 1)
        shadow = f'{CUTOVER_SCHEMA}.{schema}_{name}'
        statements.append(f'DROP TABLE IF EXISTS {shadow} CASCADE;')
        statements.append(f'CREATE TABLE {shadow} (LIKE {table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);')

    dump = run([
        'ssh', OLD_HOST,
        'docker', 'exec', '-i', OLD_CONTAINER,
        'pg_dump', '-U', 'postgres', '-d', OLD_DB,
        '--data-only', '--column-inserts', '--no-owner', '--no-privileges',
    ])
    if dump.returncode != 0:
        raise CutoverError(dump.stderr.strip() or dump.stdout.strip())
    transformed = re.sub(r'INSERT INTO ([a-z_]+)\.([A-Za-z0-9_]+) \(', rf'INSERT INTO {CUTOVER_SCHEMA}.\1_\2 (', dump.stdout)
    statements.append(transformed)

    for table, key_columns in MERGE_KEYS.items():
        if table in PROTECTED_TABLES:
            continue
        cols = list_columns(table)
        if not cols:
            continue
        shadow = f"{CUTOVER_SCHEMA}.{table.replace('.', '_')}"
        update_sql, insert_sql = build_merge_sql(table, key_columns, cols, shadow)
        if update_sql:
            statements.append(update_sql)
        statements.append(insert_sql)

    statements.append(
        """
        INSERT INTO hr.training_assignment_users (organization_id, assignment_id, user_id)
        SELECT DISTINCT ta.organization_id, ta.id, u.id
        FROM hr.training_assignments ta
        JOIN public.users u ON u.organization_id = ta.organization_id
        WHERE ta.assignee_name IS NOT NULL
        ON CONFLICT (organization_id, assignment_id, user_id) DO NOTHING;
        """
    )
    statements.append(
        """
        WITH unique_names AS (
          SELECT organization_id,
                 BTRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS full_name,
                 MIN(id::text)::uuid AS user_id,
                 COUNT(*) AS row_count
          FROM public.users
          WHERE status = 'active'
          GROUP BY organization_id, BTRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
        )
        UPDATE hr.training_completions tc
        SET user_id = names.user_id
        FROM unique_names names
        WHERE tc.user_id IS NULL
          AND names.row_count = 1
          AND tc.organization_id = names.organization_id
          AND BTRIM(COALESCE(tc.user_name, '')) = names.full_name;
        """
    )
    statements.append(
        """
        DO $$
        DECLARE
          r record;
          max_id bigint;
        BEGIN
          FOR r IN
            SELECT schemaname, sequencename, regexp_replace(sequencename, '_id_seq$', '') AS table_name
            FROM pg_sequences
            WHERE schemaname NOT IN ('pg_catalog','information_schema')
              AND sequencename LIKE '%_id_seq'
          LOOP
            BEGIN
              EXECUTE format('SELECT COALESCE(MAX(id),0) FROM %I.%I', r.schemaname, r.table_name) INTO max_id;
              EXECUTE format('SELECT setval(%L, GREATEST(%s, 1), true)', r.schemaname || '.' || r.sequencename, max_id);
            EXCEPTION WHEN undefined_table OR undefined_column THEN
              NULL;
            END;
          END LOOP;
        END $$;
        """
    )

    statements.append('COMMIT;')
    return '\n'.join(statements)


def run_preflight(
    staging_manifest: Path,
    backup_dir: Path,
    freeze_marker: Path,
    fingerprint_dir: Path,
    target_db: str,
) -> None:
    guard_production_target(target_db)
    verify_old_services_frozen()
    verify_old_app_frozen(freeze_marker)
    verify_staging_proof_manifest(staging_manifest, target_db)
    verify_backup_artifacts(backup_dir)
    verify_source_fingerprints_stable(fingerprint_dir)


def run_execute(
    confirmation: str,
    staging_manifest: Path,
    backup_dir: Path,
    freeze_marker: Path,
    fingerprint_dir: Path,
    expected_recon_path: Path,
    reconciliation_dir: Path,
    target_db: str,
) -> None:
    if confirmation != CONFIRM_PHRASE:
        raise CutoverError('explicit confirmation phrase mismatch')
    run_preflight(staging_manifest, backup_dir, freeze_marker, fingerprint_dir, target_db)
    guard_production_target(target_db)

    # Intentionally no dropdb/createdb operations: production schema is preserved.
    tx_sql = build_transaction_sql(target_db)
    try:
        prod_psql_script(tx_sql, db=target_db)
    except CutoverError as error:
        raise CutoverError(f'merge transaction aborted; production changes rolled back: {error}') from error

    report = write_reconciliation_output(expected_recon_path, reconciliation_dir, target_db)
    print(f'reconciliation_report\t{report}')


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description='VLWorkHub production cutover wrapper (preflight + guarded execute).')
    sub = p.add_subparsers(dest='cmd', required=True)

    for name in ('preflight', 'execute'):
        sp = sub.add_parser(name)
        sp.add_argument('--staging-manifest', type=Path, default=DEFAULT_STAGING_PROOF_MANIFEST)
        sp.add_argument('--backup-dir', type=Path, default=DEFAULT_FINAL_BACKUP_DIR)
        sp.add_argument('--freeze-marker', type=Path, default=DEFAULT_FREEZE_MARKER)
        sp.add_argument('--fingerprint-dir', type=Path, default=DEFAULT_FINGERPRINT_DIR)
        sp.add_argument('--expected-reconciliation', type=Path, default=DEFAULT_EXPECTED_RECON)
        sp.add_argument('--reconciliation-dir', type=Path, default=DEFAULT_FINAL_BACKUP_DIR)
        sp.add_argument('--target-db', default=PRODUCTION_DB)
    sub.choices['execute'].add_argument('--confirm', required=True)

    check = sub.add_parser('check', help='Run a single non-writing preflight guard check for dry-run safety testing.')
    check.add_argument(
        '--guard',
        required=True,
        choices=['target-db', 'old-services', 'freeze-marker', 'staging-manifest', 'backups', 'fingerprints'],
    )
    check.add_argument('--staging-manifest', type=Path, default=DEFAULT_STAGING_PROOF_MANIFEST)
    check.add_argument('--backup-dir', type=Path, default=DEFAULT_FINAL_BACKUP_DIR)
    check.add_argument('--freeze-marker', type=Path, default=DEFAULT_FREEZE_MARKER)
    check.add_argument('--fingerprint-dir', type=Path, default=DEFAULT_FINGERPRINT_DIR)
    check.add_argument('--target-db', default=PRODUCTION_DB)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == 'preflight':
        run_preflight(args.staging_manifest, args.backup_dir, args.freeze_marker, args.fingerprint_dir, args.target_db)
    elif args.cmd == 'execute':
        run_execute(
            args.confirm,
            args.staging_manifest,
            args.backup_dir,
            args.freeze_marker,
            args.fingerprint_dir,
            args.expected_reconciliation,
            args.reconciliation_dir,
            args.target_db,
        )
    else:
        if args.guard == 'target-db':
            guard_production_target(args.target_db)
        elif args.guard == 'old-services':
            verify_old_services_frozen()
        elif args.guard == 'freeze-marker':
            verify_old_app_frozen(args.freeze_marker)
        elif args.guard == 'staging-manifest':
            verify_staging_proof_manifest(args.staging_manifest, args.target_db)
        elif args.guard == 'backups':
            verify_backup_artifacts(args.backup_dir)
        elif args.guard == 'fingerprints':
            verify_source_fingerprints_stable(args.fingerprint_dir)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
