/**
 * @dsh-external/ui-archive-manager — browser half.
 * Registers a "归档管理" settings page for listing, restoring, and deleting
 * archived sessions. Confirmation and feedback use the project's built-in
 * Modal / Toast components instead of native alert/confirm.
 */
import React, { useEffect, useState } from 'react'
import { Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'

export const inject = ['slots']

const API_PREFIX = '/@dsh-external/ui-archive-manager/api'
const UNGROUPED_KEY = ''

interface ArchivedSession {
  sessionId: string
  title: string
  cwd?: string
  createdAt: number
  lastActiveAt: number
  live: boolean
  persisted: boolean
}

interface ToastState {
  key: number
  kind: 'success' | 'error'
  text: string
}

interface ConfirmState {
  kind: 'restore' | 'delete'
  ids: string[]
}

interface WorkspaceGroup {
  key: string
  label: string
  sessions: ArchivedSession[]
  visibleSessions: ArchivedSession[]
}

function fmtTime(value: number): string {
  if (!value) return '未知'
  return new Date(value).toLocaleString('zh-CN')
}

function fmtDate(value: number): string {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function toggleInSet(current: Set<string>, key: string): Set<string> {
  const next = new Set(current)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

function workspaceKey(session: ArchivedSession): string {
  return session.cwd ?? UNGROUPED_KEY
}

function workspaceLabel(key: string): string {
  return key === UNGROUPED_KEY ? '(无工作区)' : key
}

function groupSessions(all: ArchivedSession[], visible: ArchivedSession[]): WorkspaceGroup[] {
  const map = new Map<string, { all: ArchivedSession[]; visible: ArchivedSession[] }>()
  for (const session of all) {
    const key = workspaceKey(session)
    const entry = map.get(key)
    if (entry === undefined) map.set(key, { all: [session], visible: [] })
    else entry.all.push(session)
  }
  for (const session of visible) {
    const key = workspaceKey(session)
    const entry = map.get(key)
    if (entry !== undefined) entry.visible.push(session)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({
      key,
      label: workspaceLabel(key),
      sessions: value.all,
      visibleSessions: value.visible,
    }))
}

function ArchiveManagerSection() {
  const [sessions, setSessions] = useState<ArchivedSession[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<ToastState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  function showToast(kind: 'success' | 'error', text: string) {
    setToast({ key: Date.now(), kind, text })
  }

  async function load() {
    setLoading(true)
    try {
      const response = await fetch(`${API_PREFIX}/archived`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '加载归档会话失败')
      setSessions(data.sessions ?? [])
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function performOperation(kind: 'restore' | 'delete', ids: string[]) {
    if (ids.length === 0) return
    setConfirm(null)
    const label = kind === 'restore' ? '恢复' : '永久删除'
    setLoading(true)
    try {
      const response = await fetch(`${API_PREFIX}/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionIds: ids }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `${label}失败`)
      if (kind === 'delete' && (data.errors?.length ?? 0) > 0) {
        showToast('error', `部分删除失败：${data.errors.join('；')}`)
      } else {
        showToast('success', `${label}成功：${kind === 'restore' ? data.restored ?? ids.length : data.deleted?.length ?? ids.length} 个会话`)
      }
      setSelected(new Set())
      await load()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  function requestOperation(kind: 'restore' | 'delete', ids: string[]) {
    if (ids.length === 0) return
    setConfirm({ kind, ids })
  }

  const query = search.trim().toLowerCase()
  const filtered = sessions.filter(session =>
    query === ''
    || session.title.toLowerCase().includes(query)
    || session.sessionId.toLowerCase().includes(query)
    || fmtDate(session.lastActiveAt).includes(query)
    || fmtDate(session.createdAt).includes(query),
  )
  const groups = groupSessions(sessions, filtered)
  const displayGroups = query === '' ? groups : groups.filter(group => group.visibleSessions.length > 0)

  const allFilteredSelected = filtered.length > 0 && filtered.every(session => selected.has(session.sessionId))
  const selectedCount = selected.size

  const pageStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '4px 2px',
    fontSize: 13,
    lineHeight: 1.6,
  }

  const header = React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 12 } },
    React.createElement('h2', { style: { margin: 0, fontSize: 16 } }, '归档管理'),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => void load(),
        disabled: loading,
        style: {
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid var(--dsw-alias-border-primary, #ccc)',
          background: 'transparent',
          cursor: loading ? 'default' : 'pointer',
        },
      },
      loading ? '加载中…' : '刷新',
    ),
    React.createElement('input', {
      type: 'search',
      placeholder: '搜索会话名称 / ID / 日期',
      value: search,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value),
      style: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-primary, #ccc)', background: 'transparent', minWidth: 220 },
    }),
  )

  const toastNode = toast === null
    ? null
    : React.createElement(Toast, {
      key: toast.key,
      text: toast.text,
      onDone: () => setToast(null),
    })

  const batchBar = React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
    React.createElement('input', {
      type: 'checkbox',
      title: allFilteredSelected ? '取消全选当前结果' : '全选当前结果',
      checked: allFilteredSelected,
      disabled: loading || filtered.length === 0,
      onChange: () => {
        if (allFilteredSelected) {
          const next = new Set(selected)
          for (const session of filtered) next.delete(session.sessionId)
          setSelected(next)
        } else {
          setSelected(new Set([...selected, ...filtered.map(session => session.sessionId)]))
        }
      },
      style: { margin: 0 },
    }),
    React.createElement('span', null, `已选 ${selectedCount} 个`),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => requestOperation('restore', [...selected]),
        disabled: loading || selectedCount === 0,
        style: buttonStyle,
      },
      '批量恢复',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => requestOperation('delete', [...selected]),
        disabled: loading || selectedCount === 0,
        style: { ...buttonStyle, color: 'var(--dsw-alias-state-error-primary, #d33)' },
      },
      '批量删除',
    ),
  )

  const sessionCard = (session: ArchivedSession) => {
    const checked = selected.has(session.sessionId)
    return React.createElement(
      'div',
      {
        key: session.sessionId,
        style: { marginTop: 12, padding: '10px 12px', border: '1px solid var(--dsw-alias-border-primary, #e5e5e5)', borderRadius: 8 },
      },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
        React.createElement('input', {
          type: 'checkbox',
          checked,
          onChange: () => setSelected(current => toggleInSet(current, session.sessionId)),
          style: { marginTop: 2 },
        }),
        React.createElement(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontWeight: 600 } }, session.title || '(无标题)'),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)', wordBreak: 'break-all' } },
            `会话 ID：${session.sessionId}`,
          ),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)' } },
            `最后活动/归档参考时间：${fmtTime(session.lastActiveAt)} · 创建时间：${fmtTime(session.createdAt)}`,
          ),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)' } },
            `状态：${session.live ? '当前活跃' : '已持久化'}${session.persisted ? '' : ' / 未找到持久化文件'}`,
          ),
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          React.createElement('button', {
            type: 'button',
            onClick: () => requestOperation('restore', [session.sessionId]),
            disabled: loading,
            style: buttonStyle,
          }, '恢复'),
          React.createElement('button', {
            type: 'button',
            onClick: () => requestOperation('delete', [session.sessionId]),
            disabled: loading,
            style: { ...buttonStyle, color: 'var(--dsw-alias-state-error-primary, #d33)' },
          }, '删除'),
        ),
      ),
    )
  }

  const workspaceNodes = displayGroups.map(group => {
    const workspaceCollapsed = collapsedWorkspaces.has(group.key)
    const allSelected = group.sessions.length > 0 && group.sessions.every(session => selected.has(session.sessionId))

    const headerStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer',
      userSelect: 'none',
    }

    const workspaceHeader = React.createElement(
      'div',
      {
        style: headerStyle,
        onClick: () => setCollapsedWorkspaces(current => toggleInSet(current, group.key)),
      },
      React.createElement('input', {
        type: 'checkbox',
        title: allSelected ? '取消全选' : '全选',
        checked: allSelected,
        disabled: loading || group.sessions.length === 0,
        onClick: (event: React.MouseEvent<HTMLInputElement>) => {
          event.stopPropagation()
        },
        onChange: () => {
          if (allSelected) {
            const next = new Set(selected)
            for (const session of group.sessions) next.delete(session.sessionId)
            setSelected(next)
          } else {
            setSelected(new Set([...selected, ...group.sessions.map(session => session.sessionId)]))
          }
        },
        style: { margin: 0 },
      }),
      React.createElement('span', null, workspaceCollapsed ? '▸' : '▾'),
      React.createElement('span', { style: { fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, wordBreak: 'break-all' } },
        `工作区：${group.label}`,
      ),
      React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)' } },
        `${group.sessions.length} 个会话`,
      ),
    )

    if (workspaceCollapsed) {
      return React.createElement(
        'div',
        { key: group.key, style: { border: '1px solid var(--dsw-alias-border-primary, #e5e5e5)', borderRadius: 8, padding: 12 } },
        workspaceHeader,
      )
    }

    return React.createElement(
      'div',
      { key: group.key, style: { border: '1px solid var(--dsw-alias-border-primary, #e5e5e5)', borderRadius: 8, padding: 12 } },
      workspaceHeader,
      group.visibleSessions.length === 0
        ? React.createElement('div', { style: { marginTop: 12, fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)' } },
          query === '' ? '该工作区暂无会话' : '该工作区没有匹配的会话',
        )
        : group.visibleSessions.map(sessionCard),
    )
  })

  const confirmNode = confirm === null
    ? null
    : React.createElement(
      Modal,
      {
        open: true,
        onClose: () => setConfirm(null),
        title: confirm.kind === 'restore' ? '恢复归档会话' : '永久删除归档会话',
        footer: React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', {
            type: 'button',
            onClick: () => setConfirm(null),
            style: buttonStyle,
          }, '取消'),
          React.createElement('button', {
            type: 'button',
            onClick: () => void performOperation(confirm.kind, confirm.ids),
            disabled: loading,
            style: confirm.kind === 'delete'
              ? { ...buttonStyle, color: 'var(--dsw-alias-state-error-primary, #d33)' }
              : buttonStyle,
          }, confirm.kind === 'restore' ? '确认恢复' : '确认删除'),
        ),
      },
      React.createElement('div', null,
        confirm.kind === 'restore'
          ? `确认恢复选中的 ${confirm.ids.length} 个归档会话？`
          : `确认永久删除选中的 ${confirm.ids.length} 个归档会话？此操作不可恢复！`,
      ),
    )

  return React.createElement('div', { style: pageStyle },
    header,
    toastNode,
    React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)' } }, `共 ${sessions.length} 个归档会话，当前显示 ${filtered.length} 个`),
    batchBar,
    loading && sessions.length === 0
      ? React.createElement('div', null, '加载中…')
      : filtered.length === 0
        ? React.createElement('div', null, '没有匹配的归档会话')
        : workspaceNodes,
    confirmNode,
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-primary, #ccc)',
  background: 'transparent',
  cursor: 'pointer',
}

export function apply(ctx: any): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'archive-manager',
      order: 30,
      label: () => '归档管理',
    }, ArchiveManagerSection),
  )
}
