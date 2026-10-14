import { expect, test } from "bun:test"
import type { FormInfo } from "@opencode/client/promise"
import { composeDocumentTitle, workspaceStatus, type ServerActivity, type WorkspaceStatus } from "./document-title"

function activity(input: Partial<ServerActivity> = {}): ServerActivity {
  return {
    connected: true,
    busy: [],
    permissionSessions: [],
    forms: [],
    projectID: () => undefined,
    autoApproves: () => false,
    ...input,
  }
}

const question: FormInfo = {
  id: "frm_question",
  sessionID: "ses_child",
  title: "Question",
  metadata: { kind: "question" },
  fields: [{ key: "answer", type: "string", required: true, custom: false }],
}

const elicitation: FormInfo = {
  ...question,
  id: "frm_elicitation",
  metadata: { kind: "mcp-elicitation" },
}

test.each<[string, ServerActivity[], WorkspaceStatus]>([
  ["no servers", [], "idle"],
  ["idle workspace", [activity()], "idle"],
  ["running session", [activity({ busy: ["ses_parent"] })], "running"],
  ["disconnected server", [activity({ connected: false, busy: ["ses_parent"] })], "idle"],
  ["pending permission", [activity({ permissionSessions: ["ses_child"] })], "pending"],
  ["disconnected permission", [activity({ connected: false, permissionSessions: ["ses_child"] })], "idle"],
  ["auto-approved permission", [activity({ permissionSessions: ["ses_child"], autoApproves: () => true })], "idle"],
  ["blocking question", [activity({ busy: ["ses_parent"], forms: [question] })], "pending"],
  ["informational form", [activity({ forms: [elicitation] })], "idle"],
])("workspace status is %s", (_case, servers, expected) => {
  expect(workspaceStatus(servers)).toBe(expected)
})

test("auto-approve follows the requesting session's project", () => {
  const projects = new Map([
    ["ses_covered", "prj_covered"],
    ["ses_other", "prj_other"],
  ])

  const server = activity({
    projectID: (sessionID) => projects.get(sessionID),
    autoApproves: (projectID) => projectID === "prj_covered",
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
