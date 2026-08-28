import { describe, expect, it, mock, spyOn, beforeEach } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToString } from "react-dom/server";
import { useDeleteBranch } from "./useBranches";
import { api } from "@/lib/tauri";
import * as gitSyncModule from "@/lib/gitSync";
import { queryKeys } from "@/lib/queryKeys";

describe("useDeleteBranch", () => {
  const repoPath = "/test/repo";

  function setupHook(branchesData: {
    branch: string;
    branches: Array<{ name: string; is_head: boolean; is_remote: boolean }>;
  }) {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(queryKeys.branches(repoPath), branchesData);

    let mutation!: ReturnType<typeof useDeleteBranch>;
    function TestComponent() {
      mutation = useDeleteBranch(repoPath);
      return null;
    }

    renderToString(
      React.createElement(QueryClientProvider, { client: qc }, React.createElement(TestComponent)),
    );

    return { mutation, qc };
  }

  beforeEach(() => {
    mock.restore();
  });

  it("deletes remote-only branch on remote without attempting local delete", async () => {
    const deleteBranchSpy = spyOn(api, "deleteBranch").mockResolvedValue(undefined);
    const deleteBranchRemoteSpy = spyOn(api, "deleteBranchRemote").mockResolvedValue(undefined);
    const runGitSyncSpy = spyOn(gitSyncModule, "runGitSync").mockImplementation(
      async (_eventId, action) => {
        await action();
      },
    );

    const { mutation } = setupHook({
      branch: "main",
      branches: [
        { name: "main", is_head: true, is_remote: false },
        { name: "origin/remote-feature", is_head: false, is_remote: true },
      ],
    });

    await mutation.mutateAsync({
      name: "remote-feature",
      opts: { deleteRemote: true },
    });

    expect(deleteBranchSpy).not.toHaveBeenCalled();
    expect(runGitSyncSpy).toHaveBeenCalled();
    expect(deleteBranchRemoteSpy).toHaveBeenCalledWith(repoPath, "remote-feature");
  });

  it("normalizes full remote ref prefix when deleting remote branch", async () => {
    const deleteBranchSpy = spyOn(api, "deleteBranch").mockResolvedValue(undefined);
    const deleteBranchRemoteSpy = spyOn(api, "deleteBranchRemote").mockResolvedValue(undefined);
    spyOn(gitSyncModule, "runGitSync").mockImplementation(async (_eventId, action) => {
      await action();
    });

    const { mutation } = setupHook({
      branch: "main",
      branches: [
        { name: "main", is_head: true, is_remote: false },
        { name: "origin/feature/with-slashes", is_head: false, is_remote: true },
      ],
    });

    await mutation.mutateAsync({
      name: "origin/feature/with-slashes",
      opts: { deleteRemote: true },
    });

    expect(deleteBranchSpy).not.toHaveBeenCalled();
    expect(deleteBranchRemoteSpy).toHaveBeenCalledWith(repoPath, "feature/with-slashes");
  });

  it("deletes both local and remote branch when branch exists locally and deleteRemote is true", async () => {
    const deleteBranchSpy = spyOn(api, "deleteBranch").mockResolvedValue(undefined);
    const deleteBranchRemoteSpy = spyOn(api, "deleteBranchRemote").mockResolvedValue(undefined);
    spyOn(gitSyncModule, "runGitSync").mockImplementation(async (_eventId, action) => {
      await action();
    });

    const { mutation } = setupHook({
      branch: "main",
      branches: [
        { name: "main", is_head: true, is_remote: false },
        { name: "tracked-feature", is_head: false, is_remote: false },
        { name: "origin/tracked-feature", is_head: false, is_remote: true },
      ],
    });

    await mutation.mutateAsync({
      name: "tracked-feature",
      opts: { deleteRemote: true },
    });

    expect(deleteBranchSpy).toHaveBeenCalledWith(repoPath, "tracked-feature");
    expect(deleteBranchRemoteSpy).toHaveBeenCalledWith(repoPath, "tracked-feature");
  });

  it("deletes only locally when deleteRemote is false", async () => {
    const deleteBranchSpy = spyOn(api, "deleteBranch").mockResolvedValue(undefined);
    const deleteBranchRemoteSpy = spyOn(api, "deleteBranchRemote").mockResolvedValue(undefined);
    const runGitSyncSpy = spyOn(gitSyncModule, "runGitSync");

    const { mutation } = setupHook({
      branch: "main",
      branches: [
        { name: "main", is_head: true, is_remote: false },
        { name: "local-feature", is_head: false, is_remote: false },
      ],
    });

    await mutation.mutateAsync({
      name: "local-feature",
    });

    expect(deleteBranchSpy).toHaveBeenCalledWith(repoPath, "local-feature");
    expect(runGitSyncSpy).not.toHaveBeenCalled();
    expect(deleteBranchRemoteSpy).not.toHaveBeenCalled();
  });

  it("switches away from the checked-out branch before deleting it", async () => {
    const checkoutBranchSpy = spyOn(api, "checkoutBranch").mockResolvedValue(undefined);
    const deleteBranchSpy = spyOn(api, "deleteBranch").mockResolvedValue(undefined);

    const { mutation } = setupHook({
      branch: "feature-to-delete",
      branches: [
        { name: "main", is_head: false, is_remote: false },
        { name: "feature-to-delete", is_head: true, is_remote: false },
      ],
    });

    await mutation.mutateAsync({
      name: "feature-to-delete",
    });

    expect(checkoutBranchSpy).toHaveBeenCalledWith(repoPath, "main");
    expect(deleteBranchSpy).toHaveBeenCalledWith(repoPath, "feature-to-delete");
  });
});
