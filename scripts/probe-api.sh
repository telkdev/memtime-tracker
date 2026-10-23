#!/usr/bin/env bash
# Manually verify the real API contract. Spends ~6 of the 15 req/60s budget. Never run in CI.
# Reads the key from .env; prints status, rate-limit headers and body heads. The key is redacted
# from output (time entries echo it back in userId).
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
set -a; source .env; set +a
BASE="${NUXT_MEMTIME_BASE_URL:-https://interview-api.memtime-demo.deno.net/api/v1}"
: "${NUXT_MEMTIME_API_KEY:?set NUXT_MEMTIME_API_KEY in .env}"

req() { # method path [json-body]
  echo "=== $1 $2"
  curl -sS -i -X "$1" "$BASE$2" \
    -H "Authorization: Bearer $NUXT_MEMTIME_API_KEY" \
    -H "Content-Type: application/json" ${3:+--data "$3"} \
    | sed "s/$NUXT_MEMTIME_API_KEY/<REDACTED_KEY>/g" \
    | grep -iE '^(HTTP/|x-ratelimit|ratelimit|retry-after|x-total|link:)|^[{\[ ]' | head -40
  echo
}

req GET  "/clients?limit=2&offset=0"
CLIENT_ID=$(curl -sS "$BASE/clients?limit=1" -H "Authorization: Bearer $NUXT_MEMTIME_API_KEY" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const a=Array.isArray(j)?j:(j.data??j.items??j.results??[]);console.log(a[0]?.id??"")})')
[ -n "$CLIENT_ID" ] && req GET "/clients/$CLIENT_ID/projects?limit=2"
req GET  "/time-entries?limit=2&offset=0"
req GET  "/time-entries/999999999"                   # 404 shape
req PUT  "/time-entries/999999999" '{"taskId":1,"comment":"probe","start":"2026-01-01T09:00:00Z","end":"2026-01-01T10:00:00Z"}'
req POST "/time-entries" '{not json'                  # 400 shape
echo "Record findings in docs/API_NOTES.md (shapes, id types, pagination envelope, rate-limit headers)."
