# `'use cache'` read after `updateTag()` returns the old data when it joins another request's fill

Reproduction for [vercel/next.js#100345](https://github.com/vercel/next.js/issues/100345).

This reproduction shows a request that reads a `'use cache'` function right after `updateTag()` getting the data from before the update. It happens when another request started a fill for the same cache entry before the update and that fill is still running. The request after the update joins that fill instead of running a new one.

It is plain Next.js with `cacheComponents: true` and nothing else: no database, no external services.

## Steps

```bash
npm install
npm run build && npm start -- -p 3100
```

In another terminal:

```bash
npm run repro
```

`npm run dev -- -p 3100` reproduces it the same way, as do `--webpack` builds.

Each run of the script:

1. Resets the list to `[a, b, c]` and expires the `items` tag (`POST /api/reset`), so the next read is a cache miss.
2. Requests `/`. This is another user's read: it misses, so it starts a fill that takes 1.5 s.
3. 300 ms later, submits the delete form on `/edit`. Its Server Action deletes `b`, calls `updateTag('items')`, and redirects to `/`. The script reads the list from that redirect.
4. Waits for step 2, then requests `/` again, as a reload.

Options: `--path /remote` uses the same function with `'use cache: remote'`, `--alone` skips step 2, `--runs N` (default 10), `--base URL` (default `http://localhost:3100`).

To run it against a cache handler that checks tags in `get()`, set `REPRO_HANDLER` to `infinity` or `zero` for both `next build` and `next start`, or for `next dev`:

```bash
export REPRO_HANDLER=infinity
npm run build && npm start -- -p 3100
```

This serves `'use cache'` and `'use cache: remote'` from `cache-handlers/tags-in-get.js`, a test handler written for this reproduction. It keeps entries and tag state in memory and checks tags in `get()`, which the [`cacheHandlers` contract](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers#getexpiration) allows. Its `getExpiration()` returns what the mode names: `Infinity` (check soft tags in `get()` instead) or `0` (not tracking tag revalidation). Without `REPRO_HANDLER`, both use the built-in handler.

## Expected

After the delete, the list is `[a, c]`. The [`updateTag` docs](https://nextjs.org/docs/app/api-reference/functions/updateTag) say: "The next request will wait to fetch fresh data rather than serving stale content from the cache, ensuring users see their changes immediately."

## Actual

After the delete, the list is still `[a, b, c]` in every run. A reload is correct.

```
http://localhost:3100/, with a concurrent reader, 10 runs, expecting [a, c]
run 1: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 2: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 3: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 4: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 5: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 6: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 7: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 8: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 9: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
run 10: after the delete [a, b, c] FAIL, after a reload [a, c] PASS
after the delete: FAIL 10/10
after a reload:   PASS 10/10
```

Without the concurrent read (`npm run repro -- --alone`), it passes every time:

```
http://localhost:3100/, without a concurrent reader, 10 runs, expecting [a, c]
run 1: after the delete [a, c] PASS, after a reload [a, c] PASS
run 2: after the delete [a, c] PASS, after a reload [a, c] PASS
run 3: after the delete [a, c] PASS, after a reload [a, c] PASS
run 4: after the delete [a, c] PASS, after a reload [a, c] PASS
run 5: after the delete [a, c] PASS, after a reload [a, c] PASS
run 6: after the delete [a, c] PASS, after a reload [a, c] PASS
run 7: after the delete [a, c] PASS, after a reload [a, c] PASS
run 8: after the delete [a, c] PASS, after a reload [a, c] PASS
run 9: after the delete [a, c] PASS, after a reload [a, c] PASS
run 10: after the delete [a, c] PASS, after a reload [a, c] PASS
after the delete: PASS 10/10
after a reload:   PASS 10/10
```

`npm run repro -- --path /remote` (`'use cache: remote'`) gives the same results.

Tested with the concurrent read, 10 runs each:

| next | `next dev` | `next dev --webpack` | `next build && next start` | `next build --webpack && next start` |
| --- | --- | --- | --- | --- |
| 16.4.0 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 |
| 16.4.2 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 |
| 16.5.0-canary.16 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 |
| 16.5.0-canary.16, `REPRO_HANDLER=infinity` | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 |
| 16.5.0-canary.16, `REPRO_HANDLER=zero` | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 | FAIL 10/10 |

Each cell is the same for `/` and `/remote`. Without the concurrent read, every configuration passes 10/10, and the reload passes 10/10 everywhere. 16.3.0-canary.0 passes and 16.3.0-canary.1 fails (`next start`, 5 runs each); canary.1 added cross-request deduping of `'use cache'` invocations (#91830).

## The app

- `lib/items.ts`: an in-memory list as the database, and `getItems()`, a `'use cache'` function tagged `items`. It reads the list, then waits 1.5 s as a stand-in for a slow query. `getItemsRemote()` is the same with `'use cache: remote'`.
- `app/page.tsx` and `app/remote/page.tsx`: render the list per request (`connection()`) inside `<Suspense>`.
- `app/edit/actions.ts`: the Server Action. It deletes `b`, calls `updateTag('items')`, then `redirect()`, as in the docs' read-your-own-writes example.
- `app/api/reset/route.ts`: puts `b` back and expires the tag between runs.
- `repro.mjs`: the script. It submits the form the way a browser without JavaScript does, so it needs no dependencies.
- `cache-handlers/tags-in-get.js`: the test handler that `REPRO_HANDLER` switches on in `next.config.ts`. It is not meant to be copied: it never evicts, and it keeps its tags in one process.

To try it by hand: open `/edit`, then reload `/` in another tab and click "Delete b and show /" within about a second. The page after the redirect still lists `b`.

## Cause

In `packages/next/src/server/use-cache/use-cache-wrapper.ts`, a request that finds a pending fill for the same key in `crossRequestPendingCacheInvocations` joins it. Once that fill completes, the join checks only the root params before forking the result. A handler hit is checked more closely: `cacheHandler.get` drops an entry whose tags expired after its timestamp, and then `shouldDiscardCacheEntry` runs. A completed invocation reused within the same request also goes through `shouldDiscardCacheEntry`. A joined fill gets neither check, so a fill that started before `updateTag()` is served after it.

## Fix

`fix/use-cache-wrapper.ts.patch` is a suggested fix against the `v16.5.0-canary.16` source. When the joined fill completes, it runs the checks a cache handler hit gets on the leader path, in its order: it refreshes the handler's tags, then runs `shouldDiscardCacheEntry` with the implicit tags' expiration. A built-in handler is then asked for the expiration of each of the fill's tags, since its `getExpiration` reads the tag state its `get` checks. Any other handler may return `Infinity` or `0` from `getExpiration` and check tags in `get` instead, which the [`cacheHandlers` contract](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers#getexpiration) allows, so its `get` judges the entry the fill stored, as it judges a hit. The fill is used if `get` returns it, or an older entry that carries its tags. A miss or a newer entry means the fill is outdated, and the request retries and becomes the leader.

The cost is one extra fill for each joiner that races a tag expiration. On a handler that isn't built in, each joiner also makes one `get` call, and a miss for any other reason, such as a handler that doesn't keep the entry, costs a fill too.

In `next dev`, a custom handler is read through Next's tiered handler, which answers `get` at once from an in-memory copy and checks the configured handler in the background, so the fix sees what a cache hit sees there. An `updateTag()` or `revalidateTag()` in the same server reaches the in-memory copy, so this reproduction passes in `next dev`. An expiration that only the configured handler knows, such as a tag expired by another process, or a `revalidatePath()` that a handler returning `Infinity` checks in `get`, still returns the old data once, on a joined fill as on a cache hit; the next read is fresh. `next start` reads the configured handler directly and returns the new data in both cases.

`fix/next-dist.patch` adds the same check to the compiled `next@16.5.0-canary.16` package, for trying it here:

```bash
patch -p1 -d node_modules/next < fix/next-dist.patch
npm run build && npm start -- -p 3100
npm run repro
```

With it applied, every run passes:

```
http://localhost:3100/, with a concurrent reader, 10 runs, expecting [a, c]
run 1: after the delete [a, c] PASS, after a reload [a, c] PASS
run 2: after the delete [a, c] PASS, after a reload [a, c] PASS
run 3: after the delete [a, c] PASS, after a reload [a, c] PASS
run 4: after the delete [a, c] PASS, after a reload [a, c] PASS
run 5: after the delete [a, c] PASS, after a reload [a, c] PASS
run 6: after the delete [a, c] PASS, after a reload [a, c] PASS
run 7: after the delete [a, c] PASS, after a reload [a, c] PASS
run 8: after the delete [a, c] PASS, after a reload [a, c] PASS
run 9: after the delete [a, c] PASS, after a reload [a, c] PASS
run 10: after the delete [a, c] PASS, after a reload [a, c] PASS
after the delete: PASS 10/10
after a reload:   PASS 10/10
```

Tested on 16.5.0-canary.16 with `fix/next-dist.patch`, with the concurrent read, 10 runs each:

| handler | `next dev` | `next dev --webpack` | `next build && next start` | `next build --webpack && next start` |
| --- | --- | --- | --- | --- |
| built-in | PASS 10/10 | PASS 10/10 | PASS 10/10 | PASS 10/10 |
| `REPRO_HANDLER=infinity` | PASS 10/10 | PASS 10/10 | PASS 10/10 | PASS 10/10 |
| `REPRO_HANDLER=zero` | PASS 10/10 | PASS 10/10 | PASS 10/10 | PASS 10/10 |

Each cell is the same for `/` and `/remote`. Without the concurrent read, and after a reload, every configuration passes 10/10.
