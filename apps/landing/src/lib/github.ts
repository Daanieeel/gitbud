// Authenticated GitHub API requests get a 5,000/hour rate limit instead of the
// unauthenticated 60/hour, which the repeated build-time fetches below easily exhaust.
// Set GITHUB_TOKEN (a plain "public_repo" read token is enough) locally and on the
// deploy host; this only ever runs server-side, so the token never reaches the client.
export async function githubFetch(url: string): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  return fetch(url, {
    headers: {
      "User-Agent": "gitbud-landing",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
