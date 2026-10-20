/** Public site identity shared by metadata, crawler routes, and structured data. */
export const siteName = "Track.it";
export const siteTitle = "Track.it — Coding practice, notes & daily reading";
export const siteDescription =
  "Track LeetCode, GeeksforGeeks, HackerRank and Codeforces activity. Keep private notes, discover daily articles, and opt into Daily Grind Telegram recaps.";
export function siteOrigin() {
  return new URL(process.env.APP_URL || "https://daily-tle-ruby.vercel.app").origin;
}
