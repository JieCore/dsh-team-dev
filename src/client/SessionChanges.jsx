/**
 * 「本会话累计改动」卡片：挂在 `conversation.chat.turnTail`，从
 * `/api/dsh-session-changes/summary` 读取跨 agent 的会话级账本。
 *
 * 与 DSH 自带「本轮改动」卡片的区别：本卡片统计整个会话（含 team-dev 子代理的
 * 编辑），按文件去重，显示 agent、轮次与编辑次数；没有改动时整张卡不渲染。
 */
import * as React from 'react'

/** host 路由前缀（与 src/session-changes/index.js 的 PREFIX 一致）。 */
const PREFIX = '/api/dsh-session-changes'

/** 折叠状态最多显示的文件行数。 */
const MAX_ROWS = 6

/**
 * 拆分路径：文件名 + 末尾两级目录，长路径不撑破卡片。
 * @param {string} path - 绝对或相对路径。
 * @returns {{name: string, dir: string}} 展示片段。
 */
function splitPath(path) {
  const parts = String(path).split('/').filter(Boolean)
  const name = parts.length > 0 ? parts[parts.length - 1] : String(path)
  const dir = parts.slice(-3, -1).join('/')
  return { name, dir }
}

/**
 * 单行元信息：agent、轮次、编辑次数、是否删除。
 * @param {object} file - 账本文件行。
 * @param {Function} t - locale 绑定。
 * @returns {string} 展示文本。
 */
function detailOf(file, t) {
  const bits = []
  if (Array.isArray(file.agents) && file.agents.length > 0) bits.push(file.agents.join(' · '))
  if (Array.isArray(file.turns) && file.turns.length > 0) bits.push(t('turn', { turn: file.turns.join(',') }))
  if (Number(file.edits) > 1) bits.push(`×${file.edits}`)
  if (file.deleted === true) bits.push(t('deleted'))
  return bits.join(' · ')
}

/**
 * turn tail 卡片。
 * @param {object} props - slot 运行时属性（sessionId、openFile、t）。
 * @returns {JSX.Element|null} 卡片或 null。
 */
export function SessionChanges(props) {
  const { sessionId, openFile, t } = props
  const [data, setData] = React.useState(null)
  const [expanded, setExpanded] = React.useState(false)

  React.useEffect(() => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
    const controller = new AbortController()
    let live = true
    fetch(`${PREFIX}/summary?sessionId=${encodeURIComponent(sessionId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(response => (response.ok ? response.json() : null))
      .then(payload => {
        if (live && payload !== null && Array.isArray(payload.files)) setData(payload)
      })
      .catch(() => {
        // 路由不可用 / 请求取消：不显示卡片，不打扰会话。
      })
    return () => {
      live = false
      controller.abort()
    }
  }, [sessionId])

  if (data === null || data.files.length === 0) return null
  const visible = expanded ? data.files : data.files.slice(0, MAX_ROWS)
  const remaining = data.files.length - MAX_ROWS

  return (
    <section style={styles.root} aria-label={t('title', { total: data.total })}>
      <header style={styles.header}>
        <span style={styles.title}>{t('title', { total: data.total })}</span>
        <span style={styles.meta}>{t('edits', { edits: data.edits })}</span>
      </header>
      <ul style={styles.list}>
        {visible.map(file => {
          const path = splitPath(file.path)
          return (
            <li key={file.path} style={styles.row}>
              <button
                type="button"
                title={file.path}
                style={styles.path}
                onClick={() => {
                  if (typeof openFile === 'function') openFile(file.path)
                }}
              >
                <span style={styles.name}>{path.name}</span>
                {path.dir.length > 0 ? <span style={styles.dir}>{path.dir}</span> : null}
              </button>
              <span style={styles.detail}>{detailOf(file, t)}</span>
            </li>
          )
        })}
      </ul>
      {data.files.length > MAX_ROWS ? (
        <button type="button" style={styles.toggle} onClick={() => setExpanded(value => !value)}>
          {expanded ? t('less') : t('more', { count: remaining })}
        </button>
      ) : null}
    </section>
  )
}

const styles = {
  root: {
    marginTop: '10px',
    border: '1px solid var(--dsh-border, rgba(127, 127, 127, 0.25))',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '6px',
  },
  title: { fontWeight: 600 },
  meta: { opacity: 0.65, flexShrink: 0 },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    minWidth: 0,
  },
  path: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '5px',
    minWidth: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
  },
  dir: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    opacity: 0.5,
    fontSize: '11px',
  },
  detail: { flexShrink: 0, opacity: 0.65, fontSize: '11px' },
  toggle: {
    marginTop: '6px',
    padding: 0,
    border: 0,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    font: 'inherit',
    opacity: 0.7,
  },
}
