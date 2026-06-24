#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
from pathlib import Path

ROOT = Path('/srv/vlworkhub')
BACKUP_DIR = ROOT / 'backups' / 'pre-merge'
STAGING_DB = 'vlworkhub_merge_staging'
SOURCE_DB = 'vlworkhub'
OLD_HOST = 'ismail@192.168.1.47'
OLD_CONTAINER = 'vlworkhub-postgres'

PROTECTED_TABLES = {
    'hr.scheduled_job_runs',
    'public.email_settings',
    'hr.email_settings',
    'public.auth_revoked_tokens',
    'public.audit_log',
    'public.organization_app_access',
    'hr.organization_app_access',
}

MERGE_KEYS = {
    'public.users': ['id'],
    'public.organizations': ['id'],
    'public.departments': ['id'],
    'public.user_app_access': ['id'],
    'public.user_roles': ['id'],
    'hr.hr_user_roles': ['organization_id', 'user_id'],
    'hr.documents': ['organization_id', 'title'],
    'hr.announcements': ['organization_id', 'id'],
    'hr.document_assignments': ['organization_id', 'document_id', 'user_id', 'department_id', 'all_staff'],
    'hr.document_signatures': ['organization_id', 'document_id', 'user_id'],
    'hr.tasks': ['organization_id', 'title'],
    'hr.task_assignments': ['id'],
    'hr.task_completion': ['id'],
    'hr.training': ['organization_id', 'id'],
    'hr.training_assignments': ['organization_id', 'id'],
    'hr.training_completions': ['organization_id', 'id'],
    'hr.surveys': ['organization_id', 'title'],
    'hr.survey_assignments': ['organization_id', 'id'],
    'hr.survey_completions': ['organization_id', 'assignment_id', 'user_id'],
    'hr.hr_onboarding_uploads': ['organization_id', 'id'],
    'hr.hr_onboarding_expiry_tasks': ['organization_id', 'user_id', 'document_type_key', 'expiry_date'],
}

MANUAL_CONFLICT_TABLES = {
}

SAFE_UPDATE_EXCLUDES = {
    'public.users': {'password_hash', 'must_change_password', 'failed_login_attempts', 'locked_until'},
    'hr.training_completions': {'user_id'},
}

SENSITIVE_NAME_RE = re.compile(r'password|token|secret|smtp|body|content|note|description|text|old_value|new_value|user_agent|ip_address|file_url|storage_path', re.I)


def run(cmd: list[str], input_text: str | None = None, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, input=input_text, text=True, capture_output=True, check=check)


def build_merge_sql(table: str, key_columns: list[str], cols: list[str], shadow: str) -> tuple[str | None, str]:
    src_cols = ', '.join(cols)
    insert_cols = ', '.join(cols)
    select_cols = ', '.join(f's.{c}' for c in cols)
    key_predicate = ' AND '.join(f't.{c} IS NOT DISTINCT FROM s.{c}' for c in key_columns)
    timestamp_col = next((c for c in ('updated_at', 'created_at') if c in cols), None)
    order_by_parts = list(key_columns)
    if timestamp_col:
        order_by_parts.append(f'{timestamp_col} DESC NULLS LAST')
    order_by_clause = ', '.join(order_by_parts)
    update_excludes = set(key_columns) | SAFE_UPDATE_EXCLUDES.get(table, set())
    update_cols = [c for c in cols if c not in update_excludes]
    if not update_cols:
        update_sql = None
    else:
        set_clause = ', '.join(f'{c} = COALESCE(s.{c}, t.{c})' for c in update_cols)
        update_where = key_predicate
        if timestamp_col and timestamp_col not in key_columns:
            update_where += f' AND (t.{timestamp_col} IS NULL OR s.{timestamp_col} > t.{timestamp_col})'
        update_sql = (
            f'WITH src AS (SELECT DISTINCT ON ({", ".join(key_columns)}) {src_cols} FROM {shadow} ORDER BY {order_by_clause}) '
            f'UPDATE {table} AS t SET {set_clause} FROM src AS s WHERE {update_where};'
        )
    insert_sql = (
        f'WITH src AS (SELECT DISTINCT ON ({", ".join(key_columns)}) {src_cols} FROM {shadow} ORDER BY {order_by_clause}) '
        f'INSERT INTO {table} ({insert_cols}) '
        f'SELECT {select_cols} FROM src AS s '
        f'WHERE NOT EXISTS (SELECT 1 FROM {table} AS t WHERE {key_predicate});'
    )
    return update_sql, insert_sql


def local_psql(sql: str, db: str = STAGING_DB) -> str:
    proc = run([
        'docker', 'compose', 'exec', '-T', 'postgres',
        'psql', '-U', 'postgres', '-d', db,
        '-At', '-F', '\t', '-c', sql,
    ])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout


def old_psql(sql: str) -> str:
    proc = run([
        'ssh', OLD_HOST,
        'docker', 'exec', '-i', OLD_CONTAINER,
        'psql', '-U', 'postgres', '-d', SOURCE_DB,
        '-At', '-F', '\t', '-c', sql,
    ])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout


def guard(db: str = STAGING_DB) -> None:
    current = local_psql('SELECT current_database();', db=db).strip()
    if current != STAGING_DB:
        raise RuntimeError(f'refusing to write outside staging; current_database()={current!r}')


def list_tables(db: str = STAGING_DB) -> list[str]:
    out = local_psql(
        "SELECT table_schema || '.' || table_name FROM information_schema.tables "
        "WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1;",
        db=db,
    )
    return [line.strip() for line in out.splitlines() if line.strip()]


def list_columns(db: str, table: str) -> list[str]:
    schema, name = table.split('.', 1)
    out = local_psql(
        f"SELECT column_name FROM information_schema.columns WHERE table_schema='{schema}' AND table_name='{name}' ORDER BY ordinal_position;",
        db=db,
    )
    return [line.strip() for line in out.splitlines() if line.strip()]


def ensure_backup_dir() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def backup_new_live() -> Path:
    ensure_backup_dir()
    ts = dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    backup = BACKUP_DIR / f'new-live-{ts}.backup'
    with backup.open('wb') as handle:
        proc = subprocess.run(
            ['docker', 'compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'postgres', '-d', SOURCE_DB, '-Fc'],
            stdout=handle,
            stderr=subprocess.PIPE,
            text=False,
            check=False,
        )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or b'').decode().strip())
    return backup


def backup_old_live() -> Path:
    ensure_backup_dir()
    ts = dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    backup = BACKUP_DIR / f'old-live-{ts}.backup'
    with backup.open('wb') as handle:
        proc = subprocess.run(
            ['ssh', OLD_HOST, 'docker', 'exec', '-i', OLD_CONTAINER, 'pg_dump', '-U', 'postgres', '-d', SOURCE_DB, '-Fc'],
            stdout=handle,
            stderr=subprocess.PIPE,
            text=False,
            check=False,
        )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or b'').decode().strip())
    return backup


def create_staging_clone(new_backup: Path) -> None:
    run(['docker', 'compose', 'exec', '-T', 'postgres', 'dropdb', '-U', 'postgres', '--if-exists', STAGING_DB], check=False)
    run(['docker', 'compose', 'exec', '-T', 'postgres', 'createdb', '-U', 'postgres', STAGING_DB])
    guard(STAGING_DB)
    remote_backup = '/tmp/vlworkhub-new-live.backup'
    run(['docker', 'cp', str(new_backup), f'vlworkhub-postgres:{remote_backup}'])
    try:
        run(['docker', 'compose', 'exec', '-T', 'postgres', 'pg_restore', '-U', 'postgres', '-d', STAGING_DB, '--no-owner', '--no-privileges', remote_backup])
    finally:
        run(['docker', 'compose', 'exec', '-T', 'postgres', 'rm', '-f', remote_backup], check=False)


def ensure_legacy_import_schema() -> None:
    guard()
    local_psql('CREATE SCHEMA IF NOT EXISTS legacy_import;')


def create_legacy_shadow_tables() -> None:
    guard()
    for table in list_tables(STAGING_DB):
        schema, name = table.split('.', 1)
        shadow = f'legacy_import.{schema}_{name}'
        local_psql(f'DROP TABLE IF EXISTS {shadow} CASCADE;')
        local_psql(f'CREATE TABLE {shadow} (LIKE {table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);')


def import_old_data() -> None:
    guard()
    ensure_legacy_import_schema()
    create_legacy_shadow_tables()
    dump = run([
        'ssh', OLD_HOST,
        'docker', 'exec', '-i', OLD_CONTAINER,
        'pg_dump', '-U', 'postgres', '-d', SOURCE_DB,
        '--data-only', '--column-inserts', '--no-owner', '--no-privileges',
    ])
    if dump.returncode != 0:
        raise RuntimeError(dump.stderr.strip() or dump.stdout.strip())
    transformed = re.sub(r'INSERT INTO ([a-z_]+)\.([A-Za-z0-9_]+) \(', r'INSERT INTO legacy_import.\1_\2 (', dump.stdout)
    proc = run(['docker', 'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', STAGING_DB], input_text=transformed)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())


def merge_table(table: str, key_columns: list[str]) -> None:
    guard()
    if table in PROTECTED_TABLES:
        return
    if table in MANUAL_CONFLICT_TABLES:
        return
    if not key_columns:
        raise RuntimeError(f'missing merge key for {table}')
    shadow = f"legacy_import.{table.replace('.', '_')}"
    cols = list_columns(STAGING_DB, table)
    if not cols:
        return
    update_sql, insert_sql = build_merge_sql(table, key_columns, cols, shadow)
    if update_sql:
        local_psql(update_sql)
    local_psql(insert_sql)


def merge_safe_tables() -> None:
    guard()
    for table, key in MERGE_KEYS.items():
        try:
            merge_table(table, key)
        except Exception as error:
            raise RuntimeError(f'{table}: {error}') from error


def rebuild_training_tables() -> None:
    guard()
    proc1 = run([
        'docker', 'compose', 'exec', '-T', 'postgres',
        'psql', '-U', 'postgres', '-d', STAGING_DB,
        '-At', '-F', '\t', '-c', """
    INSERT INTO hr.training_assignment_users (organization_id, assignment_id, user_id)
    SELECT DISTINCT ta.organization_id, ta.id, u.id
    FROM hr.training_assignments ta
    JOIN public.users u ON u.organization_id = ta.organization_id
    WHERE ta.assignee_name IS NOT NULL
    ON CONFLICT (organization_id, assignment_id, user_id) DO NOTHING;
    """,
    ])
    if proc1.returncode != 0:
        raise RuntimeError(proc1.stderr.strip() or proc1.stdout.strip())
    proc2 = run([
        'docker', 'compose', 'exec', '-T', 'postgres',
        'psql', '-U', 'postgres', '-d', STAGING_DB,
        '-At', '-F', '\t', '-c', """
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
        """,
    ])
    if proc2.returncode != 0:
        raise RuntimeError(proc2.stderr.strip() or proc2.stdout.strip())


def repair_sequences() -> None:
    guard()
    seqs = local_psql("SELECT schemaname, sequencename FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;")
    for line in seqs.splitlines():
        if not line.strip():
            continue
        schema, seq = line.split('\t')[:2]
        table_match = re.search(r'^(?P<table>.+?)_id_seq$', seq)
        if not table_match:
            continue
        table = table_match.group('table')
        max_id_result = run([
            'docker', 'compose', 'exec', '-T', 'postgres',
            'psql', '-U', 'postgres', '-d', STAGING_DB,
            '-At', '-c', f'SELECT COALESCE(MAX(id), 0) FROM {schema}.{table};',
        ])
        if max_id_result.returncode != 0:
            raise RuntimeError(max_id_result.stderr.strip() or max_id_result.stdout.strip())
        max_id = int(max_id_result.stdout.strip() or '0')
        local_psql(f"SELECT setval('{schema}.{seq}', GREATEST({max_id}, 1), true);")


def validate() -> None:
    guard()
    checks = [
        "SELECT current_database() = 'vlworkhub_merge_staging';",
        "SELECT to_regclass('hr.scheduled_job_runs') IS NOT NULL;",
        "SELECT to_regclass('hr.training_assignment_users') IS NOT NULL;",
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='hr' AND table_name='training_completions' AND column_name='user_id');",
    ]
    for sql in checks:
        local_psql(sql)


def rollback_staging() -> None:
    run(['docker', 'compose', 'exec', '-T', 'postgres', 'dropdb', '-U', 'postgres', '--if-exists', STAGING_DB])


def compare() -> None:
    print('current_database\t' + local_psql('SELECT current_database();').strip())
    print('version\t' + local_psql('SELECT version();').strip())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('compare')
    sub.add_parser('backup-new')
    sub.add_parser('backup-old')
    sub.add_parser('stage-clone')
    sub.add_parser('extract-old')
    sub.add_parser('merge')
    sub.add_parser('rebuild')
    sub.add_parser('repair-sequences')
    sub.add_parser('validate')
    sub.add_parser('rollback')
    args = parser.parse_args(argv)

    if args.cmd == 'compare':
        compare()
    elif args.cmd == 'backup-new':
        print(backup_new_live())
    elif args.cmd == 'backup-old':
        print(backup_old_live())
    elif args.cmd == 'stage-clone':
        backups = sorted(BACKUP_DIR.glob('new-live-*.backup'))
        if not backups:
            raise RuntimeError('no verified new-live backup found')
        create_staging_clone(backups[-1])
    elif args.cmd == 'extract-old':
        import_old_data()
    elif args.cmd == 'merge':
        merge_safe_tables()
    elif args.cmd == 'rebuild':
        rebuild_training_tables()
    elif args.cmd == 'repair-sequences':
        repair_sequences()
    elif args.cmd == 'validate':
        validate()
    elif args.cmd == 'rollback':
        rollback_staging()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
