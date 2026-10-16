import { expect, test } from "bun:test"
import type { QuestionRequest } from "@opencode-ai/sdk/v2/client"
import { composeDocumentTitle, workspaceStatus, type ServerActivity, type WorkspaceStatus } from "./workspace-status"

function activity(input: Partial<ServerActivity> = {}): ServerActivity {
  return {
    connected: true,
    busy: [],
    permissionSessions: [],
    questions: [],
    autoAccepts: () => false,
    ...input,
  }
}

const question: QuestionRequest = {
  id: "qst_1",
  sessionID: "ses_child",
  questions: [{ question: "Continue?", header: "Confirm", options: [] }],
}

test.each<[string, ServerActivity[], WorkspaceStatus]>([
  ["no servers", [], "idle"],
  ["idle workspace", [activity()], "idle"],
  ["running session", [activity({ busy: ["ses_parent"] })], "running"],
  ["disconnected server", [activity({ connected: false, busy: ["ses_parent"] })], "idle"],
  ["pending permission", [activity({ permissionSessions: ["ses_child"] })], "pending"],
  ["disconnected permission", [activity({ connected: false, permissionSessions: ["ses_child"] })], "idle"],
  ["auto-accepted permission", [activity({ permissionSessions: ["ses_child"], autoAccepts: () => true })], "idle"],
  ["blocking question", [activity({ busy: ["ses_parent"], questions: [question] })], "pending"],
  ["pending wins over running", [activity({ busy: ["ses_parent"], permissionSessions: ["ses_child"] })], "pending"],
])("workspace status is %s", (_case, servers, expected) => {
  expect(workspaceStatus(servers)).toBe(expected)
})

test("auto-accept follows the requesting session", () => {
  const server = activity({
    autoAccepts: (sessionID) => sessionID === "ses_covered",
  })

  expect(workspaceStatus([{ ...server, permissionSessions: ["ses_covered"] }])).toBe("idle")
  expect(workspaceStatus([{ ...server, permissionSessions: ["ses_other"] }])).toBe("pending")
})

test.each<[WorkspaceStatus, string]>([
  ["pending", "❗ OpenCode"],
  ["running", "● OpenCode"],
  ["idle", "OpenCode"],
])("document title with %s status", (status, expected) => {
  expect(composeDocumentTitle("OpenCode", status)).toBe(expected)
})
