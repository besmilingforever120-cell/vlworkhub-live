# VLWorkHub Production Cutover Runbook (Preparation Only)

This runbook prepares the maintenance-window execution steps without running the production merge now.

## 1) Old-service freeze targets

Freeze these old-host services only (keep old postgres running):
- api
- hr-app
- main-platform

Reason:
- `api` receives write traffic.
- `hr-app` and `main-platform` are user entry points that would continue submitting write operations.
- `postgres` remains up for final dump and verification.

## 2) Freeze commands (do not run during prep)

```bash
ssh ismail@192.168.1.47 "cd /home/ismail/vlworkhub && docker compose ps"
ssh ismail@192.168.1.47 "cd /home/ismail/vlworkhub && docker compose stop api hr-app main-platform"
ssh ismail@192.168.1.47 "cd /home/ismail/vlworkhub && docker compose ps"
printf 'OLD_APP_FROZEN_CONFIRMED\n' > /srv/vlworkhub/backups/final-cutover/old-app-frozen.marker
```

## 3) Unfreeze commands (if cutover cancelled before merge)

```bash
ssh ismail@192.168.1.47 "cd /home/ismail/vlworkhub && docker compose start api hr-app main-platform"
ssh ismail@192.168.1.47 "cd /home/ismail/vlworkhub && docker compose ps"
```

## 4) Final backup commands (maintenance-window only)

```bash
cd /srv/vlworkhub
mkdir -p backups/final-cutover/fingerprints
TS="$(date -u +%Y%m%d-%H%M%S)"

# Old source final backup (streamed over SSH)
ssh ismail@192.168.1.47 \
  "docker exec -i vlworkhub-postgres pg_dump -U postgres -d vlworkhub -Fc" \
  > "backups/final-cutover/old-final-${TS}.backup"

# New production pre-cutover backup
docker compose exec -T postgres \
  pg_dump -U postgres -d vlworkhub -Fc \
  > "backups/final-cutover/new-precutover-${TS}.backup"

# Backup verification artifacts
for f in "backups/final-cutover/old-final-${TS}.backup" "backups/final-cutover/new-precutover-${TS}.backup"; do
  pg_restore -l "$f" > "${f}.list"
  sha256sum "$f" > "${f}.sha256"
  stat -c '%n\t%s\t%y' "$f" > "${f}.meta"
done

# PostgreSQL versions for provenance
ssh ismail@192.168.1.47 "docker exec -i vlworkhub-postgres psql -U postgres -d vlworkhub -At -c 'SELECT version();'" > "backups/final-cutover/old-final-${TS}.pg_version"
docker compose exec -T postgres psql -U postgres -d vlworkhub -At -c 'SELECT version();' > "backups/final-cutover/new-precutover-${TS}.pg_version"
```

## 5) Source fingerprint method

Three snapshots must be captured and match exactly:
- immediately after freeze
- immediately after final old dump
- immediately before production merge

Use:

```bash
cd /srv/vlworkhub
bash infra/pgsql/data-migration/generate_source_fingerprint.sh \
  infra/pgsql/data-migration/source_fingerprint_tables.txt \
  backups/final-cutover/fingerprints/old-source-fingerprint-freeze.tsv

bash infra/pgsql/data-migration/generate_source_fingerprint.sh \
  infra/pgsql/data-migration/source_fingerprint_tables.txt \
  backups/final-cutover/fingerprints/old-source-fingerprint-postdump.tsv

bash infra/pgsql/data-migration/generate_source_fingerprint.sh \
  infra/pgsql/data-migration/source_fingerprint_tables.txt \
  backups/final-cutover/fingerprints/old-source-fingerprint-premerge.tsv

sha256sum backups/final-cutover/fingerprints/old-source-fingerprint-*.tsv
cmp -s backups/final-cutover/fingerprints/old-source-fingerprint-freeze.tsv backups/final-cutover/fingerprints/old-source-fingerprint-postdump.tsv
cmp -s backups/final-cutover/fingerprints/old-source-fingerprint-freeze.tsv backups/final-cutover/fingerprints/old-source-fingerprint-premerge.tsv
```

If either comparison fails: abort cutover.

## 6) Protected-table baseline (pre-cutover)

```bash
cd /srv/vlworkhub
bash infra/pgsql/data-migration/capture_protected_baseline.sh \
  backups/final-cutover/protected-precutover.tsv
```

Post-merge compare command (future):

```bash
bash infra/pgsql/data-migration/capture_protected_baseline.sh \
  backups/final-cutover/protected-postmerge.tsv
join -t $'\t' -a1 -a2 -e '' -o '0,1.2,2.2' \
  <(tail -n +2 backups/final-cutover/protected-precutover.tsv | sort) \
  <(tail -n +2 backups/final-cutover/protected-postmerge.tsv | sort) \
  | awk -F'\t' '{print $1"\t"($2==$3?"UNCHANGED":"CHANGED")"\t"$2"\t"$3}'
```

## 7) Guarded production merge wrapper (do not run now)

Generate hash-bound staging proof manifest after staging sign-off:

```bash
cd /srv/vlworkhub
python3 infra/pgsql/data-migration/build_staging_proof_manifest.py
```

Preflight only:

```bash
cd /srv/vlworkhub
python3 infra/pgsql/data-migration/production_cutover_wrapper.py preflight --target-db vlworkhub
```

Future execution (maintenance window only):

```bash
cd /srv/vlworkhub
python3 infra/pgsql/data-migration/production_cutover_wrapper.py execute \
  --target-db vlworkhub \
  --confirm VLWORKHUB_PRODUCTION_CUTOVER_APPROVED
```

Safety controls in wrapper:
- hardcoded allowed target DB is only `vlworkhub`
- explicit confirmation phrase required
- verifies old-host service state over SSH: `api/hr-app/main-platform` must be stopped and `postgres` must be running
- verifies old freeze marker (supporting evidence)
- verifies hash-bound staging proof manifest and exact totals (45/38/6/1/0)
- rejects `MANUAL_CONFLICT_REQUIRED > 0`
- verifies old/new final backups (+ list + sha256)
- verifies source fingerprint equality across three checkpoints
- no dropdb/createdb calls against production
- merge SQL runs in one fail-fast transaction (`ON_ERROR_STOP`, `BEGIN ... COMMIT`)
- aborts on any conflict/exception
- writes reconciliation report

## 8) Post-merge production data validation plan

Checks (future):
- `SELECT current_database();` equals `vlworkhub`
- protected table checksums unchanged
- `ALTER TABLE ... VALIDATE CONSTRAINT` status already valid and no invalid constraints present
- orphan checks:
  - document assignments = 0
  - document signatures = 0
  - training completions = 0
  - survey completions = 0
  - task completion orphans = 4 (known historical baseline only)
- training mapping integrity:
  - duplicates = 0
  - cross-org links = 0
- sequences: `last_value >= max(id)` for all `*_id_seq`
- reconciliation vs `infra/pgsql/data-migration/expected_reconciliation_45.tsv`
- `hr.training_completions.user_id` preserved where already non-null

## 9) Application validation checklist (future)

- API health endpoint returns healthy
- main-platform login succeeds
- hr-app login succeeds
- employee portal access succeeds
- documents list/view works
- document preview works
- signatures can be loaded and submitted in-app checks
- tasks list/status updates work
- training list/completions load correctly
- surveys list/completions load correctly
- department audit pages load
- employee HR audit pages load
- scheduler remains disabled until all checks pass
- no test email sent during validation

## 10) Rollback procedures

### A) Before production merge starts
- restart old services (`api hr-app main-platform`)
- keep production untouched
- close maintenance window

### B) Merge fails inside transaction
- wrapper/process aborts immediately
- verify transaction rollback and unchanged production checksums
- restart old services

### C) Merge succeeds but app validation fails
- stop production app services (not database)
- restore verified `new-precutover-*.backup` into `vlworkhub`
- run protected + integrity + smoke validations
- restart old services
- investigate offline

Never restore old full schema over new production schema.

## 11) Credential rotation plan (post-cutover, not now)

1. Generate new password without printing it in terminal logs.
2. Apply in DB:
   - `ALTER ROLE postgres WITH PASSWORD '<new-secret>';`
3. Update `/srv/vlworkhub/.env` securely.
4. Update backup scripts/credential stores used by operations.
5. Recreate only services that require DB credential.
6. Verify API and app health checks.
7. Confirm old credential is rejected.
8. Do not commit secrets.
