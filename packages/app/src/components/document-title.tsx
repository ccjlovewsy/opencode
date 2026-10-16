import { createEffect, createMemo, onCleanup } from "solid-js"
import { useGlobal } from "@/context/global"
import { usePermission } from "@/context/permission"
import { ServerConnection } from "@/context/server"
import { composeDocumentTitle, workspaceStatus } from "./workspace-status"

/**
 * Project workspace activity onto the browser tab title so background tabs show
 * whether any session needs the user (`❗`) or still works (`●`). The title
 * captured at mount is restored on unmount.
 */
export function DocumentTitle() {
  const global = useGlobal()
  const permission = usePermission()
  const base = typeof document === "undefined" ? "" : document.title

  const status = createMemo(() =>
    workspaceStatus(
      global.servers.list().map((conn) => {
        const key = ServerConnection.key(conn)
        const ctx = global.ensureServerCtx(conn)
        const data = ctx.sync.session.data
        const state = permission.ensureServerState(key)
        return {
          // Health is polled, so an unchecked server (undefined) is treated as
          // connected rather than hiding live status until the first probe.
          connected: global.servers.health[key]?.healthy !== false,
          busy: Object.keys(data.session_status).filter((sessionID) => data.session_working(sessionID)),
          permissionSessions: Object.entries(data.permission)
            .filter(([, requests]) => requests.length > 0)
            .map(([sessionID]) => sessionID),
          questions: Object.values(data.question).flat(),
          autoAccepts: (sessionID: string) =>
            state.isAutoAccepting(sessionID, ctx.sync.session.get(sessionID)?.directory),
        }
      }),
    ),
  )

  createEffect(() => {
    if (typeof document === "undefined") return
    document.title = composeDocumentTitle(base, status())
  })

  onCleanup(() => {
    if (typeof document === "undefined") return
    document.title = base
  })

  return null
}
