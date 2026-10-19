import { describe, expect, it } from "vitest";
import { parseCode } from "@/lib/notes/access";
import { readNotesJson } from "@/lib/notes/http";
import { parseNote, wordCount, noteLinkTarget } from "@/lib/notes/validation";

describe("notes validation", () => {
  it("accepts 100 words and counts whitespace consistently", () => {
    const text = Array(100).fill("word").join(" \n\t");
    expect(wordCount(text)).toBe(100);
    expect(parseNote({ text, links: ["https://example.com/path"] }).text).toBe(text);
    expect(() => parseNote({ text: `${text} extra`, links: [] })).toThrow("at most 100 words");
  });
  it("allows links without text and keeps links separate from the word limit", () => {
    expect(parseNote({ text: "   ", links: ["https://example.com"] })).toEqual({
      text: "",
      links: ["https://example.com"],
    });
    expect(() => parseNote({ text: " \n ", links: [] })).toThrow("Add some text or a link");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "ftp://example.com",
    "https://user:pass@example.com",
  ])("rejects unsafe link %s", (link) => {
    expect(() => parseNote({ text: "A note", links: [link] })).toThrow();
  });
  it("deduplicates links and bounds both content and link sizes", () => {
    expect(
      parseNote({ text: "Notes", links: ["https://example.com", "https://example.com/"] }).links,
    ).toHaveLength(1);
    expect(() => parseNote({ text: "x".repeat(10001), links: [] })).toThrow();
    expect(() =>
      parseNote({ text: "note", links: Array(11).fill("https://example.com") }),
    ).toThrow();
    expect(() =>
      parseNote({ text: "note", links: ["https://example.com/" + "x".repeat(2048)] }),
    ).toThrow();
  });
  it("rejects client-supplied ownership and malformed data", () => {
    for (const body of [
      null,
      [],
      { text: 42, links: [] },
      { text: "note", links: "url" },
      { text: "note", links: [], notebookId: "someone-else" },
    ])
      expect(() => parseNote(body)).toThrow();
  });
  it("allows exactly 5–9 alphanumeric characters without complexity rules", () => {
    for (const code of ["12345", "aaaaa", "abcde", "Ab123", "abcdefghi"])
      expect(parseCode({ code })).toBe(code);
    for (const code of ["1234", "abcdefghij", "abc de", "abc_de", "abc-def", " test1", "test1\n"])
      expect(() => parseCode({ code })).toThrow();
    expect(() => parseCode({ code: "Note123", accountId: "other" })).toThrow();
  });
  it("normalizes domains and search targets safely", () => {
    expect(noteLinkTarget("example.com")).toBe("https://example.com/");
    expect(noteLinkTarget("binary search trees")).toBe(
      "https://www.google.com/search?q=binary%20search%20trees",
    );
    expect(parseNote({ text: "", links: ["example.com", "how to solve two sum"] }).links).toEqual([
      "example.com",
      "how to solve two sum",
    ]);
  });
  it("rejects invalid JSON, unsupported media types and oversized streamed bodies", async () => {
    await expect(
      readNotesJson(
        new Request("https://example.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readNotesJson(new Request("https://example.com", { method: "POST", body: "{}" })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readNotesJson(
        new Request("https://example.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "x".repeat(48000) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
