// agents/runtime/jira-client.js
// Generic Jira Cloud REST API v3 client — parallel to mcp-client.js. Any agent
// can import this (not just qa-reporter), but WRITING to Jira is a real external
// action: callers must gate it behind an explicit per-call confirmation, never
// a persistent flag or env var (see agents/qa-reporter/knowledge/jira-integration.md
// — this tier is stricter than the MCP Playwright confirmation tier).
//
// Uses Jira Cloud REST API v3 directly (Basic Auth: email + API token) rather
// than an MCP wrapper package — no verified/maintained @modelcontextprotocol
// Jira server was found at the time this was built, and the REST API is Atlassian's
// own stable, documented surface, so this avoids depending on an unproven package.
// UNVERIFIED against a real Jira instance (no credentials available in this repo)
// — first real use should sanity-check the payload shape against actual project's
// issue type/field scheme (custom fields, required fields vary per Jira project).

import dotenv from "dotenv";
dotenv.config();

function credentials() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      "Jira credentials missing.\n" +
      "  1. Copy .env.example to .env (if not already)\n" +
      "  2. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY\n" +
      "  3. Get an API token from https://id.atlassian.com/manage-profile/security/api-tokens"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), email, apiToken };
}

function authHeader({ email, apiToken }) {
  const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return `Basic ${token}`;
}

function toADF(text) {
  // Jira Cloud v3 requires description/comment body as Atlassian Document Format,
  // not a plain string — this wraps plain text into the minimal valid ADF shape.
  return { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function jiraFetch(path, { method = "GET", body } = {}) {
  const creds = credentials();
  const res = await fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Jira ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Create a Jira issue. Caller (qa-reporter) is responsible for the explicit
 * per-call confirmation gate — this function itself does not ask, it executes.
 */
export async function createIssue({ projectKey, issueType, summary, description, labels = [], priority }) {
  const creds = credentials();
  const data = await jiraFetch("/rest/api/3/issue", {
    method: "POST",
    body: {
      fields: {
        project: { key: projectKey || process.env.JIRA_PROJECT_KEY },
        summary,
        issuetype: { name: issueType },
        description: toADF(description),
        labels,
        ...(priority ? { priority: { name: priority } } : {}),
      },
    },
  });
  return { key: data.key, url: `${creds.baseUrl}/browse/${data.key}` };
}

export async function addComment({ issueKey, body }) {
  return jiraFetch(`/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    body: { body: toADF(body) },
  });
}
