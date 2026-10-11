import type { LeetcodeWeeklyQuestion } from "@/types/weeklyQuestion";

export default function formatTelegramSubmissions(
  username: string,
  data: LeetcodeWeeklyQuestion,
): string[] {
  const submissions = data.recentSubmissionList;
  let text = submissions.length
    ? [
        `Recent submissions for ${username}:`,
        ...submissions.map(
          (submission, index) =>
            `${index + 1}. ${submission.title}\n` +
            `${submission.statusDisplay} · ${submission.lang}\n` +
            `https://leetcode.com/problems/${encodeURIComponent(submission.titleSlug)}/`,
        ),
      ].join("\n\n")
    : `No recent submissions found for ${username}. Check your LeetCode username and try again.`;

  const messages: string[] = [];

  // Telegram limits sendMessage text to 4096 characters. Prefer splitting at a newline.
  while (text.length > 4096) {
    let splitAt = text.lastIndexOf("\n", 4096);

    if (splitAt <= 0) {
      splitAt = 4096;
      // Keep UTF-16 surrogate pairs together when splitting a very long line.
      if (/[\uD800-\uDBFF]/.test(text[splitAt - 1])) splitAt -= 1;
    }

    messages.push(text.slice(0, splitAt));
    text = text.slice(splitAt).trimStart();
  }

  if (text) messages.push(text);

  return messages;
}
