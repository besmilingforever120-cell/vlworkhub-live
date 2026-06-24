#!/usr/bin/env bash
set -euo pipefail

OUT_PATH="${1:-/srv/vlworkhub/backups/final-cutover/protected-baseline.tsv}"
mkdir -p "$(dirname "$OUT_PATH")"

prod_q() {
  local sql="$1"
  docker compose exec -T postgres psql -U postgres -d vlworkhub -At -F $'\t' -c "$sql"
}

tables=(
  hr.scheduled_job_runs
  public.email_settings
  hr.email_settings
  public.auth_revoked_tokens
  public.audit_log
  public.organization_app_access
  hr.organization_app_access
)

{
  printf 'table\tchecksum\n'
  for tbl in "${tables[@]}"; do
    sum="$(prod_q "SELECT COALESCE(md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY to_jsonb(t)::text)), '') FROM $tbl t;")"
    printf '%s\t%s\n' "$tbl" "$sum"
  done
} > "$OUT_PATH"

echo "protected_baseline_path\t$OUT_PATH"
