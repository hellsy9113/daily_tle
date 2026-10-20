import { XMLParser, XMLValidator } from "fast-xml-parser";
import { isRecord } from "@/lib/http/validation";
import type { ArticleSource } from "./sources";
import type { ArticleTopic } from "./topics";

export interface CatalogArticle {
  canonicalUrl: string;
  title: string;
  source: string;
  publishedAt: Date | null;
  topics: ArticleTopic[];
  summary: string;
  evergreen: boolean;
}
export function canonicalArticleUrl(input: string, allowedHosts?: string[]) {
  const url = new URL(input);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    (allowedHosts && !allowedHosts.includes(url.hostname))
  )
    throw new Error("Invalid article URL");
  url.protocol = "https:";
  url.hostname = url.hostname.replace(/^www\./, "");
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.href.length > 2048) throw new Error("Article URL too long");
  return url.href;
}
function value(input: unknown): string {
  if (typeof input === "string") return input;
  if (isRecord(input)) return value(input["#text"]);
  return "";
}
export function excerpt(input: string, limit = 320) {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[
          entity
        ]!,
    )
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 55)
    .join(" ")
    .slice(0, limit);
}
export function classifyArticle(text: string, defaults: ArticleTopic[] = []) {
  const topics = new Set<ArticleTopic>(defaults);
  const rules: [ArticleTopic, RegExp][] = [
    [
      "dsa",
      /\b(algorithms?|data structures?|leetcode|interview|dynamic programming|binary search|linked lists?|competitive programming)\b/i,
    ],
    [
      "ai-ml",
      /\b(ai|machine learning|deep learning|neural|llms?|artificial intelligence|tensorflow|pytorch|transformers?)\b/i,
    ],
    [
      "web",
      /\b(web|browser|html|css|javascript|typescript|react|next\.?js|node\.?js|frontend|front.end|backend|back.end|http|accessibility)\b/i,
    ],
    [
      "system-design",
      /\b(system design|architecture|distributed|microservices?|databases?|scalability|caching|queues?|load balancing|kubernetes)\b/i,
    ],
    [
      "languages",
      /\b(python|java|c\+\+|rust|golang|kotlin|swift|programming language|language tutorial|ruby|php)\b/i,
    ],
  ];
  for (const [topic, regex] of rules) if (regex.test(text)) topics.add(topic);
  return [...topics].sort();
}
export function normalizeArticle(
  raw: { url: unknown; title: unknown; published?: unknown; summary?: unknown; tags?: unknown },
  source: ArticleSource,
  now: Date,
): CatalogArticle | null {
  try {
    if (typeof raw.url !== "string") return null;
    const title = excerpt(value(raw.title), 300);
    if (!title) return null;
    const summary = excerpt(value(raw.summary));
    const topics = classifyArticle(
      `${title} ${summary} ${Array.isArray(raw.tags) ? raw.tags.map(value).join(" ") : value(raw.tags)}`,
      source.defaultTopics,
    );
    if (!topics.length) return null;
    const published = value(raw.published);
    const publishedAt = published ? new Date(published) : null;
    if (publishedAt && (!Number.isFinite(publishedAt.getTime()) || publishedAt > now)) return null;
    const evergreen =
      source.evergreen === true ||
      /\b(tutorial|guide|how to|algorithms?|data structures?|patterns?|fundamentals|introduction|explained)\b/i.test(
        title,
      );
    if (!publishedAt && !evergreen) return null;
    return {
      canonicalUrl: canonicalArticleUrl(raw.url, source.articleHosts),
      title,
      source: source.name,
      publishedAt,
      topics,
      summary,
      evergreen,
    };
  } catch {
    return null;
  }
}
const list = (input: unknown) =>
  input === undefined ? [] : Array.isArray(input) ? input : [input];
export function parseArticleSource(
  body: string,
  source: ArticleSource,
  now = new Date(),
): CatalogArticle[] {
  let entries: unknown[];
  if (source.kind === "api") {
    const parsed: unknown = JSON.parse(body);
    if (!Array.isArray(parsed)) throw new Error("Invalid source response");
    entries = parsed.slice(0, 100).map((item) =>
      isRecord(item)
        ? {
            url: item.canonical_url || item.url,
            title: item.title,
            published: item.published_at,
            summary: item.description,
            tags: item.tag_list,
          }
        : {},
    );
  } else {
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(body) || XMLValidator.validate(body) !== true)
      throw new Error("Unsafe or malformed XML feed");
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: false,
    }).parse(body);
    const feedEntries = parsed.rss?.channel?.item ?? parsed.feed?.entry;
    if (!parsed.rss?.channel && !parsed.feed) throw new Error("Unsupported feed");
    entries = list(feedEntries)
      .slice(0, 100)
      .map((item) => {
        if (!isRecord(item)) return {};
        const links = list(item.link);
        const link = links.find(
          (candidate) =>
            typeof candidate === "string" ||
            (isRecord(candidate) && (!candidate["@rel"] || candidate["@rel"] === "alternate")),
        );
        return {
          url: typeof link === "string" ? link : isRecord(link) ? link["@href"] : undefined,
          title: item.title,
          published: item.pubDate ?? item.published ?? item.updated,
          // Never persist content:encoded or Atom content, which may contain a full article.
          summary: item.description ?? item.summary,
          tags: item.category,
        };
      });
  }
  const unique = new Map<string, CatalogArticle>();
  for (const item of entries) {
    if (!isRecord(item)) continue;
    const article = normalizeArticle(item as Parameters<typeof normalizeArticle>[0], source, now);
    if (article && !unique.has(article.canonicalUrl)) unique.set(article.canonicalUrl, article);
  }
  return [...unique.values()];
}
