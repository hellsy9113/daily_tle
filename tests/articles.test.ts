import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseArticleTopics } from "@/lib/articles/topics";
import {
  canonicalArticleUrl,
  excerpt,
  normalizeArticle,
  parseArticleSource,
} from "@/lib/articles/parse";
import { articleRobotsPolicy } from "@/lib/articles/robots";
import { ARTICLE_SOURCES, articleSourcesForTopics } from "@/lib/articles/sources";
import { GET as cron, maxDuration } from "@/app/api/cron/articles/refresh/route";
const source = ARTICLE_SOURCES[0];
const now = new Date("2026-10-20T00:00:00Z");
describe("Daily Articles validation and source parsing", () => {
  it.each([[], ["web", "dsa", "ai-ml"], ["web", "web"], ["unknown"], "web", null])(
    "rejects invalid topic choice %j",
    (topics) => {
      expect(() => parseArticleTopics({ topics })).toThrow("one or two");
    },
  );
  it("allows exactly one or two supported topics and rejects account selectors", () => {
    expect(parseArticleTopics({ topics: ["web"] })).toEqual(["web"]);
    expect(parseArticleTopics({ topics: ["web", "dsa"] })).toEqual(["dsa", "web"]);
    expect(() => parseArticleTopics({ topics: ["web"], accountId: "other" })).toThrow();
  });
  it("canonicalizes URLs without dropping semantic query parameters", () => {
    expect(canonicalArticleUrl("http://www.Example.com/path/?utm_source=x&b=2&a=1#section")).toBe(
      "https://example.com/path?a=1&b=2",
    );
    expect(canonicalArticleUrl("https://example.com/path?a=2")).not.toBe(
      canonicalArticleUrl("https://example.com/path?a=1"),
    );
  });
  it.each([
    "javascript:alert(1)",
    "file:///secret",
    "https://user:pass@example.com/x",
    "https://example.com:8443/x",
  ])("rejects unsafe article URL %s", (url) => {
    expect(() => canonicalArticleUrl(url)).toThrow();
  });
  it("accepts RSS excerpts but never persists the full content field", () => {
    const body = `<rss version="2.0" xmlns:content="urn:content"><channel><item><title>Binary search tutorial</title><link>https://www.freecodecamp.org/news/search/?utm_source=rss</link><pubDate>Mon, 19 Oct 2026 00:00:00 GMT</pubDate><description><![CDATA[<p>A short &amp; useful guide.</p>]]></description><content:encoded>FULL ARTICLE NEVER COPIED</content:encoded></item><item><title>Binary search tutorial duplicate</title><link>https://freecodecamp.org/news/search</link><pubDate>Mon, 19 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
    const result = parseArticleSource(body, source, now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      canonicalUrl: "https://freecodecamp.org/news/search",
      topics: ["dsa"],
      summary: "A short & useful guide.",
      evergreen: true,
    });
    expect(JSON.stringify(result)).not.toContain("FULL ARTICLE");
  });
  it("parses Atom alternate links and publication dates", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Python functions tutorial</title><link rel="self" href="https://realpython.com/feed-item"/><link rel="alternate" href="https://realpython.com/functions/"/><published>2026-10-18T12:00:00Z</published><summary>Function basics.</summary><content>FULL BODY</content></entry></feed>`;
    expect(parseArticleSource(atom, ARTICLE_SOURCES[4], now)[0]).toMatchObject({
      title: "Python functions tutorial",
      canonicalUrl: "https://realpython.com/functions",
      topics: ["languages"],
      summary: "Function basics.",
    });
  });
  it("parses publisher API metadata without body_html or body_markdown", () => {
    const body = JSON.stringify([
      {
        canonical_url: "https://aws.amazon.com/blogs/test/",
        title: "Distributed caching guide",
        published_at: "2026-10-19T00:00:00Z",
        description: "Caching basics",
        body_html: "DO NOT COPY",
        body_markdown: "DO NOT COPY",
        tag_list: ["architecture"],
      },
    ]);
    const result = parseArticleSource(body, ARTICLE_SOURCES[5], now);
    expect(result[0]).toMatchObject({
      topics: ["system-design"],
      source: "AWS on DEV",
      summary: "Caching basics",
    });
    expect(JSON.stringify(result)).not.toContain("DO NOT COPY");
  });
  it("bounds excerpts and rejects future, malformed and off-source records", () => {
    expect(
      excerpt(`<script>secret</script><p>${"word ".repeat(200)}</p>`).length,
    ).toBeLessThanOrEqual(320);
    expect(excerpt("word ".repeat(200)).split(" ").length).toBeLessThanOrEqual(55);
    expect(
      normalizeArticle({ url: "https://attacker.example/", title: "Python tutorial" }, source, now),
    ).toBeNull();
    expect(
      normalizeArticle(
        {
          url: "https://www.freecodecamp.org/future",
          title: "Python tutorial",
          published: "2027-01-01",
        },
        source,
        now,
      ),
    ).toBeNull();
    expect(
      normalizeArticle(
        {
          url: "https://www.freecodecamp.org/bad",
          title: "Python tutorial",
          published: "bad date",
        },
        source,
        now,
      ),
    ).toBeNull();
    expect(
      normalizeArticle(
        {
          url: "https://www.freecodecamp.org/unrelated",
          title: "Travel update",
          published: "2026-10-19",
        },
        source,
        now,
      ),
    ).toBeNull();
  });
  it.each([
    `<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss><channel/></rss>`,
    `<rss><channel>`,
    `<html><body>Error</body></html>`,
  ])("rejects unsafe or malformed feeds", (body) => {
    expect(() => parseArticleSource(body, source, now)).toThrow();
  });
});
describe("source access policy and Hobby scheduling", () => {
  it("respects specific agent rules, wildcards, allow precedence, and crawl delay", () => {
    expect(
      articleRobotsPolicy(
        "User-agent: *\nDisallow: /\nUser-agent: DailyTLE-Articles\nAllow: /feed\nDisallow: /feed/private\nCrawl-delay: 15",
        "https://example.com/feed.xml",
      ),
    ).toEqual({ allowed: true, delaySeconds: 15 });
    expect(
      articleRobotsPolicy(
        "User-agent: *\nDisallow: /feed*\nAllow: /feed.xml$",
        "https://example.com/feed.xml",
      ).allowed,
    ).toBe(true);
    expect(
      articleRobotsPolicy("User-agent: *\nDisallow: /api/", "https://example.com/api/articles")
        .allowed,
    ).toBe(false);
  });
  it("selects relevant publisher sources using saved topics", () => {
    expect(articleSourcesForTopics(["dsa"]).map((s) => s.id)).toEqual(["freecodecamp"]);
    expect(articleSourcesForTopics(["web"]).map((s) => s.id)).toEqual([
      "freecodecamp",
      "webdev",
      "aws-dev",
    ]);
    expect(articleSourcesForTopics(["ai-ml", "languages"]).map((s) => s.id)).toEqual([
      "freecodecamp",
      "google-ai",
      "realpython",
      "aws-dev",
    ]);
  });
  it("adds only one once-daily article cron, within Hobby's job count and duration limits", () => {
    const { crons } = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(crons.filter((item: { path: string }) => item.path.includes("/articles/"))).toEqual([
      { path: "/api/cron/articles/refresh", schedule: "0 0 * * *" },
    ]);
    expect(crons.length).toBeLessThanOrEqual(100);
    expect(
      crons.every((item: { schedule: string }) => /^\d+ \d+ \* \* (?:\*|\d)$/.test(item.schedule)),
    ).toBe(true);
    expect(maxDuration).toBe(60);
  });
  it("rejects missing or incorrect cron secrets before source/database work", async () => {
    vi.stubEnv("CRON_SECRET", "article-cron-test");
    expect((await cron(new Request("https://example.com/api/cron/articles/refresh"))).status).toBe(
      401,
    );
    expect(
      (
        await cron(
          new Request("https://example.com/api/cron/articles/refresh", {
            headers: { authorization: "Bearer wrong" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
