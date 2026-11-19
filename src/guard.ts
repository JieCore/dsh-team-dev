// Hand-written master source of the budget guard (single source of truth) — do not edit.

import { createUserMessage } from './provider.js'
import { normalizePolicy, softNotice, finalNotice, hardFeedback, type PolicyConfig } from './policy.ts'
/**
 * Per-agent, per-turn tool-call budget guard. The plugin itself mounts on the
 * host plane, then installs its observers into every agent's own context
 * (the same pattern `tool-agent-team` uses for scoped tools), so each agent's
 * tool calls flow through a listener tagged with that agent's scope even when
 * preset compositions isolate sibling agents. It counts the tracked tool
 * calls an agent makes inside one turn, injects a warning at the soft
 * threshold, and — once the hard threshold is crossed — refuses non-allowlisted
 * calls before they run, directing the agent to hand off. The counter and the
 * exit predicate live outside the model's control; the allowlist keeps a
 * completion path (write handoff, update task, report) open. Budgets reset
 * when a new user-sourced message starts a turn.
 * @module @deepseek-ai/dsh-step-budget-guard
 */




/**
 * The `{kind:'plugin'}` source stamped on every notice this guard injects —
 * the label is load-bearing (an unlabeled context would render as a user
 * prompt in derived history).
 */
const PLUGIN_SOURCE: MessageSource = { kind: 'plugin', plugin: 'dsh-team-dev' }

/** Compile one `*`-wildcard pattern to an anchored RegExp (every other regex metacharacter is matched literally). */
function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`)
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`)
}

/** Prepend the guard's notice while preserving every downstream context's source and metadata. */
function prependContext(ours: UserMessage, theirs: UserMessage[] | undefined): UserMessage[] {
  return [ours, ...theirs ?? []]
}

/** Fold a notice onto whatever decision came back — a blocked call still gets the nudge. */
function foldNotice(downstream: PostToolDecision, notice: UserMessage): PostToolDecision {
  if (downstream.kind === 'block') {
    return { kind: 'block', feedback: downstream.feedback, additionalContexts: prependContext(notice, downstream.additionalContexts) }
  }
  return { ...downstream, additionalContexts: prependContext(notice, downstream.additionalContexts) }
}

/**
 * Install the guard's per-agent observers.
 * @param ctx - host-plane plugin context; `agents` gives the live registry.
 * @param config - runtime policy; thresholds and the completion allowlist are
 *   normalized once here, then shared by every agent observer.
 */
export function guardApply(ctx, config: PolicyConfig = {}): void {
  const policy = normalizePolicy(config)
  const { softThreshold, hardThreshold } = policy
  const allowPatterns = policy.allow.map(wildcardToRegExp)
  const includePatterns = policy.include.map(wildcardToRegExp)
  const excludePatterns = policy.exclude.map(wildcardToRegExp)

  /**
   * Team-membership probe for `onlyTeamMembers`. The Agent Teams package is
   * experimental and never imported here; the service is read by name and
   * duck-typed so this release package keeps no dependency on it.
   *
   * The service resolves LAZILY, on the first budgeted() call: the desktop
   * profile mounts the Agent Teams bundle after this plugin row composes, so
   * at apply time `ctx.get('agentTeams')` is still `undefined` and an
   * apply-time snapshot would freeze the guard transparent forever (measured:
   * three desktop rounds where the guard loaded but never budgeted anyone).
   * The first successful lookup is cached; until then every call re-probes,
   * which is a cheap service-store read.
   */
  // Absence is never cached: the service may mount after the first call
  // (team sessions activate lazily), so re-probe until one is found.
  type TeamServiceLike = {
    tryMembership?: (agent: Agent) => { role?: string } | undefined
    isEnabled?: (agent: Agent) => boolean
  }
  let cachedTeams: TeamServiceLike | undefined
  function teams(): TeamServiceLike | undefined {
    if (cachedTeams === undefined) {
      cachedTeams = ctx.get('agentTeams') as typeof cachedTeams
    }
    return cachedTeams
  }

  /** The root Agent of this agent's subagent tree (DSH ≥ 0.2.2 Team identity). */
  function rootOfAgent(agent: Agent): Agent {
    let subagents: { rootOf?: (agent: Agent) => Agent | undefined } | undefined
    try {
      subagents = ctx.get('subagents') as typeof subagents
    } catch {
      return agent
    }
    if (subagents === undefined || subagents === null || typeof subagents.rootOf !== 'function') return agent
    try {
      return subagents.rootOf(agent) ?? agent
    } catch {
      return agent
    }
  }

  /** The agent's Team role, or undefined for a non-member. */
  function memberRole(agent: Agent): 'lead' | 'teammate' | undefined {
    const service = teams()
    if (service === undefined) return undefined
    if (typeof service.tryMembership === 'function') {
      const role = service.tryMembership(agent)?.role
      return role === 'lead' || role === 'teammate' ? role : undefined
    }
    // DSH ≥ 0.2.2 removed tryMembership: a tree is a Team when its root enabled
    // Team mode, the root is the Lead, and every descendant is a teammate.
    if (typeof service.isEnabled !== 'function') return undefined
    let enabled = false
    try {
      enabled = service.isEnabled(agent) === true
    } catch {
      return undefined
    }
    if (!enabled) return undefined
    return rootOfAgent(agent) === agent ? 'lead' : 'teammate'
  }

  /** Whether an agent participates in the budget at all. */
  function budgeted(agent: Agent): boolean {
    if (!policy.onlyTeamMembers) return true
    const role = memberRole(agent)
    // A non-member (service absent yet, or a plain agent) is not budgeted:
    // stay transparent instead of silently bounding agents the deployment
    // never asked to bound.
    return role === 'teammate'
  }

  /**
   * Whether injected notice messages survive the session format. Teammate
   * sessions run under the subagent producer chain, whose v4 format rejects
   * injected messages without a producer-owned source kind (measured: a soft
   * notice crashed the turn at the 20th call). Non-member sessions — the
   * Lead, and any agent under `onlyTeamMembers: false` with no Team
   * membership — accept plugin-sourced notices. Teammates therefore never
   * receive injected notices: their only model-visible budget signal is the
   * denial feedback on the refused call, which rides the session-owned tool
   * error result.
   */
  function noticesAllowed(agent: Agent): boolean {
    return memberRole(agent) !== 'teammate'
  }

  /** Whether a tool participates in the counter (untracked calls neither count nor block). */
  function tracked(toolName: string): boolean {
    if (includePatterns.length > 0 && !includePatterns.some(pattern => pattern.test(toolName))) return false
    return !excludePatterns.some(pattern => pattern.test(toolName))
  }

  /** Whether a tool stays executable after the hard threshold (it still counts). */
  function allowed(toolName: string): boolean {
    return allowPatterns.some(pattern => pattern.test(toolName))
  }

  const counters = new WeakMap<Agent, number>()

  /**
   * Advance the calling agent's counter and clamp at hard+1 so repeated
   * refused calls do not grow the count (and the feedback number) without
   * bound.
   */
  function advance(agent: Agent): number {
    const count = (counters.get(agent) ?? 0) + 1
    counters.set(agent, count > hardThreshold ? hardThreshold + 1 : count)
    return count
  }

  /**
   * Attach the three observers to one agent's own context. Registration on
   * `agent.ctx` tags the listeners with that agent's scope, which is the only
   * tag the scoped tool waterfall admits for its calls — a host-plane or root
   * listener is invisible to agents composed inside preset isolate realms.
   * All listeners share one counter map; `onlyTeamMembers` still decides who
   * is budgeted at call time.
   */
  function install(agent: Agent): () => void {
    const scoped = agent.ctx
    const disposePre = scoped.on('tools/pre-execute', (exec: ToolExecution, next): Promise<PreToolDecision> => {
      if (exec.agent === undefined) return next()
      if (!budgeted(exec.agent) || !tracked(exec.name) || allowed(exec.name)) return next()
      const used = counters.get(exec.agent) ?? 0
      if (used >= hardThreshold) {
        return Promise.resolve({ kind: 'deny', reason: hardFeedback(used, policy) })
      }
      return next()
    })
    const disposePost = scoped.on('tools/post-execute', async (exec: ToolExecution, _result, next): Promise<PostToolDecision> => {
      const downstream = await next()
      if (exec.agent === undefined) return downstream
      if (!budgeted(exec.agent) || !tracked(exec.name)) return downstream
      const count = advance(exec.agent)
      if (!noticesAllowed(exec.agent)) return downstream
      if (count === softThreshold) {
        return foldNotice(downstream, createUserMessage({
          content: [{ type: 'text', text: softNotice(count, policy) }],
          source: { ...PLUGIN_SOURCE, form: 'notice', summary: `step budget ${count}/${hardThreshold}` },
        }))
      }
      if (count === hardThreshold) {
        return foldNotice(downstream, createUserMessage({
          content: [{ type: 'text', text: finalNotice(count, policy) }],
          source: { ...PLUGIN_SOURCE, form: 'notice', summary: `step budget ${count}/${hardThreshold}` },
        }))
      }
      return downstream
    })
    const disposeStep = scoped.on('agent/pre-step', ({ agent: stepper, messages }, next): Promise<PreStepDecision> => {
      if (messages.some(message => message.source.kind === 'user')) counters.delete(stepper)
      return next()
    })
    return () => { disposePre(); disposePost(); disposeStep() }
  }

  const installed = new Map<Agent, () => void>()
  const maybeInstall = (agent: Agent): void => {
    if (installed.has(agent)) return
    installed.set(agent, install(agent))
  }
  for (const agent of ctx.agents.list()) maybeInstall(agent)
  ctx.on('agent/created', ({ agent }) => { maybeInstall(agent) })
  ctx.on('agent/disposed', ({ agent }) => {
    installed.get(agent)?.()
    installed.delete(agent)
  })
  ctx.effect(() => () => {
    for (const dispose of installed.values()) dispose()
    installed.clear()
  }, 'step-budget-guard.perAgentObservers()')

  // One mount line, deliberately loud enough for a deployment self-check:
  // grep the harness log for this marker after any DSH upgrade.
  console.error('[dsh-team-dev:guard] per-agent observer installed')
}
