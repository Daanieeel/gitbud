import { describe, expect, it, mock, spyOn, beforeEach } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToString } from "react-dom/server";
import { usePullRequestMeta } from "./usePullRequestMeta";
import { api } from "@/lib/tauri";
import type { PullRequest } from "@/lib/types";

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: "t",
    body: null,
    state: "open",
    draft: false,
    html_url: "",
    author_login: "a",
    author_avatar_url: "",
    head_ref: "feature",
    head_sha: "abc",
    base_ref: "main",
    base_sha: "def",
    merged: false,
    mergeable: null,
    labels: [],
    mergeable_state: null,
    requested_reviewers: [],
    requested_teams: [],
    assignees: [],
    milestone: null,
    locked: false,
    active_lock_reason: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const repoPath = "/test/repo";
const login = "octocat";

function setupHook(seed: PullRequest | null, pollIntervalMs: number | null = null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  let result!: ReturnType<typeof usePullRequestMeta>;
  function TestComponent() {
    result = usePullRequestMeta(repoPath, login, seed, pollIntervalMs);
    return null;
  }

  renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(TestComponent)),
  );

  return {
    qc,
    get result() {
      return result;
    },
  };
}

describe("usePullRequestMeta", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("paints instantly from the list-sourced seed via initialData", () => {
    const seed = pr();
    const { result } = setupHook(seed);
    expect(result.data).toEqual(seed);
  });

  it("is disabled (no fetch attempted) once the PR seed is null", () => {
    const getPrSpy = spyOn(api, "githubGetPullRequest");
    setupHook(null);
    expect(getPrSpy).not.toHaveBeenCalled();
  });
});
