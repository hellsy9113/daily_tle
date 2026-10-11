import type { RecentSubmissions } from "@/lib/leetcode/types";

const MESSAGE_CHARACTER_LIMIT = 4096;

/** Split on newlines where possible, retaining complete UTF-16 surrogate pairs. */
export function splitMessage(text: string): string[] {
  const messages: string[] = [];
  while (text.length > MESSAGE_CHARACTER_LIMIT) {
    let splitAt = text.lastIndexOf("\n", MESSAGE_CHARACTER_LIMIT);
    if (splitAt <= 0) {
      splitAt = MESSAGE_CHARACTER_LIMIT;
      if (/[\uD800-\uDBFF]/.test(text[splitAt - 1])) splitAt -= 1;
    }
    messages.push(text.slice(0, splitAt));
    text = text.slice(splitAt);
    if (text.startsWith("\n")) text = text.slice(1);
  }
  if (text) messages.push(text);
  return messages;
}

export function formatSubmissions(username: string, data: RecentSubmissions): string[] {
  const submissions = data.recentSubmissionList;
  if (submissions.length === 0) {
    return splitMessage(
      `No recent submissions found for ${username}. Check your LeetCode username and try again.`,
    );
  }
  const text = [
    `Recent submissions for ${username}:`,
    ...submissions.map(
      (submission, index) =>
        `${index + 1}. ${submission.title}\n` +
        `${submission.statusDisplay} · ${submission.lang}\n` +
        `https://leetcode.com/problems/${encodeURIComponent(submission.titleSlug)}/`,
    ),
  ].join("\n\n");
  return splitMessage(text);
}
