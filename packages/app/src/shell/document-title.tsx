import { createEffect, createMemo, onCleanup } from "solid-js"
import type { FormInfo } from "@opencode/client/promise"
import { isBlockingForm } from "@/session/requests/session-request-tree"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal, type ServerCtx } from "@/runtime/server/runtime"
import { projectSettingsKey, useSettings } from "@/settings/model"

export type WorkspaceStatus = "idle" | "running" | "pending"

export type ServerActivity = {
  connected: boolean
  /** Sessions with work in flight, from the server-wide active inventory. */
  busy: readonly string[]
  permissionSessions: readonly string[]
  forms: readonly FormInfo[]
  projectID: (sessionID: string) => string | undefined
  autoApproves: (projectID: string | undefined) => boolean
}

/**
 * Aggregate workspace activity across connected servers. Pending wins over
 * running because a request awaiting the user blocks the work a tab signals.
 * A disconnected server is skipped: its last status is stale and not actionable.
 */
export function workspaceStatus(servers: readonly ServerActivity[]): WorkspaceStatus {
  const connected = servers.filter((server) => server.connected)

  if (connected.some(awaitsUser)) return "pending"

  if (connected.some((server) => server.busy.length > 0)) return "running"

  return "idle"
}

export function composeDocumentTitle(base: string, status: WorkspaceStatus) {
  if (status === "pending") return `❗ ${base}`

  if (status === "running") return `● ${base}`

  return base
}

/**
 * Project workspace activity onto the browser tab title so background tabs show
 * whether any session needs the user (`❗`) or still works (`●`). The title
 * captured at mount is restored on unmount.
 */
export function DocumentTitle() {
  const global = useGlobal()
  const settings = useSettings()
  const base = typeof document === "undefined" ? "" : document.title

  const status = createMemo(() =>
    workspaceStatus(
      global.servers.list().flatMap((conn) => {
        const ctx = global.serverCtx(ServerConnection.key(conn))

        if (!ctx) return []

        return [
          {
            connected: ctx.sdk.connection.status() === "connected",
            busy: busySessions(ctx),
            permissionSessions: ctx.data.session.permission.sessions(),
            forms: ctx.data.session.form
              .sessions()
              .flatMap((sessionID) => ctx.data.session.form.list(sessionID) ?? []),
            projectID: (sessionID: string) => ctx.data.session.get(sessionID)?.projectID,
            autoApproves: (projectID: string | undefined) =>
              settings.permissions.autoApproves(projectSettingsKey(ctx.sdk.scope, projectID)),
          },
        ]
      }),
    ),
  )

  createEffect(() => {
    if (typeof document === "undefined") return
    document.title = composeDocumentTitle(base, status())
  })

  // The event stream does not replay requests asked while this client was
  // disconnected, so a session blocked before a reload would read as merely
  // running. Refetch the active inventory on every connect instead of trusting
  // the cached sync.
  createEffect(() => {
    for (const conn of global.servers.list()) {
      const ctx = global.serverCtx(ServerConnection.key(conn))

      if (!ctx || ctx.sdk.connection.status() !== "connected") continue
      void sweepRequests(ctx)
    }
  })

  onCleanup(() => {
    if (typeof document === "undefined") return
    document.title = base
  })

  return null
}

// Waiting inbox work counts as busy, matching the in-app session tab avatar.
function busySessions(ctx: ServerCtx) {
  return [
    ...ctx.data.session.active(),
    ...ctx.data.session.list().flatMap((session) =>
      ctx.data.session.pending.list(session.id).some((item) => item.type !== "synthetic") ? [session.id] : [],
    ),
  ]
}

// The store snapshot may not have arrived when the connection reports connected, so the
// inventory comes from the server rather than `session.active()`.
async function sweepRequests(ctx: ServerCtx) {
  const active = await ctx.sdk.api.session.active().catch(() => undefined)

  if (!active) return

  await Promise.all(
    Object.keys(active).map(async (sessionID) => {
      ctx.data.session.permission.invalidate(sessionID)
      ctx.data.session.form.invalidate(sessionID)

      await Promise.all([
        ctx.data.session.permission.sync(sessionID).catch(() => undefined),
        ctx.data.session.form.sync(sessionID).catch(() => undefined),
      ])
    }),
  )
}

function awaitsUser(server: ServerActivity) {
  return (
    server.permissionSessions.some((sessionID) => !server.autoApproves(server.projectID(sessionID))) ||
    server.forms.some(isBlockingForm)
  )
}
