/**
 * @dsh-external/ui-archive-manager — host half.
 * Lists archived sessions and supports restore/permanent delete through the
 * workspace registry and session persistence backends.
 */
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'

export const name = '@dsh-external/ui-archive-manager'
export const inject = ['webServer', 'workspaceRegistry', 'sessionQuery', 'sessionPersistence', 'sessions', 'agents']

const API_PREFIX = '/@dsh-external/ui-archive-manager/api'
const ARCHIVED_PATH = '/@dsh-external/ui-archive-manager/api/archived'
const RESTORE_PATH = '/@dsh-external/ui-archive-manager/api/restore'
const DELETE_PATH = '/@dsh-external/ui-archive-manager/api/delete'

interface ArchivedSession {
  sessionId: string
  title: string
  cwd?: string
  createdAt: number
  lastActiveAt: number
  live: boolean
  persisted: boolean
}

interface RawMeta {
  title: string
  lastActiveAt: number
  titleSeq: number
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer | string) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function parseRawMeta(content: string): RawMeta {
  const meta: RawMeta = { title: '', lastActiveAt: 0, titleSeq: -1 }
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue
    try {
      const event = JSON.parse(line)
      if (event === null || typeof event !== 'object') continue
      if (event.type === 'session/title') {
        const title = event.data?.title
        const seq = typeof event.seq === 'number' ? event.seq : -1
        if (typeof title === 'string' && title !== '' && seq >= meta.titleSeq) {
          meta.title = title
          meta.titleSeq = seq
        }
        continue
      }
      if (typeof event.time === 'number' && event.time > meta.lastActiveAt) {
        meta.lastActiveAt = event.time
      }
    } catch {
      // Skip malformed trailing lines.
    }
  }
  return meta
}

async function readArchivedSessionMeta(
  sessionQuery: any,
  sessionPersistence: any,
  sessionId: string,
): Promise<RawMeta> {
  if (sessionPersistence !== undefined) {
    try {
      const artifact = await sessionPersistence.readRaw(sessionId)
      if (artifact?.content) return parseRawMeta(artifact.content)
    } catch {
      // Fall back to the title service below.
    }
  }
  const meta: RawMeta = { title: '', lastActiveAt: 0, titleSeq: -1 }
  if (sessionQuery !== undefined) {
    try {
      const title = await sessionQuery.readTitle(sessionId)
      if (title?.title) meta.title = title.title
    } catch {
      // Leave the title empty.
    }
  }
  return meta
}

async function listArchivedSessions(ctx: Context): Promise<ArchivedSession[]> {
  const workspaceRegistry = (ctx as any).workspaceRegistry
  const sessionQuery = (ctx as any).sessionQuery
  const sessionPersistence = (ctx as any).sessionPersistence
  const archivedIds = new Set((workspaceRegistry.archivedSessionIds ?? []).map((id: any) => String(id)))
  if (archivedIds.size === 0) return []

  let records: any[] = []
  if (sessionQuery !== undefined) {
    try {
      records = await sessionQuery.listSessions()
    } catch {
      records = []
    }
  }
  const recordById = new Map(records.map((record: any) => [String(record.header.id), record]))

  const sessions: ArchivedSession[] = []
  for (const rawId of workspaceRegistry.archivedSessionIds ?? []) {
    const sessionId = String(rawId)
    const record = recordById.get(sessionId)
    const header = record?.header
    const meta = await readArchivedSessionMeta(sessionQuery, sessionPersistence, sessionId)
    sessions.push({
      sessionId,
      title: meta.title,
      ...header?.cwd === undefined ? {} : { cwd: String(header.cwd) },
      createdAt: header?.createdAt ?? 0,
      lastActiveAt: meta.lastActiveAt,
      live: record?.live === true,
      persisted: record?.persisted === true,
    })
  }
  sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  return sessions
}

async function unarchiveSessions(registry: any, sessionIds: readonly string[]): Promise<number> {
  const wanted = new Set(sessionIds)
  let changed = 0
  await registry.enqueueOperation(async () => {
    const state = registry.requireState()
    const next = state.archivedSessionIds.filter((id: any) => !wanted.has(String(id)))
    changed = state.archivedSessionIds.length - next.length
    if (changed === 0) return
    await registry.setState({ ...state, archivedSessionIds: next })
  })
  return changed
}

async function deleteSessionFiles(sessionPersistence: any, header: any): Promise<void> {
  const location = sessionPersistence?.locate?.(header)
  if (location?.path === undefined) return
  await rm(dirname(location.path), { recursive: true, force: true })
}

/**
 * Remove a session from the live in-memory registries so a permanently
 * deleted archived session does not resurface under "未分组" (ungrouped).
 * The host has no public destroy API, so this uses the same registry-private
 * state that the plugin already relies on for unarchiving.
 */
async function removeLiveSession(ctx: Context, sessionId: string): Promise<void> {
  const sessions = (ctx as any).sessions
  const agents = (ctx as any).agents
  const registry = (ctx as any).workspaceRegistry

  const agent = agents?.get?.(sessionId)
  if (agent !== undefined) {
    try {
      agent.cancel?.({ kind: 'user' } as any)
      await agent.whenIdle?.()
    } catch {
      // Continue removing the registry entry even if cancellation is noisy.
    }
    const entry = agents.store?.get?.(sessionId)
    if (entry !== undefined) agents.detachEntered?.(entry)
  }

  const session = sessions?.get?.(sessionId)
  if (session !== undefined) {
    const entry = sessions.store?.get?.(sessionId)
    if (entry !== undefined) sessions.detachEntered?.(entry)
  }

  registry?.headers?.delete?.(sessionId)
  registry?.sessionPaths?.delete?.(sessionId)
  registry?.invalidSessionPaths?.delete?.(sessionId)
}

export function apply(ctx: Context): void {
  ctx.effect(() => (ctx as any).webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const pathname = url.pathname
      const registry = (ctx as any).workspaceRegistry
      const sessionQuery = (ctx as any).sessionQuery
      const sessionPersistence = (ctx as any).sessionPersistence
      if (registry === undefined) {
        sendJson(res, 503, { error: 'workspace registry is unavailable' })
        return
      }

      if (req.method === 'GET' && pathname === ARCHIVED_PATH) {
        try {
          const sessions = await listArchivedSessions(ctx)
          sendJson(res, 200, { sessions })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(res, 500, { error: message })
        }
        return
      }

      if ((req.method === 'POST' && (pathname === RESTORE_PATH || pathname === DELETE_PATH))) {
        let sessionIds: unknown
        try {
          sessionIds = JSON.parse(await readBody(req)).sessionIds
        } catch {
          sendJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        if (!Array.isArray(sessionIds) || sessionIds.some(id => typeof id !== 'string' || id === '')) {
          sendJson(res, 400, { error: 'sessionIds must be an array of non-empty strings' })
          return
        }
        const ids = sessionIds as string[]
        try {
          if (pathname === RESTORE_PATH) {
            const changed = await unarchiveSessions(registry, ids)
            sendJson(res, 200, { ok: true, restored: changed })
            return
          }

          const deleted: string[] = []
          const errors: string[] = []
          for (const sessionId of ids) {
            try {
              let header: any
              if (sessionQuery !== undefined) {
                try {
                  const records = await sessionQuery.listSessions()
                  const record = records.find((candidate: any) => String(candidate.header.id) === sessionId)
                  header = record?.header
                } catch {
                  header = undefined
                }
              }
              if (header === undefined && sessionPersistence !== undefined) {
                try {
                  const artifact = await sessionPersistence.readRaw(sessionId)
                  header = artifact?.meta
                } catch {
                  header = undefined
                }
              }
              if (header === undefined) {
                errors.push(`${sessionId}: session log not found`)
                continue
              }
              await unarchiveSessions(registry, [sessionId])
              for (const workspace of registry.list?.() ?? []) {
                const idsInWorkspace = workspace.sessionIds ?? []
                if (idsInWorkspace.some((id: any) => String(id) === sessionId)) {
                  await workspace.detachSession(header.id ?? sessionId)
                }
              }
              await removeLiveSession(ctx, sessionId)
              await deleteSessionFiles(sessionPersistence, header)
              deleted.push(sessionId)
            } catch (error) {
              errors.push(`${sessionId}: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
          sendJson(res, 200, { ok: true, deleted, errors })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(res, 500, { error: message })
        }
        return
      }

      sendJson(res, 404, { error: 'not found' })
    },
  }), '@dsh-external/ui-archive-manager: api')
}
