import { getMessages } from "@/i18n/get-messages";
import { NavShell } from "@/components/nav-shell";
import { githubFetch } from "@/lib/github";

interface GitHubRepo {
  stargazers_count: number;
}

async function getStarCount(): Promise<number | null> {
  try {
    const res = await githubFetch("https://api.github.com/repos/Daanieeel/gitbud");
    if (!res.ok) return null;
    // SAFETY: GitHub's repo endpoint always returns a numeric stargazers_count field.
    const { stargazers_count } = (await res.json()) as GitHubRepo;
    return stargazers_count;
  } catch {
    return null;
  }
}

export async function Nav() {
  const { nav } = getMessages();
  const stars = await getStarCount();

  return <NavShell links={nav.links} githubLabel={nav.githubLabel} stars={stars} />;
}
