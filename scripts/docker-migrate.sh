#!/usr/bin/env bash
set -euo pipefail

HOST="${POSTGRES_HOST:-db}"
USER="${POSTGRES_USER:-postgres}"
DB="${POSTGRES_DB:-crm-aluinter}"
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

psql() {
  command psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

echo "Waiting for Postgres at $HOST..."
for i in $(seq 1 60); do
  if command pg_isready -h "$HOST" -U "$USER" -d "$DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
command pg_isready -h "$HOST" -U "$USER" -d "$DB"

echo "Applying compatibility layer..."
psql -f /sql/init/000_compat.sql

apply() {
  local id="$1"
  local file="$2"
  local applied
  applied="$(psql -tAc "SELECT 1 FROM schema_migrations WHERE id = '$id'")"
  if [ "$applied" = "1" ]; then
    echo "skip $id"
    return
  fi
  echo "apply $id"
  psql -f "$file"
  psql -c "INSERT INTO schema_migrations (id) VALUES ('$id')"
}

for f in /sql/migrations/*.sql; do
  apply "$(basename "$f")" "$f"
done

echo "Applying post-migration grants + notify triggers..."
psql -f /sql/init/999_post.sql

if [ "${SEED_DEMO:-1}" = "1" ]; then
  echo "Seeding demo data..."
  psql -f /sql/seed.sql
fi

echo "Migrations complete."
