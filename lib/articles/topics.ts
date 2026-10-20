import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";

export const ARTICLE_TOPICS = [
  { id: "dsa", label: "DSA / interview prep" },
  { id: "ai-ml", label: "AI / ML" },
  { id: "web", label: "Web development" },
  { id: "system-design", label: "System design" },
  { id: "languages", label: "Language tutorials" },
] as const;
export type ArticleTopic = (typeof ARTICLE_TOPICS)[number]["id"];
export const articleTopicLabel = (topic: ArticleTopic) =>
  ARTICLE_TOPICS.find((item) => item.id === topic)!.label;
export const isArticleTopic = (value: unknown): value is ArticleTopic =>
  ARTICLE_TOPICS.some((topic) => topic.id === value);
export const DAILY_ARTICLE_LIMIT = 6;
export function parseArticleTopics(input: unknown): ArticleTopic[] {
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => key !== "topics") ||
    !Array.isArray(input.topics) ||
    input.topics.length < 1 ||
    input.topics.length > 2 ||
    !input.topics.every(isArticleTopic) ||
    new Set(input.topics).size !== input.topics.length
  )
    throw new ApiError(400, "Choose one or two different article topics.");
  return [...input.topics].sort();
}
export interface ArticleCard {
  id: string;
  title: string;
  source: string;
  publishedAt: string | null;
  topic: ArticleTopic;
  summary: string;
  url: string;
}
export interface ArticleRefreshResult {
  inserted: number;
  sources: number;
  failed: number;
  skipped: number;
  deferred: number;
  nextRefreshAt: string;
}
export interface DailyArticleFeed {
  registrationId: string;
  nextRefreshAt: string;
  date: string;
  timezone: "Asia/Kolkata";
  topics: ArticleTopic[];
  selectedTopics: ArticleTopic[];
  articles: ArticleCard[];
  generatedAt: string;
}
