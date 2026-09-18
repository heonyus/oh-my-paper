# Offline subprocess environment audit

Started: 2026-09-06
Scope: Security F03 secret inheritance in optional offline subprocesses.

## Observed call sites

- `src/electron/mineruLayoutAdapter.ts`
- `src/electron/documentLayoutService.ts`
- `src/electron/paddlePageParserService.ts`
- `src/electron/paddleVlmServer.ts`
- `src/electron/localEnrichmentAdapter.ts`

All five call sites previously copied `process.env` into a child. The existing
Codex environment sanitizer remains a separate authentication boundary because
it intentionally sets Codex-specific paths and an isolated `HOME`.

## Hypotheses

1. Secret inheritance is caused by the five child launch sites spreading
   `process.env`; synthetic canary keys should be visible before the fix and
   absent after the allowlist fix.
2. Offline runtime behavior depends on a small set of inherited platform and
   locale variables plus explicit offline/cache settings; the synthetic child
   should fail if those required values are missing.
3. The shared helper could mutate parent process state or replace `HOME`; the
   parent environment and caller-selected `HOME` should remain unchanged.

## Artifacts

- [ ] `runtime-env-debug.md` — requested audit ledger; retain with this fix.
- [ ] `src/electron/offlineSubprocessEnvironment.ts` — new shared allowlist helper.
- [ ] `src/electron/mineruLayoutAdapter.ts` — replace inherited environment at child launch.
- [ ] `src/electron/documentLayoutService.ts` — replace inherited environment at child launch.
- [ ] `src/electron/paddlePageParserService.ts` — replace inherited environment at child launch.
- [ ] `src/electron/paddleVlmServer.ts` — replace inherited environment at server launch.
- [ ] `src/electron/localEnrichmentAdapter.ts` — replace inherited environment at child launch.
- [ ] Focused unit tests — synthetic canary coverage for all five callers.
- [ ] Source instrumentation — none.
- [ ] Runtime/model downloads — none.
- [ ] Actual inference — none.

## Verification record

Red focused run: the five caller regressions failed because the synthetic
children observed inherited canaries; the shared-helper test also failed before
the helper existed. The VLM launch fake additionally hit sandbox `listen EPERM`,
so its regression was kept at the real server environment-builder seam without
starting a listener.

Green focused run:

```text
Test Files  6 passed (6)
Tests       20 passed (20)
```

`npm run typecheck` passed both renderer and Electron TypeScript checks.
Targeted Biome checks passed for the five callers, helper, and focused tests.
The shared key list uses an explicit `readonly string[]` annotation; no new
`as const` assertion is used in the helper or focused tests.
No runtime/model download, actual inference, network listener, or dependency
change was used.
