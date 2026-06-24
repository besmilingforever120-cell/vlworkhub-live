#!/usr/bin/env bash
set -euo pipefail

ROOT=/srv/vlworkhub
TABLE_LIST_DEFAULT="$ROOT/infra/pgsql/data-migration/source_fingerprint_tables.txt"
OUT_PATH_DEFAULT="$ROOT/backups/final-cutover/fingerprints/old-source-fingerprint.tsv"
OLD_HOST=ismail@192.168.1.47
OLD_CONTAINER=vlworkhub-postgres
OLD_DB=vlworkhub

TABLE_LIST="${1:-$TABLE_LIST_DEFAULT}"
OUT_PATH="${2:-$OUT_PATH_DEFAULT}"

mkdir -p "$(dirname "$OUT_PATH")"

old_q() {
  local sql="$1"
  ssh -n "$OLD_HOST" "docker exec -i $OLD_CONTAINER psql -U postgres -d $OLD_DB -At -F E'\\t' -c \"$sql\""
}

sensitive_cols_regex='(password|token|secret|smtp|body|content|note|description|text|old_value|new_value|user_agent|ip_address|file_url|storage_path)'

{
  printf 'table\trow_count\tstructural_checksum\tmax_trusted_timestamp\n'
  while IFS= read -r table; do
    [[ -z "$table" ]] && continue
    schema="${table%%.*}"
    name="${table##*.}"

    row_count="$(old_q "SELECT count(*) FROM $table;")"

    max_ts_col="$(old_q "SELECT column_name FROM information_schema.columns WHERE table_schema='$schema' AND table_name='$name' AND column_name IN ('updated_at','completed_on','signed_at','publish_date','created_at') ORDER BY CASE column_name WHEN 'updated_at' THEN 1 WHEN 'completed_on' THEN 2 WHEN 'signed_at' THEN 3 WHEN 'publish_date' THEN 4 WHEN 'created_at' THEN 5 ELSE 99 END LIMIT 1;")"

    if [[ -n "$max_ts_col" ]]; then
      max_ts="$(old_q "SELECT COALESCE(MAX($max_ts_col)::text, '') FROM $table;")"
    else
      max_ts=""
    fi

    checksum="$(old_q "WITH cols AS (SELECT column_name FROM information_schema.columns WHERE table_schema='$schema' AND table_name='$name' AND column_name !~* '$sensitive_cols_regex' ORDER BY ordinal_position), sqltxt AS (SELECT 'SELECT COALESCE(md5(string_agg(md5(to_jsonb(x)::text), '''' ORDER BY to_jsonb(x)::text)), '''') FROM (SELECT ' || string_agg(quote_ident(column_name), ',') || ' FROM $table) x' AS q FROM cols) SELECT COALESCE((SELECT (regexp_replace(q, E'\\n', ' ', 'g')) FROM sqltxt), 'SELECT ''''');")"

    if [[ -z "$checksum" ]]; then
      structural_checksum=""
    else
      structural_checksum="$(old_q "$checksum")"
    fi

    printf '%s\t%s\t%s\t%s\n' "$table" "$row_count" "$structural_checksum" "$max_ts"
  done < "$TABLE_LIST"
} > "$OUT_PATH"

echo "fingerprint_path\t$OUT_PATH"
