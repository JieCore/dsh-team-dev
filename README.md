# dsh-team-dev

A self-contained Dev Team bundle for DeepSeek Harness. One plugin row brings two capabilities:

1. **Step budget guard** — a per-agent, per-turn tool-call budget. Soft threshold (default 20) warns non-teammate sessions; the hard threshold (default 25) denies every tracked non-allowlisted call **before it runs**, directing the agent to write a handoff, update its task, and report to the Lead. Allowlisted tools (`write`, `edit`, `team_task_update`, `send_message`) keep working so the agent can wind down. Default `onlyTeamMembers: true` budgets Agent Teams teammates only — the Lead is never capped.
2. **Bundled skills** — installing the plugin installs the `team-dev` (dev team orchestration) and `team-boot` (general task team) skills from the package's `skills/` directory. Project (rank 100) and user (rank 400) skills still override these bundled ones (rank 600).

Zero runtime dependencies.

## Install

### As a local package

```bash
# 1. add the dependency to the profile's package.json
#    "@jiecore/dsh-team-dev": "file:/absolute/path/to/dsh-team-dev-0.1.0.tgz"
#    or a git/npm specifier once published
# 2. list the bundle in dsh.profile.bundles (package.json)
#    "dsh.profile.bundles": [..., "dsh-team-dev"]
# 3. reinstall the profile and restart DSH
cd "$DSH_HOME/profiles/web" && pnpm install
```

### As a patch insert (single-session profile, no bundle listing)

Append to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-team-dev
      name: dsh-team-dev
```

and add the `dsh-team-dev` dependency to the profile's `package.json`, then reinstall and restart.

## Verify

```bash
node scripts/verify.mjs          # package integrity smoke check
# runtime self-check after install + restart:
grep "dsh-team-dev" "$DSH_HOME/../Logs/DSH Desktop/harness.log" | tail -2
# expect: [dsh-team-dev] budget guard + bundled skills installed
# then: run a teammate task that makes >25 tool calls in one turn; the 26th
# non-allowlisted call must be refused with "Step budget exhausted: ...".
```

## Configure

Row config (defaults shown):

```yaml
softThreshold: 20
hardThreshold: 25
allow: [write, edit, team_task_update, send_message]
include: []
exclude: []
onlyTeamMembers: true
```

Misconfiguration fails loudly at load (soft below 2, hard not above soft).

## Uninstall

Remove the bundle line / patch row and the dependency, reinstall, restart. The
bundled skills disappear with the package; any project- or user-level skills
with the same names stay.

## Publish to the DSH plugin market

The desktop market discovers plugins from GitHub (`discovery-github-compatibility-v1`).
Push this package to a public GitHub repository with the `dsh.bundle.patch`
manifest in `package.json` (already present); the market's compatibility
discovery indexes `github:<repo>` entries with version, `enginesDsh`, and
peer-dependency facts.

## Development: this project owns the source

The hand-written guard source lives here at `src/guard.ts` — the single source
of truth. `lib/index.js` is build output (`scripts/build.mjs`); never edit it.

```bash
node scripts/build.mjs          # bundle src/ → lib/index.js + smoke check
node scripts/export-to-harness.mjs   # regenerate the repository test facade
cd ../deepseek-harness && pnpm exec vitest run packages/guard/step-budget
pnpm pack                      # repack the tarball
```

`export-to-harness.mjs` generates the repository package
`packages/guard/step-budget/src/index.ts` (schemastery Config schema, identity
rows, real imports) so the harness keeps its type-check, coverage, and CI
gates and can upstream the guard later. Behavioral parity is pinned by
`packages/guard/step-budget/tests/artifact-parity.spec.ts`, which runs the
built `lib/index.js` through the same agent-loop harness as the facade.

## Publish

Two channels, both supported by the DSH market:

1. **npm (recommended)** — the market discovers npm package names with their
   version / `enginesDsh` / peer-dependency facts, and falls back to
   `registry.npmmirror.com` for China. Zero peer dependencies here, so the
   compatibility check always passes.

   ```bash
   npm login            # once; your own account
   npm publish          # publishes dsh-team-dev@0.1.0
   ```

2. **GitHub mirror (optional)** — a public GitHub repo enters the market's
   `github:` compatibility list and doubles as the source page. Gitee is NOT a
   market install host (its archive paths differ); keep it as a mirror only.

Before publishing, replace `repository.url` in `package.json` with your real
repo URL and bump `version` for each release (`node scripts/verify.mjs` first).

## Upgrade self-check (after any DSH upgrade)

1. `grep "dsh-team-dev" <harness.log> | tail -2` — the mount marker must appear, no import errors.
2. `node scripts/verify.mjs` — package integrity.
3. Budget probe: a teammate task with >25 tool calls in one turn must be refused at the 26th; the Lead stays uncapped.
4. Skills probe: type `/` in a session — `team-dev` and `team-boot` must appear in the menu.
