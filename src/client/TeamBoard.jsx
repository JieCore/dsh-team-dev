/**
 * 团队看板主体：顶部团队切换 + 成员筛选，主体三列状态板（已完成列可折叠）。
 *
 * 数据全部来自同源只读接口（api.js），组件只做展示与轮询编排，不提供任何写操作。
 * 轮询 5s；document 隐藏时暂停，可见后立即刷新一次；连续失败按 5s/15s/30s 退避；
 * 同一时刻最多一个在途请求（新请求先 abort 旧的）。
 */
import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  BACKOFF_MS,
  POLL_INTERVAL_MS,
  fetchTeam,
  fetchTeams,
  groupTasks,
  pickTeamId,
  shortTeamId,
  taskTotal,
} from './api.js'
import { styles } from './styles.js'

/** 三列状态；labelKey 指向 locale 字典键。 */
const COLUMNS = [
  { status: 'pending', labelKey: 'column.pending' },
  { status: 'in_progress', labelKey: 'column.inProgress' },
  { status: 'completed', labelKey: 'column.completed' },
]

/** 首次加载快照；会话切换时也用它复位（同一引用可让 React 跳过无变化的重渲染）。 */
const INITIAL_SNAPSHOT = {
  status: 'loading',
  teams: [],
  degraded: false,
  reason: null,
  teamId: null,
  team: null,
  error: null,
  updatedAt: null,
  refreshing: false,
}

/**
 * 把时间戳格式化为本地时间字符串。
 * @param value - Date.now() 毫秒值。
 * @returns 可展示的本地时间；无效值返回空串。
 */
function formatTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString()
  } catch {
    // 无效时间戳不阻断看板渲染，只省略时间。
    return ''
  }
}

/**
 * 把错误归一化为可展示文案。
 * @param error - 捕获到的异常。
 * @param t - 已绑定命名空间的翻译函数。
 * @returns 中文/英文错误文案。
 */
function describeError(error, t) {
  if (error instanceof ApiError && error.status === 404) return t('error.teamGone')
  return t('error.load')
}

/**
 * 团队下拉选项文案：lead 名 + 短 teamId + 成员数/任务数（不虚构团队标题）。
 * @param team - /teams 返回的团队列表项。
 * @param t - 翻译函数。
 * @returns 单行选项文案。
 */
function teamOptionLabel(team, t) {
  const lead = team.leadName || 'lead'
  const memberCount = Array.isArray(team.members) ? team.members.length : (Number(team.memberCount) || 0)
  const total = taskTotal(team.taskCounts)
  return `${lead} · ${shortTeamId(team.teamId)} · ${memberCount}${t('unit.member')} · ${total}${t('unit.task')}`
}

/**
 * 成员 chip 的悬浮说明：角色 / 状态 / 模型。
 * @param member - TeamMemberView。
 * @param t - 翻译函数。
 * @returns 以 · 连接的说明文本。
 */
function memberMeta(member, t) {
  const role = member.role === 'lead' ? t('member.lead') : (member.role || '')
  const parts = [role, member.status, member.model].filter(part => typeof part === 'string' && part.length > 0)
  return parts.join(' · ')
}

/**
 * 把 writeScopeWarnings 归一化为可展示文本（类型未定，字符串优先）。
 * @param warnings - TeamTaskView.writeScopeWarnings。
 * @returns 以中文分号连接的文本。
 */
function warningText(warnings) {
  return warnings.map(item => (typeof item === 'string' ? item : String(item))).join('；')
}

/**
 * 单张任务卡：标题、负责人、阻塞/就绪、revision，详情折叠写入范围与 warnings。
 * @param props - `{ task, t, expanded, onToggle }`。
 * @returns 任务卡元素。
 */
function TaskCard({ task, t, expanded, onToggle }) {
  const blockedBy = Array.isArray(task.blockedBy) ? task.blockedBy.filter(Boolean) : []
  const writeScopes = Array.isArray(task.writeScopes) ? task.writeScopes : []
  const warnings = Array.isArray(task.writeScopeWarnings) ? task.writeScopeWarnings : []
  const owner = task.ownerName || t('task.unassigned')
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{task.subject || t('task.untitled')}</div>
      <div style={styles.chipRow}>
        <span style={styles.ownerChip}>{owner}</span>
        {task.ready === false ? (
          <span style={styles.blockedChip}>{`${t('task.blocked')}（${blockedBy.length}）`}</span>
        ) : null}
        <span style={styles.metaChip}>{`${t('task.revision')} ${String(task.revision ?? 0)}`}</span>
        {warnings.length > 0 ? (
          <span style={styles.blockedChip}>{t('task.warnings')}</span>
        ) : null}
      </div>
      {blockedBy.length > 0 ? (
        <div style={styles.depRow}>
          <span style={styles.detailLabel}>{t('task.blockedBy')}</span>
          {blockedBy.map(id => (
            <code key={String(id)} style={styles.depChip}>{shortTeamId(String(id))}</code>
          ))}
        </div>
      ) : null}
      {expanded ? (
        <div style={styles.details}>
          {task.description ? <div style={styles.detailText}>{task.description}</div> : null}
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>{t('task.writeScopes')}</span>
            <span style={styles.detailValue}>
              {writeScopes.length === 0 ? t('task.none') : writeScopes.map(scope => (
                <code key={scope} style={styles.scopeChip}>{scope}</code>
              ))}
            </span>
          </div>
          {warnings.length > 0 ? (
            <div style={styles.warningText}>{`${t('task.warnings')}：${warningText(warnings)}`}</div>
          ) : null}
        </div>
      ) : null}
      <button type="button" style={styles.cardActions} onClick={onToggle}>
        {expanded ? t('task.collapse') : t('task.details')}
      </button>
    </div>
  )
}

/**
 * 看板组件。props 由 slot 运行时提供：session 作用域下含 `sessionId`，
 * 注册时声明的 locale 命名空间提供翻译函数 `t`。
 * @param props - `{ sessionId, t }`。
 * @returns 看板元素。
 */
export function TeamBoard(props) {
  const t = props.t
  const sessionId = props.sessionId
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [memberFilter, setMemberFilter] = useState(null)
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  // 轮询 effect 需要读最新翻译函数，但不应因渲染而重建定时器，故用 ref 传递。
  const translateRef = useRef(t)
  translateRef.current = t
  // 用户手动选择的团队（manualRef）优先于默认算法，避免每次刷新焦点漂移。
  const manualRef = useRef(false)
  const selectedRef = useRef(null)
  const refreshRef = useRef(() => {})

  const { status, teams, degraded, teamId, team, error, updatedAt, refreshing } = snapshot
  const activeTeam = team

  useEffect(() => {
    let disposed = false
    let timer = null
    let controller = null
    let failures = 0
    let generation = 0

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    const abortInFlight = () => {
      if (controller) {
        controller.abort()
        controller = null
      }
    }

    const schedule = delay => {
      if (disposed) return
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        void refresh('poll')
      }, delay)
    }

    /**
     * 拉一次列表 + 当前团队详情，并按结果重排下一次轮询。
     * @param mode - 'initial' | 'poll' | 'manual' | 'visible'。
     */
    async function refresh(mode) {
      if (disposed) return
      const mine = ++generation
      abortInFlight()
      controller = new AbortController()
      const { signal } = controller
      if (mode === 'manual') setSnapshot(prev => ({ ...prev, refreshing: true }))
      let nextDelay = POLL_INTERVAL_MS
      try {
        const teamsPayload = await fetchTeams({ signal })
        if (disposed || mine !== generation) return
        const nextTeams = Array.isArray(teamsPayload && teamsPayload.teams) ? teamsPayload.teams : []
        const degradedNow = Boolean(teamsPayload && teamsPayload.degraded === true)
        const reason = teamsPayload && typeof teamsPayload.reason === 'string' ? teamsPayload.reason : null
        // 手动选择仅在目标团队仍存在时保留，否则交回默认算法。
        const keepManual = manualRef.current && selectedRef.current !== null
          && nextTeams.some(item => item.teamId === selectedRef.current)
        const nextTeamId = pickTeamId(nextTeams, sessionId, selectedRef.current, keepManual)
        manualRef.current = keepManual
        selectedRef.current = nextTeamId
        let nextTeam = null
        let missingTeam = false
        if (nextTeamId !== null) {
          try {
            const detailPayload = await fetchTeam(nextTeamId, { signal })
            if (disposed || mine !== generation) return
            nextTeam = detailPayload && detailPayload.team ? detailPayload.team : null
          } catch (detailError) {
            if (detailError && detailError.name === 'AbortError') throw detailError
            // 团队已不存在：提示并自动回退到第一个团队，再试一次。
            if (detailError instanceof ApiError && detailError.status === 404) {
              missingTeam = true
              const fallbackId = nextTeams.length > 0 ? nextTeams[0].teamId : null
              manualRef.current = false
              selectedRef.current = fallbackId
              if (fallbackId !== null) {
                const retryPayload = await fetchTeam(fallbackId, { signal })
                if (disposed || mine !== generation) return
                nextTeam = retryPayload && retryPayload.team ? retryPayload.team : null
              }
            } else {
              throw detailError
            }
          }
        }
        failures = 0
        setSnapshot({
          status: 'ready',
          teams: nextTeams,
          degraded: degradedNow,
          reason,
          teamId: nextTeamId,
          team: nextTeam,
          error: missingTeam ? { kind: 'not-found' } : null,
          updatedAt: Date.now(),
          refreshing: false,
        })
      } catch (requestError) {
        if (disposed || (requestError && requestError.name === 'AbortError')) return
        failures += 1
        nextDelay = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]
        const message = describeError(requestError, translateRef.current)
        // 保留上次数据，只在顶部显示错误条；首屏失败则显示完整错误态。
        setSnapshot(prev => ({
          ...prev,
          status: prev.team ? 'ready' : 'error',
          error: { kind: 'request', message },
          refreshing: false,
        }))
      } finally {
        if (!disposed && mine === generation) {
          controller = null
          const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
          if (!hidden) schedule(nextDelay)
        }
      }
    }

    const onVisibilityChange = () => {
      if (disposed) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        clearTimer()
        abortInFlight()
      } else {
        clearTimer()
        void refresh('visible')
      }
    }

    manualRef.current = false
    selectedRef.current = null
    setSnapshot(INITIAL_SNAPSHOT)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
    refreshRef.current = () => {
      clearTimer()
      void refresh('manual')
    }
    void refresh('initial')

    return () => {
      disposed = true
      clearTimer()
      abortInFlight()
      refreshRef.current = () => {}
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [sessionId])

  // 切换团队时收起上一团队的任务详情与成员筛选，避免跨团队状态残留。
  useEffect(() => {
    setExpandedTaskId(null)
    setMemberFilter(null)
  }, [teamId])

  const groups = useMemo(() => groupTasks(activeTeam ? activeTeam.tasks : []), [activeTeam])

  const filteredGroups = useMemo(() => {
    if (memberFilter === null) return groups
    const result = {}
    for (const columnStatus of Object.keys(groups)) {
      result[columnStatus] = groups[columnStatus].filter(task => task.ownerName === memberFilter)
    }
    return result
  }, [groups, memberFilter])

  const members = useMemo(() => {
    const list = activeTeam && Array.isArray(activeTeam.members) ? activeTeam.members.slice() : []
    // 只读成员列表的确定性排序（guidelines §5.1）：lead 置顶 → 名称 → id。
    list.sort((left, right) => {
      const lead = Number(right.role === 'lead') - Number(left.role === 'lead')
      if (lead !== 0) return lead
      const byName = String(left.name ?? '').localeCompare(String(right.name ?? ''))
      return byName !== 0 ? byName : String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    return list
  }, [activeTeam])

  const handleRefresh = () => {
    refreshRef.current()
  }

  const handleSelectTeam = event => {
    const nextTeamId = event.target.value
    if (!nextTeamId) return
    manualRef.current = true
    selectedRef.current = nextTeamId
    handleRefresh()
  }

  const errorMessage = error && error.kind === 'request' ? error.message : null
  const teamGone = Boolean(error && error.kind === 'not-found')

  const skeleton = (
    <div style={styles.skeleton}>
      <div style={styles.skeletonTitle}>{t('loading')}</div>
      <div style={styles.skeletonColumns}>
        {COLUMNS.map(column => (
          <div key={column.status} style={styles.skeletonColumn}>
            <div style={styles.skeletonLine} />
            <div style={styles.skeletonCard} />
            <div style={styles.skeletonCard} />
          </div>
        ))}
      </div>
    </div>
  )

  const emptyState = (
    <div style={styles.empty}>
      <div style={styles.emptyTitle}>{degraded ? t('empty.degraded') : t('empty.teams')}</div>
      <button type="button" style={styles.button} onClick={handleRefresh}>{t('refresh')}</button>
    </div>
  )

  const errorState = message => (
    <div style={styles.errorPanel}>
      <div style={styles.emptyTitle}>{message}</div>
      <button type="button" style={styles.button} onClick={handleRefresh}>{t('retry')}</button>
    </div>
  )

  const board = activeTeam ? (
    <div style={styles.content}>
      {members.length > 0 ? (
        <div style={styles.members}>
          <button
            type="button"
            style={memberFilter === null ? { ...styles.filterChip, ...styles.filterChipActive } : styles.filterChip}
            onClick={() => setMemberFilter(null)}
          >
            {t('filter.all')}
          </button>
          {members.map(member => {
            const label = member.name || t('member.unknown')
            const active = memberFilter !== null && memberFilter === member.name
            return (
              <button
                key={String(member.id)}
                type="button"
                title={memberMeta(member, t)}
                style={active ? { ...styles.filterChip, ...styles.filterChipActive } : styles.filterChip}
                onClick={() => {
                  if (!member.name) return
                  setMemberFilter(prev => (prev === member.name ? null : member.name))
                }}
              >
                {member.role === 'lead' ? `${label} · ${t('member.lead')}` : label}
              </button>
            )
          })}
        </div>
      ) : null}
      <div style={styles.columns}>
        {COLUMNS.map(column => {
          const tasks = filteredGroups[column.status] || []
          const collapsed = column.status === 'completed' && !completedOpen
          const columnStyle = collapsed ? { ...styles.column, ...styles.columnCollapsed } : styles.column
          return (
            <section key={column.status} style={columnStyle}>
              {column.status === 'completed' ? (
                <button
                  type="button"
                  style={styles.columnHeadButton}
                  onClick={() => setCompletedOpen(open => !open)}
                >
                  <span style={styles.columnTitle}>{t(column.labelKey)}</span>
                  <span style={styles.count}>{tasks.length}</span>
                  <span style={styles.chevron}>{completedOpen ? '▾' : '▸'}</span>
                </button>
              ) : (
                <div style={styles.columnHead}>
                  <span style={styles.columnTitle}>{t(column.labelKey)}</span>
                  <span style={styles.count}>{tasks.length}</span>
                </div>
              )}
              {collapsed ? null : (
                <div style={styles.taskList}>
                  {tasks.length === 0 ? (
                    <div style={styles.columnEmpty}>{t('tasks.none')}</div>
                  ) : tasks.map(task => (
                    <TaskCard
                      key={String(task.id)}
                      task={task}
                      t={t}
                      expanded={expandedTaskId === task.id}
                      onToggle={() => setExpandedTaskId(prev => (prev === task.id ? null : task.id))}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  ) : null

  let content = skeleton
  if (status !== 'loading' && errorMessage && !activeTeam) content = errorState(errorMessage)
  else if (status !== 'loading' && !activeTeam && teams.length === 0) content = emptyState
  else if (status !== 'loading' && !activeTeam) content = errorState(t('error.load'))
  else if (activeTeam) content = board

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <label style={styles.selectorLabel}>
          {t('team.selector')}
          <select style={styles.select} value={teamId || ''} onChange={handleSelectTeam}>
            {teams.length === 0 ? <option value="">{t('team.none')}</option> : null}
            {teams.map(item => (
              <option key={item.teamId} value={item.teamId}>{teamOptionLabel(item, t)}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          style={refreshing ? { ...styles.button, ...styles.buttonDisabled } : styles.button}
          disabled={refreshing}
          onClick={handleRefresh}
        >
          {refreshing ? t('refresh.running') : t('refresh')}
        </button>
        {updatedAt ? <span style={styles.updated}>{`${t('updated')}${formatTime(updatedAt)}`}</span> : null}
      </div>
      {errorMessage && activeTeam ? (
        <div style={styles.banner}>
          <span style={styles.bannerText}>{errorMessage}</span>
          <button type="button" style={styles.linkButton} onClick={handleRefresh}>{t('retry')}</button>
        </div>
      ) : null}
      {teamGone ? (
        <div style={styles.banner}>
          <span style={styles.bannerText}>{t('error.teamGone')}</span>
        </div>
      ) : null}
      {content}
    </div>
  )
}
