# dsh-team-dev

A self-contained Dev Team bundle for DeepSeek Harness. One bundle brings four capabilities:

1. **Step budget guard** — a per-agent, per-turn tool-call budget. Soft threshold (default 20) warns non-teammate sessions; the hard threshold (default 25) denies every tracked non-allowlisted call **before it runs**, directing the agent to write a handoff, update its task, and report to the Lead. Allowlisted tools (`write`, `edit`, `team_task_update`, `send_message`, `present`) keep working so the agent can wind down and deliver. Default `onlyTeamMembers: true` budgets Agent Teams teammates only — the Lead is never capped.
2. **Bundled skills** — installing the plugin installs the `team-dev` (dev team orchestration) and `team-boot` (general task team) skills from the package's `skills/` directory. Since v0.4 `team-dev` uses a **short router + references**: `SKILL.md` only routes the stages, while the L0 contract, quality gates, delivery surface and project-rule discovery are loaded per stage, so the whole rulebook is not injected every turn. Project (rank 100) and user (rank 400) skills still override these bundled ones (rank 600).
3. **Team board (v0.2, browser half)** — a read-only kanban in the Web UI's right sidebar: tasks by status (pending / in progress / done), grouped by role/member, with a team switcher for multiple conversations. Data comes from two read-only host routes (`/api/dsh-team-dev/teams`, `/api/dsh-team-dev/teams/<teamId>`); nothing is written, nothing is cached, no extra runtime dependency.
4. **Session change ledger (v0.3, separate plugin entry)** — fills the gaps in DSH's own `workspace-changes`: it records **top-level sessions only**, renders **one turn at a time**, excludes subagent edits (team-dev members), and loses old rounds after a host restart. This plugin listens to the global `fs/write-intent` / `fs/edit-intent` / `fs/delete-intent` hooks, aggregates **every agent's** edits (subagents included) under the root Session, and serves a read-only ledger at `/api/dsh-session-changes/summary?sessionId=<root>` for a "files changed in this session" turn-tail card. The ledger is in memory only and clears on host restart.

Zero runtime dependencies. The browser half is built to `lib/client.js` and loaded by the host's client module system (`dsh.client`).

## Install

### As a local package

```bash
# 1. add the dependency to the profile's package.json
#    "dsh-team-dev": "file:/absolute/path/to/dsh-team-dev-0.4.0.tgz"
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
- The board has two views, switched by the segmented control at the top: **Current session** (the team of the conversation you are in) and **All teams** (v0.2.1 — every online team on one screen: task total / in-progress / completed stats, progress bars, status badges, sort by in-progress / task count / name, status filter and search by lead or session id). Clicking **Open board** on a team card jumps straight to that team's board without switching conversations.
- v0.2.2 polish: the team selector marks the **current conversation's team**, a banner with **Back to current team** appears when you are viewing another conversation's team, and task cards keep their **Details / Collapse** toggle in the card header so it stays reachable after expanding.
- One root conversation = one implicit Agent Team (`TeamId = root SessionId`). Open several conversations in parallel and you get several independent teams; the board's team selector lists them all and defaults to the team of the current session.
- **Multi-session file boundary (v0.2.3)**: sessions in the same workspace share the filesystem. When several sessions work on the same repository, the Lead creates a dedicated working directory per session (`create_worktree` / `git worktree add`, or a copied directory for non-git projects) and records the session root plus session-level write scope on every task card; shared files allow only one session to write at a time, and cross-session conflicts are decided by the Lead.
- The board is **read-only**: task creation/claim/update still go through the Agent Teams tools (`team_task_*`). It refreshes every 5 s, pauses while the tab is hidden, backs off to 5/15/30 s on failures, and cancels in-flight requests on switch/refresh.
- Details are served by `/api/dsh-team-dev/teams/<teamId>`: because the host route registry matches exact paths, the host registers one exact route per live team after each team-list request (a `?teamId=` query fallback exists for the same data).
- No Agent Teams → the plugin still loads and the board shows a clear "this deployment has no Agent Teams" empty state (the host route answers `degraded: true`). If the `connection` service itself is missing, no board routes are registered: the plugin still loads, and the board shows a load error (check the install / restart).
- Cross-team isolation: one board shows one team at a time; tasks, owners and write scopes never mix between teams.

## Session change ledger (v0.3)

- **Why**: DSH's built-in "changes this turn / deliverables" surface works **per top-level session × single turn**. At the end of a conversation you see only the closing turn; earlier edits sit in their own turn tails; team-dev members are subagents and their edits are excluded by `workspace-changes`' `eligible()`; when the Lead's closing turn only summarizes, the final changes card is empty. A host restart drops the old turn summaries too.
- **What the ledger does**: root-level `fs/*-intent` hooks record every write / edit / delete under the root of the subagent tree; the same path is de-duplicated and accumulates the agents, turns, edit count and a deleted flag. The ledger never changes the tool decision and any recording failure is swallowed so it cannot block a write.
- **UI**: a "files changed in this session" card on `conversation.chat.turnTail`. Every turn tail shows the cumulative ledger **as of that turn**; the latest one is the full session list. Clicking a file calls `openFile`; more than six rows collapse behind a toggle; no file changes means no card at all.
- **Route**: `GET /api/dsh-session-changes/summary?sessionId=<rootSessionId>`, read-only with `cache-control: no-store`; an invalid session id returns 400, an unknown one returns 200 with an empty summary.
- **Boundaries**: file-tool mutations only (write / edit / delete). Pure shell edits (`sed -i`, `git checkout`, ...) do not pass through an fs intent and are not recorded — the same limitation as DSH's `workspace-changes`. The ledger is in memory for now; persistence (`.dsh/session-changes/*.json`) is next.
- **Install**: no extra dependency. The bundle's `cordis.patch.yml` puts two rows in one insert — `dsh-team-dev` and `dsh-team-dev/session-changes`; removing the bundle removes both. To disable only the ledger, drop the `dsh-session-changes` row; the rest of team-dev keeps working.

## Rule system (v0.4)

- **Router**: `skills/team-dev/SKILL.md` only describes stages 0–5 (what to read, what to produce, hard constraints); details live in `skills/team-dev/references/`.
- **L0 is non-overridable**: `references/contract.md` defines safety, quality gates, delivery surface and the final declaration; project rules (L1) may add stricter requirements but cannot override L0.
- **L1 project additions**: `references/project-profile.md` explains how to discover `AGENTS.md` / `CLAUDE.md` / `.dsh/team-guidelines.md` and the files they point to; the project's own §A closing steps run before the L0 delivery decision.
- **L1 defaults**: `references/engineering.md` holds the general engineering rules; project rules may override non-L0 clauses.
- **Quality & delivery**: `references/quality.md` holds G1–G3; `references/delivery.md` holds the artifact routing, `present` usage, report template and final declaration; `references/examples.md` has three closing examples.
- **Delivery surface**: `team-out/*` is evidence, not an artifact. `present` only user-facing reports/documents/spreadsheets/slides (1–3, called by the Lead in the closing turn). With no artifact, say "no standalone deliverable" explicitly.
- Members never call `present`; the Lead makes the delivery decision in the closing turn.

## Verify

```bash
node scripts/build.mjs          # host half → lib/index.js + lib/session-changes.js
node scripts/build-client.mjs   # browser half → lib/client.js (V1–V5 assertions)
node scripts/verify.mjs         # package integrity + client bundle + session-changes contracts
# runtime self-check after install + restart:
grep "dsh-team-dev" "$DSH_HOME/../Logs/DSH Desktop/harness.log" | tail -2
# expect: [dsh-team-dev] budget guard + bundled skills + team board installed
grep "dsh-session-changes" "$DSH_HOME/../Logs/DSH Desktop/harness.log" | tail -1
# expect: [dsh-session-changes] session change ledger installed
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
of truth. The host half is `src/index.js` + `src/host/team-board.js` +
`src/session-changes/index.js`; the browser half is `src/client/`.
`lib/index.js`, `lib/session-changes.js` and `lib/client.js` are build
outputs — never edit them by hand.

```bash
node scripts/build.mjs               # bundle host src/ → lib/index.js + lib/session-changes.js + smoke check
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
bundle loses the loader wrapper, the module id, the `sidebar.right.pane.tab` /
`conversation.chat.turnTail` registration markers, or exceeds 1.5 MB.

## Publish

Two channels, both supported by the DSH market:

1. **npm (recommended)** — the market discovers npm package names with their
   version / `enginesDsh` / peer-dependency facts, and falls back to
   `registry.npmmirror.com` for China. Zero peer dependencies here, so the
   compatibility check always passes.

   ```bash
   npm login            # once; your own account
   npm publish          # publishes dsh-team-dev@0.4.0
   ```

2. **GitHub mirror (optional)** — a public GitHub repo enters the market's
   `github:` compatibility list and doubles as the source page. Gitee is NOT a
   market install host (its archive paths differ); keep it as a mirror only.

Before publishing, replace `repository.url` in `package.json` with your real
repo URL and bump `version` for each release (`node scripts/verify.mjs` first).

## Upgrade self-check (after any DSH upgrade)

1. `grep "dsh-team-dev" <harness.log> | tail -2` — the mount marker must appear, no import errors.
2. `node scripts/verify.mjs` — package integrity (host + client contract + L0 contract + policy).
3. Budget probe: a teammate task with >25 tool calls in one turn must be refused at the 26th; the Lead stays uncapped.
4. Skills probe: type `/` in a session — `team-dev` and `team-boot` must appear in the menu.
5. Board probe: the right sidebar shows the **Team board** tab; with a running team it lists tasks and the team selector. If Agent Teams is absent, it must show the degraded empty state instead of breaking the sidebar.
6. Session ledger probe: run a turn that writes a file; the turn tail must show "files changed in this session" with the file; clicking it opens the file. Pure shell edits are not expected to appear. `curl 'http://127.0.0.1:<port>/api/dsh-session-changes/summary?sessionId=<rootSessionId>'` must return JSON with `plugin: "dsh-session-changes"`.
