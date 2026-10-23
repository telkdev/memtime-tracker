---
paths:
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "vitest.config.*"
  - "playwright.config.*"
---

# Testing

## Never hit the real API

The upstream allows 15 requests per minute and the data is shared. Tests mock at the boundary:

- Server tests mock `server/utils/memtime.ts`'s fetch (inject a fake fetcher) or use recorded
  fixtures in `tests/fixtures/*.json`. Fixtures are made from probe output **with the key removed**.
- Component and composable tests mock `$fetch` / the BFF routes.
- If a test needs the network, it's wrong.

## What must be tested (priority order)

1. `app/utils/time.ts`: local↔UTC round trip, duration parse/format (`1h 30m`, `1:30`, `90m`,
   `1.5h`, junk input), midnight crossing, and both DST transitions under a fixed `TZ`.
2. `server/utils/rate-limiter.ts` with fake timers: never more than 15 calls in any 60 s window,
   write > interactive > background ordering, the background reserve, Retry-After handling
   (seconds and HTTP date), and the max-wait timeout returning 429.
3. `server/utils/cache.ts`: TTL expiry, in-flight coalescing (2 callers → 1 fetch), errors not
   cached, invalidation on write.
4. Error mapping: upstream 400/404/429/401/5xx → BFF `ApiError` → form field errors and messages.
5. `shared/schemas`: the entry input schema (end > start, required fields, ISO format).
6. `EntryForm.vue`: field-level errors shown, double submit prevented, the 404 offers "create as new",
   and values are kept on failure.
7. Optional: one Playwright smoke test (tree expand → pick task → create entry → appears in list)
   against a mocked BFF.

## Style

- Arrange / act / assert. One behaviour per test. Name tests after the behaviour:
  `it('rejects end before start')`.
- Use a fixed clock and fixed TZ in time tests (`vi.setSystemTime`, `process.env.TZ` set in
  vitest config).
- Don't snapshot whole components. Assert on what the user sees (text, roles, aria attributes).
- A bug fix comes with a test that fails without the fix.
