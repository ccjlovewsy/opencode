import type { FormInfo, PermissionRequest, SessionInfo } from "@opencode/client/promise"

function sessionTreeRequest<T>(
  session: SessionInfo[],
  request: Record<string, T[] | undefined> | ((sessionID: string) => T[] | undefined),
  sessionID?: string,
  include: (item: T) => boolean = () => true,
) {
  const ids = sessionTreeIDs(session, sessionID)

  if (!ids.length) return
  // SAFETY: both request sources are caller-typed inputs, not unparsed values; this discriminates the
  // live store accessor from the per-session map so callers can pass either.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above
  const list = (id: string) => (typeof request === "function" ? request(id) : request[id])
  const id = ids.find((id) => list(id)?.some(include))

  if (!id) return

  return list(id)?.find(include)
}

export function sessionTreeIDs(session: SessionInfo[], sessionID?: string) {
  if (!sessionID) return []

  const map = session.reduce((acc, item) => {
    if (!item.parentID) return acc
    const list = acc.get(item.parentID)

    if (list) list.push(item.id)

    if (!list) acc.set(item.parentID, [item.id])

    return acc
  }, new Map<string, string[]>())

  const seen = new Set([sessionID])
  const ids = [sessionID]

  for (const id of ids) {
    const list = map.get(id)

    if (!list) continue

    for (const child of list) {
      if (seen.has(child)) continue
      seen.add(child)
      ids.push(child)
    }
  }

  return ids
}

export function sessionPermissionRequest(
  session: SessionInfo[],
  request: Record<string, PermissionRequest[] | undefined> | ((sessionID: string) => PermissionRequest[] | undefined),
  sessionID?: string,
  include?: (item: PermissionRequest) => boolean,
) {
  return sessionTreeRequest(session, request, sessionID, include)
}

// Forms that block a tool call until the user answers, as opposed to informational forms.
export function isBlockingForm(form: FormInfo) {
  return form.metadata?.kind === "question" || form.metadata?.kind === "websearch.provider"
}

export function sessionFormRequest(
  session: SessionInfo[],
  request: Record<string, FormInfo[] | undefined> | ((sessionID: string) => FormInfo[] | undefined),
  sessionID?: string,
) {
  return sessionTreeRequest(session, request, sessionID, isBlockingForm)
}
