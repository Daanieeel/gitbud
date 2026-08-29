import { describe, expect, it } from "bun:test";
import { parseLinkedIssues } from "./linkedIssues";

describe("parseLinkedIssues", () => {
  it("parses a simple Closes #123", () => {
    expect(parseLinkedIssues("Closes #123")).toEqual([{ owner: null, repo: null, number: 123 }]);
  });

  it("parses a cross-repo Fixes org/repo#45", () => {
    expect(parseLinkedIssues("Fixes acme/widgets#45")).toEqual([
      { owner: "acme", repo: "widgets", number: 45 },
    ]);
  });

  it("parses multiple issues after one keyword on the same line", () => {
    expect(parseLinkedIssues("Resolves #1, #2 and #3")).toEqual([
      { owner: null, repo: null, number: 1 },
      { owner: null, repo: null, number: 2 },
      { owner: null, repo: null, number: 3 },
    ]);
  });

  it("is case-insensitive on the keyword", () => {
    expect(parseLinkedIssues("fIxEs #7")).toEqual([{ owner: null, repo: null, number: 7 }]);
  });

  it("matches a keyword that isn't at the start of the line", () => {
    expect(parseLinkedIssues("This PR closes #9 once merged")).toEqual([
      { owner: null, repo: null, number: 9 },
    ]);
  });

  it("recognizes every closing-keyword tense", () => {
    for (const word of [
      "close",
      "closes",
      "closed",
      "fix",
      "fixes",
      "fixed",
      "resolve",
      "resolves",
      "resolved",
    ]) {
      expect(parseLinkedIssues(`${word} #1`)).toEqual([{ owner: null, repo: null, number: 1 }]);
    }
  });

  it("ignores a bare #123 mention with no closing keyword", () => {
    expect(parseLinkedIssues("See #123 for context")).toEqual([]);
  });

  it("dedupes the same issue referenced twice", () => {
    expect(parseLinkedIssues("Closes #1\nAlso fixes #1")).toEqual([
      { owner: null, repo: null, number: 1 },
    ]);
  });

  it("returns an empty list for null/empty body", () => {
    expect(parseLinkedIssues(null)).toEqual([]);
    expect(parseLinkedIssues("")).toEqual([]);
  });
});
