# Verified API facts

Fill this in from `API_V1_DOCUMENTATION.md` and `scripts/probe-api.sh` output. Write down only what you have verified.

| Question | Answer | Source |
|---|---|---|
| List response envelope (bare array or `{ data, total }`?) | ? | |
| ID types (number or string) for client/project/task/entry | ? | |
| Default and max `limit` | ? | |
| Total count available? (body field or header) | ? | |
| Rate-limit headers (`X-RateLimit-*`, `Retry-After`) | ? | |
| Fixed or sliding window | ? | |
| Error body shape (400/404/429) | ? | |
| Does `GET /time-entries/:id` exist? | ? | |
| Does `/time-entries` filter by task/date? | ? | |
| Timestamp format returned (`Z`, offset, ms?) | ? | |
| Comment length limit | ? | |
| Does the API reject end ≤ start / overlaps itself? | ? | |
