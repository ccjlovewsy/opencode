import type { QuestionRequest } from "@opencode-ai/sdk/v2/client"

export type WorkspaceStatus = "idle" | "running" | "pending"

export type ServerActivity = {
  connected: boolean
  /** Sessions with work in flight, from the server-wide session status. */
  busy: readonly string[]
  permissionSessions: readonly string[]
  questions: readonly QuestionRequest[]
  autoAccepts: (sessionID: string) => boolean
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

function awaitsUser(server: ServerActivity) {
  return server.permissionSessions.some((sessionID) => !server.autoAccepts(sessionID)) || server.questions.length > 0
}
