/**
 * 客户端入口：把「团队看板」注册为右侧栏的一个 tab 类型 + body。
 *
 * 两阶段注册（与官方 ui-sidebar-files 同路径，见 harness
 * packages/client/ui-sidebar-files/src/client/index.ts）：
 * 1. `ctx.sidebarRightTabs.register(definition)` 登记 tab 类型；
 * 2. `ctx.slots.register({ name: 'sidebar.right.pane.tab', key })` 把 body 挂到
 *    keyed seat，key 与 tab 类型 id 对齐。
 * 两个注册都放在 `ctx.effect` 里，插件卸载时由宿主自动清理。
 *
 * 若部署未提供 `sidebarRightTabs`（非默认 web-app 组装），本模块 inject 不满足
 * 而不会挂载；host 半侧接口不受影响（design §1.5 允许的降级）。
 */
import * as React from 'react'
import { TeamBoard } from './TeamBoard.jsx'
import { styles } from './styles.js'

/** 本包的 locale 命名空间与 tab 类型 id。 */
const NS = 'dsh-team-dev'
const BOARD_ID = 'dsh-team-dev'

/** 所需宿主服务：slot 注册、文案、右侧栏 tab 类型注册表。 */
export const inject = ['slots', 'locale', 'sidebarRightTabs']

/** 中文文案（键集合与英文一一对应）。 */
const zh = {
  'tab.title': '团队看板',
  'tab.description': '查看当前团队的任务看板、成员与阻塞状态（只读）。',
  'team.selector': '团队',
  'team.none': '暂无团队',
  'unit.member': '人',
  'unit.task': '项',
  refresh: '刷新',
  'refresh.running': '刷新中…',
  updated: '最后更新 ',
  retry: '重试',
  loading: '正在加载团队看板…',
  degraded: '此部署未启用 Agent Teams（agentTeams 服务不可用）。',
  'empty.teams': '当前没有团队；用 team-dev / team-boot 技能开团后这里会出现。',
  'empty.degraded': '此部署未启用 Agent Teams（agentTeams 服务不可用）。',
  'error.load': '看板数据加载失败，请稍后重试。',
  'error.teamGone': '该团队已不存在，已自动切换到第一个团队。',
  'error.boundary': '看板渲染异常',
  'filter.all': '全部成员',
  'member.lead': 'Lead',
  'member.unknown': '未命名成员',
  'column.pending': '待处理',
  'column.inProgress': '进行中',
  'column.completed': '已完成',
  'tasks.none': '暂无任务',
  'task.untitled': '（无标题）',
  'task.unassigned': '未分配',
  'task.blocked': '阻塞',
  'task.revision': '版本',
  'task.details': '详情',
  'task.collapse': '收起',
  'task.blockedBy': '依赖',
  'task.writeScopes': '写入范围',
  'task.warnings': '范围冲突',
  'task.none': '无',
}

/** 英文文案。 */
const en = {
  'tab.title': 'Team board',
  'tab.description': 'Read-only view of the current team: tasks, members, and blockers.',
  'team.selector': 'Team',
  'team.none': 'No teams',
  'unit.member': ' members',
  'unit.task': ' tasks',
  refresh: 'Refresh',
  'refresh.running': 'Refreshing…',
  updated: 'Updated ',
  retry: 'Retry',
  loading: 'Loading team board…',
  degraded: 'Agent Teams is not enabled in this deployment (agentTeams service unavailable).',
  'empty.teams': 'No teams yet. Start one with the team-dev / team-boot skill and it will show up here.',
  'empty.degraded': 'Agent Teams is not enabled in this deployment (agentTeams service unavailable).',
  'error.load': 'Failed to load the board. Please try again later.',
  'error.teamGone': 'That team no longer exists; switched to the first team.',
  'error.boundary': 'The board failed to render',
  'filter.all': 'All members',
  'member.lead': 'Lead',
  'member.unknown': 'Unnamed member',
  'column.pending': 'Pending',
  'column.inProgress': 'In progress',
  'column.completed': 'Completed',
  'tasks.none': 'No tasks',
  'task.untitled': '(untitled)',
  'task.unassigned': 'Unassigned',
  'task.blocked': 'Blocked',
  'task.revision': 'rev',
  'task.details': 'Details',
  'task.collapse': 'Collapse',
  'task.blockedBy': 'Blocked by',
  'task.writeScopes': 'Write scopes',
  'task.warnings': 'Write-scope warnings',
  'task.none': 'none',
}

/**
 * 看板渲染边界：单个组件异常只显示占位，不拖垮整个右侧栏。
 */
class BoardBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    // 只兜渲染异常：不写日志、不展示内部细节，避免影响宿主 UI。
  }

  render() {
    if (!this.state.failed) return this.props.children
    const translate = typeof this.props.t === 'function' ? this.props.t : null
    return <div style={styles.boundary}>{translate ? translate('error.boundary') : '看板渲染异常'}</div>
  }
}

/**
 * 注册到 slot 的组件：包一层 ErrorBoundary 后渲染看板。
 * @param props - slot 运行时提供的 `sessionId` 与 locale 的 `t`。
 * @returns 看板元素。
 */
function TeamBoardBody(props) {
  return (
    <BoardBoundary t={props.t}>
      <TeamBoard {...props} />
    </BoardBoundary>
  )
}

/**
 * 插件客户端入口。
 * @param ctx - 客户端插件上下文（提供 slots / locale / sidebarRightTabs）。
 */
export function apply(ctx) {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-team-dev: dictionaries')
  // 阶段一：登记 tab 类型。guide 条目让用户能在右侧栏引导页打开看板。
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: BOARD_ID,
    kind: 'team-board',
    title: () => t('tab.title'),
    guide: [
      {
        order: 500,
        title: () => t('tab.title'),
        description: () => t('tab.description'),
      },
    ],
  }), 'dsh-team-dev: board tab type')
  // 阶段二：把 body 注册进 keyed session slot，key 与 tab 类型 id 对齐。
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: BOARD_ID,
    locale: NS,
  }, TeamBoardBody)), 'dsh-team-dev: board tab body')
}
