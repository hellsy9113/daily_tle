/** Browser-safe URLs built from validated Codeforces problem identifiers. */
export function codeforcesProblemUrl(contestId: number, index: string): string {
  const encoded = encodeURIComponent(index);
  if (contestId === 99999)
    return `https://codeforces.com/problemsets/acmsguru/problem/99999/${encoded}`;
  return contestId >= 100000
    ? `https://codeforces.com/gym/${contestId}/problem/${encoded}`
    : `https://codeforces.com/problemset/problem/${contestId}/${encoded}`;
}
