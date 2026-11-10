/**
 * 「全部团队」总览视图（B0）：一屏看完所有在线团队，不切换会话。
 *
 * 纯展示组件：数据由父组件 TeamBoard 的轮询快照传入（`/api/dsh-team-dev/teams`），
 * 本组件只做排序/筛选/搜索与卡片渲染，不发起请求、不写任何数据。
 * 点击「查看看板」由父组件切回当前会话视图并定位到该团队。
 */
import * as React from 'react'
import { useMemo, useState } from 'react'
import { teamMatchesSession } from './api.js'
import {
  OVERVIEW_FILTERS,
  OVERVIEW_SORTS,
  filterTeams,
  memberInitial,
  overviewSummary,
  overviewTeams,
  sortTeams,
  teamCounts,
  teamDisplayName,
  teamProgress,
  teamState,
} from './overview.js'
import { styles } from './styles.js'

/** 状态徽标样式映射。 */
function stateBadgeStyle(state) {
  if (state === 'active') return { ...styles.overviewBadge, ...styles.overviewBadgeActive }
  if (state === 'pending') return { ...styles.overviewBadge, ...styles.overviewBadgePending }
  return { ...styles.overviewBadge, ...styles.overviewBadgeDone }
}

/**
 * 进度条分段宽度（百分比字符串）。
 * @param value - 该分段计数。
 * @param total - 任务总数。
 * @returns CSS 宽度值。
 */
function segmentWidth(value, total) {
  if (total <= 0) return '0%'
  return `${Math.round((value / total) * 1000) / 10}%`
}

/**
 * 总览统计卡。
 * @param props - `{ label, value, t }`。
 * @returns 统计卡元素。
 */
function StatCard({ label, value }) {
  return (
    <div style={styles.overviewStat}>
      <div style={styles.overviewStatLabel}>{label}</div>
      <div style={styles.overviewStatValue}>{value}</div>
    </div>
  )
}

/**
 * 单张团队卡：名称、状态、成员、进度条、三列计数与「查看看板」。
 * @param props - `{ team, current, t, onOpenTeam }`。
 * @returns 团队卡元素。
 */
function TeamCard({ team, current, t, onOpenTeam }) {
  const counts = teamCounts(team)
  const progress = teamProgress(team)
  const state = teamState(team)
  const members = Array.isArray(team.members) ? team.members : []
  const shown = members.slice(0, 5)
  const cardStyle = current ? { ...styles.overviewCard, ...styles.overviewCardCurrent } : styles.overviewCard
  return (
    <div style={cardStyle}>
      <div style={styles.overviewCardTop}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={styles.overviewName}>{teamDisplayName(team)}</div>
          <div style={styles.overviewId} title={String(team.teamId ?? '')}>{String(team.teamId ?? '')}</div>
        </div>
        {current ? <span style={{ ...styles.overviewBadge, ...styles.overviewBadgeCurrent }}>{t('overview.current')}</span> : null}
        <span style={stateBadgeStyle(state)}>{t(`overview.status.${state}`)}</span>
      </div>
      <div style={styles.overviewMembers}>
        <span style={styles.overviewAvatars}>
          {shown.map((member, index) => (
            <span
              key={String(member && member.id !== undefined ? member.id : index)}
              style={index === 0 ? { ...styles.overviewAvatar, ...styles.overviewAvatarFirst } : styles.overviewAvatar}
              title={member && member.name ? member.name : t('member.unknown')}
            >
              {memberInitial(member)}
            </span>
          ))}
        </span>
        {members.length > shown.length ? (
          <span style={styles.overviewAvatarMore}>{`+${members.length - shown.length}`}</span>
        ) : null}
        <span style={styles.overviewMeta}>
          {`${members.length}${t('overview.members')} · ${counts.total}${t('overview.tasks')}`}
        </span>
      </div>
      <div style={styles.overviewProgressRow}>
        <div style={styles.overviewBar}>
          <span style={{ ...styles.overviewBarDone, width: segmentWidth(progress.completed, counts.total) }} />
          <span style={{ ...styles.overviewBarActive, width: segmentWidth(counts.in_progress, counts.total) }} />
          <span style={{ ...styles.overviewBarPending, flex: '1 1 auto' }} />
        </div>
        <span style={styles.overviewPercent}>{`${progress.completed}/${progress.total} · ${progress.percent}%`}</span>
      </div>
      <div style={styles.overviewCounts}>
        <span>{`${t('column.pending')} ${counts.pending}`}</span>
        <span>{`${t('column.inProgress')} ${counts.in_progress}`}</span>
        <span>{`${t('column.completed')} ${counts.completed}`}</span>
        <button type="button" style={{ ...styles.overviewOpen, marginLeft: 'auto' }} onClick={() => onOpenTeam(team.teamId)}>
          {`${t('overview.open')} →`}
        </button>
      </div>
    </div>
  )
}

/**
 * 全部团队总览。
 * @param props - `{ teams, sessionId, t, loading, degraded, onOpenTeam }`。
 * @returns 总览元素。
 */
export function Overview({ teams, sessionId, t, loading, degraded, onOpenTeam }) {
  const [sort, setSort] = useState('active')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  const list = Array.isArray(teams) ? teams : []
  const summary = useMemo(() => overviewSummary(list), [list])
  const visible = useMemo(() => overviewTeams(list, { filter, sort, query }), [list, filter, sort, query])

  if (loading) {
    return (
      <div style={styles.overviewRoot}>
        <div style={styles.overviewEmpty}>{t('loading')}</div>
      </div>
    )
  }

  if (degraded) {
    return (
      <div style={styles.overviewRoot}>
        <div style={styles.overviewEmpty}>{t('overview.degraded')}</div>
      </div>
    )
  }

  return (
    <div style={styles.overviewRoot}>
      <div style={styles.overviewStats}>
        <StatCard label={t('overview.stats.teams')} value={summary.teams} />
        <StatCard label={t('overview.stats.tasks')} value={summary.tasks} />
        <StatCard label={t('overview.stats.active')} value={summary.inProgress} />
        <StatCard label={t('overview.stats.done')} value={summary.completed} />
      </div>
      <div style={styles.overviewToolbar}>
        <select style={styles.select} value={sort} onChange={event => setSort(event.target.value)} aria-label={t('overview.progress')}>
          {OVERVIEW_SORTS.map(value => (
            <option key={value} value={value}>{t(`overview.sort.${value}`)}</option>
          ))}
        </select>
        <select style={styles.select} value={filter} onChange={event => setFilter(event.target.value)}>
          {OVERVIEW_FILTERS.map(value => (
            <option key={value} value={value}>{t(`overview.filter.${value}`)}</option>
          ))}
        </select>
        <input
          style={styles.overviewSearch}
          type="search"
          value={query}
          placeholder={t('overview.search')}
          onChange={event => setQuery(event.target.value)}
        />
      </div>
      <div style={styles.overviewList}>
        {list.length === 0 ? (
          <div style={styles.overviewEmpty}>{t('overview.empty')}</div>
        ) : visible.length === 0 ? (
          <div style={styles.overviewEmpty}>{t('overview.empty')}</div>
        ) : visible.map(team => (
          <TeamCard
            key={String(team.teamId)}
            team={team}
            current={teamMatchesSession(team, sessionId)}
            t={t}
            onOpenTeam={onOpenTeam}
          />
        ))}
      </div>
    </div>
  )
}

/** 供测试使用的导出（纯函数）；组件本身仍保持零副作用。 */
export { filterTeams, sortTeams }
