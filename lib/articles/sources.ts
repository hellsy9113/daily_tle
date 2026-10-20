import { ARTICLE_TOPICS, type ArticleTopic } from "./topics";
export interface ArticleSource {
  id: string;
  name: string;
  url: string;
  kind: "rss" | "api";
  articleHosts: string[];
  defaultTopics?: ArticleTopic[];
  coverage?: ArticleTopic[];
  evergreen?: boolean;
}
/** Publisher-owned feeds/API accounts only. No user-supplied fetch URLs. */
export const ARTICLE_SOURCES: ArticleSource[] = [
  {
    id: "freecodecamp",
    name: "freeCodeCamp",
    url: "https://www.freecodecamp.org/news/rss/",
    kind: "rss",
    articleHosts: ["www.freecodecamp.org", "freecodecamp.org"],
  },
  {
    id: "webdev",
    name: "web.dev",
    url: "https://web.dev/feed.xml",
    kind: "rss",
    articleHosts: ["web.dev"],
    defaultTopics: ["web"],
  },
  {
    id: "google-ai",
    name: "Google AI",
    url: "https://blog.google/technology/ai/rss/",
    kind: "rss",
    articleHosts: ["blog.google"],
    defaultTopics: ["ai-ml"],
  },
  {
    id: "fowler",
    name: "Martin Fowler",
    url: "https://martinfowler.com/feed.atom",
    kind: "rss",
    articleHosts: ["martinfowler.com", "www.martinfowler.com"],
    defaultTopics: ["system-design"],
  },
  {
    id: "realpython",
    name: "Real Python",
    url: "https://realpython.com/atom.xml",
    kind: "rss",
    articleHosts: ["realpython.com"],
    defaultTopics: ["languages"],
    evergreen: true,
  },
  {
    id: "aws-dev",
    name: "AWS on DEV",
    coverage: ["web", "system-design", "ai-ml", "languages"],
    url: "https://dev.to/api/articles?username=aws&per_page=30",
    kind: "api",
    articleHosts: ["dev.to", "aws.amazon.com", "community.aws", "builder.aws"],
  },
];

/** Mixed publisher feeds are ingested whole so conditional caches remain valid for every topic. */
export function articleSourcesForTopics(topics: ArticleTopic[]) {
  return ARTICLE_SOURCES.filter((source) =>
    (source.coverage ?? source.defaultTopics ?? ARTICLE_TOPICS.map((topic) => topic.id)).some(
      (topic) => topics.includes(topic),
    ),
  );
}
