import { describe, expect, it, mock, spyOn, beforeEach } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToString } from "react-dom/server";
import { useAddIssueComment, useSubmitReview } from "./usePRConversation";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { IssueComment, Review } from "@/lib/types";

const repoPath = "/test/repo";
const login = "octocat";
const number = 42;

function setupHook<T>(useHook: (qc: QueryClient) => T) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  let result!: T;
  function TestComponent() {
    result = useHook(qc);
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

describe("useAddIssueComment", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("appends the created comment to the cached issue-comments list on success", async () => {
    const existing: IssueComment = {
      id: 1,
      body: "first",
      user_login: "u",
      user_avatar_url: "",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      html_url: "",
    };
    const created: IssueComment = { ...existing, id: 2, body: "second" };
    spyOn(api, "githubCreateIssueComment").mockResolvedValue(created);

    const { qc, result } = setupHook(() => useAddIssueComment(repoPath, login, number));
    qc.setQueryData(queryKeys.prIssueComments(repoPath, login, number), [existing]);

    await result.mutateAsync("second");

    const data = qc.getQueryData<IssueComment[]>(
      queryKeys.prIssueComments(repoPath, login, number),
    );
    expect(data).toEqual([existing, created]);
  });
});

describe("useSubmitReview", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("appends the submitted review to the cached reviews list on success", async () => {
    const created: Review = {
      id: 5,
      user_login: "u",
      user_avatar_url: "",
      state: "APPROVED",
      body: "lgtm",
      submitted_at: "2024-01-01T00:00:00Z",
    };
    spyOn(api, "githubSubmitReview").mockResolvedValue(created);

    const { qc, result } = setupHook(() => useSubmitReview(repoPath, login, number));
    qc.setQueryData(queryKeys.prReviews(repoPath, login, number), []);

    await result.mutateAsync({ event: "APPROVE", body: "lgtm" });

    const data = qc.getQueryData<Review[]>(queryKeys.prReviews(repoPath, login, number));
    expect(data).toEqual([created]);
  });
});
