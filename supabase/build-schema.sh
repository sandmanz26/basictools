#!/usr/bin/env bash
# Builds supabase/00_schema.sql from the Drizzle migrations so the SQL editor and `npm run db:migrate` never drift.
# Run from the repo root:  bash supabase/build-schema.sh
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/00_schema.sql
{
  echo "-- HireFlow schema (generated from server/drizzle/*.sql by supabase/build-schema.sh — do not edit by hand)."
  echo "-- Paste into the Supabase SQL editor and run once on an empty project."
  echo
  for f in $(ls server/drizzle/*.sql | sort); do
    echo "-- ===== $(basename "$f") ====="
    sed 's/--> statement-breakpoint//' "$f"
    echo
  done
} > "$out"
echo "wrote $out ($(wc -l < "$out") lines)"
