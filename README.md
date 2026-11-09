# dsh-team-dev

A self-contained Dev Team bundle for DeepSeek Harness. One plugin row brings three capabilities:

1. **Step budget guard** — a per-agent, per-turn tool-call budget. Soft threshold (default 20) warns non-teammate sessions; the hard threshold (default 25) denies every tracked non-allowlisted call **before it runs**, directing the agent to write a handoff, update its task, and report to the Lead. Allowlisted tools (`write`, `edit`, `team_task_update`, `send_message`) keep working so the agent can wind down. Default `onlyTeamMembers: true` budgets Agent Teams teammates only — the Lead is never capped.
2. **Bundled skills** — installing the plugin installs the `team-dev` (dev team orchestration) and `team-boot` (general task team) skills from the package's `skills/` directory. `team-dev` also ships **built-in engineering guidelines** (`skills/team-dev/guidelines.md`, including a frontend list-ordering spec) with project-level overrides. Project (rank 100) and user (rank 400) skills still override these bundled ones (rank 600).
3. **Team board (v0.2, browser half)** — a read-only kanban in the Web UI's right sidebar: tasks by status (pending / in progress / done), grouped by role/member, with a team switcher for multiple conversations. Data comes from two read-only host routes (`/api/dsh-team-dev/teams`, `/api/dsh-team-dev/teams/<teamId>`); nothing is written, nothing is cached, no extra runtime dependency.

Zero runtime dependencies. The browser half is built to `lib/client.js` and loaded by the host's client module system (`dsh.client`).

## Install

### As a local package

```bash
# 1. add the dependency to the profile's package.json
#    "dsh-team-dev": "file:/absolute/path/to/dsh-team-dev-0.2.0.tgz"
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

## Team board / multiple teams (v0.2)

- Open the **Team board** tab in the Web UI's right sidebar (the tab appears when the profile includes the default `ui-sidebar-right` plugin, which the stock Web app does).
- One root conversation = one implicit Agent Team (`TeamId = root SessionId`). Open several conversations in parallel and you get several independent teams; the board's team selector lists them all and defaults to the team of the current session.
- The board is **read-only**: task creation/claim/update still go through the Agent Teams tools (`team_task_*`). It refreshes every 5 s, pauses while the tab is hidden, backs off to 5/15/30 s on failures, and cancels in-flight requests on switch/refresh.
- Details are served by `/api/dsh-team-dev/teams/<teamId>`: because the host route registry matches exact paths, the host registers one exact route per live team after each team-list request (a `?teamId=` query fallback exists for the same data).
- No Agent Teams → the plugin still loads and the board shows a clear "this deployment has no Agent Teams" empty state (the host route answers `degraded: true`). If the `connection` service itself is missing, no board routes are registered: the plugin still loads, and the board shows a load error (check the install / restart).
- Cross-team isolation: one board shows one team at a time; tasks, owners and write scopes never mix between teams.

## Development guidelines (v0.2)

- Built-in: `skills/team-dev/guidelines.md` — general engineering rules, contract/error-state rules, data-safety rules, ordering & naming (including **§5.2 frontend list-ordering spec**), this repository's contracts, and the three quality gates.
- Overrides: the Lead reads project-level `AGENTS.md` / `CLAUDE.md` / `.dsh/team-guidelines.md` first (highest priority); uncovered clauses fall back to the built-in file. The Lead must reference both in every task card's *Inputs* and *Applicable guideline clauses* fields.
- Members read the referenced guideline clauses before starting; a conflict between a task card and the guidelines must be reported to the Lead instead of silently resolved.

## Verify

```bash
node scripts/build.mjs          # host half → lib/index.js
node scripts/build-client.mjs   # browser half → lib/client.js (V1–V5 assertions)
node scripts/verify.mjs         # package integrity + client bundle contract
# runtime self-check after install + restart:
grep "dsh-team-dev" "$DSH_HOME/../Logs/DSH Desktop/harness.log" | tail -2
# expect: [dsh-team-dev] budget guard + bundled skills + team board installed
# then: run a teammate task that makes >25 tool calls in one turn; the 26th
# non-allowlisted call must be refused with "Step budget exhausted: ...".
```

## Configure

Row config (defaults shown). The board is read-only and needs no configuration.

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
bundled skills and the board disappear with the package; any project- or
user-level skills with the same names stay.

## Publish to the DSH plugin market

The desktop market discovers plugins from GitHub (`discovery-github-compatibility-v1`).
Push this package to a public GitHub repository with the `dsh.bundle.patch`
manifest in `package.json` (already present); the market's compatibility
discovery indexes `github:<repo>` entries with version, `enginesDsh`, and
peer-dependency facts.

## Development: this project owns the source

The hand-written guard source lives here at `src/guard.ts` — the single source
of truth. The host half is `src/index.js` + `src/host/team-board.js`; the
browser half is `src/client/`. `lib/index.js` and `lib/client.js` are build
outputs — never edit them by hand.

```bash
node scripts/build.mjs               # bundle host src/ → lib/index.js + smoke check
node scripts/build-client.mjs        # bundle src/client/ → lib/client.js (V1–V5)
node scripts/export-to-harness.mjs   # regenerate the repository test facade
cd ../deepseek-harness && pnpm exec vitest run packages/guard/step-budget
pnpm pack                            # repack the tarball
```

`export-to-harness.mjs` generates the repository package
`packages/guard/step-budget/src/index.ts` (schemastery Config schema, identity
rows, real imports) so the harness keeps its type-check, coverage, and CI
gates and can upstream the guard later. Behavioral parity is pinned by
`packages/guard/step-budget/tests/artifact-parity.spec.ts`, which runs the
built `lib/index.js` through the same agent-loop harness as the facade.

The browser bundle format follows the host client module loader: a
`window.__ModuleLoader__.load({ id, factory })` lazy-CJS wrapper with React
kept external. `scripts/build-client.mjs` finds esbuild from the sibling
`deepseek-harness` checkout (same as the host build) and hard-fails when the
bundle loses the loader wrapper, the module id, the `sidebar.right.pane.tab`
registration markers, or exceeds 1.5 MB.

## Publish

Two channels, both supported by the DSH market:

1. **npm (recommended)** — the market discovers npm package names with their
   version / `enginesDsh` / peer-dependency facts, and falls back to
   `registry.npmmirror.com` for China. Zero peer dependencies here, so the
   compatibility check always passes.

   ```bash
   npm login            # once; your own account
   npm publish          # publishes dsh-team-dev@0.2.0
   ```

2. **GitHub mirror (optional)** — a public GitHub repo enters the market's
   `github:` compatibility list and doubles as the source page. Gitee is NOT a
   market install host (its archive paths differ); keep it as a mirror only.

Before publishing, replace `repository.url` in `package.json` with your real
repo URL and bump `version` for each release (`node scripts/verify.mjs` first).

## Upgrade self-check (after any DSH upgrade)

1. `grep "dsh-team-dev" <harness.log> | tail -2` — the mount marker must appear, no import errors.
2. `node scripts/verify.mjs` — package integrity (host + client contract + guidelines).
3. Budget probe: a teammate task with >25 tool calls in one turn must be refused at the 26th; the Lead stays uncapped.
4. Skills probe: type `/` in a session — `team-dev` and `team-boot` must appear in the menu.
5. Board probe: the right sidebar shows the **Team board** tab; with a running team it lists tasks and the team selector. If Agent Teams is absent, it must show the degraded empty state instead of breaking the sidebar.
