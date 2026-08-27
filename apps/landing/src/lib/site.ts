// TODO: replace with the real production domain once it's registered.
const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gitbud-app.netlify.app";

// Every call site appends its own leading slash (e.g. `${siteUrl}/features/`), so strip any
// trailing slash here to avoid double slashes regardless of how the env var is set.
export const siteUrl = rawSiteUrl.replace(/\/+$/, "");
