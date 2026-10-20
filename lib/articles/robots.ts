/** Conservative robots policy for our fixed feed/API paths; supports groups, wildcards and Allow. */
export function articleRobotsPolicy(body: string, url: string) {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number }[] =
    [];
  let current = {
    agents: [] as string[],
    rules: [] as { allow: boolean; path: string }[],
    delay: 0,
  };
  for (const line of body.split(/\r?\n/)) {
    const parsed = /^\s*([^:#]+):\s*([^#]*)/.exec(line);
    if (!parsed) continue;
    const key = parsed[1].trim().toLowerCase(),
      val = parsed[2].trim();
    if (key === "user-agent") {
      if (current.rules.length || current.delay) {
        groups.push(current);
        current = { agents: [], rules: [], delay: 0 };
      }
      current.agents.push(val.toLowerCase());
    } else if (current.agents.length && (key === "allow" || key === "disallow") && val)
      current.rules.push({ allow: key === "allow", path: val });
    else if (current.agents.length && key === "crawl-delay" && /^\d+(?:\.\d+)?$/.test(val))
      current.delay = Math.min(86400, Math.ceil(Number(val)));
  }
  groups.push(current);
  const product = "dailytle-articles";
  const score = (agents: string[]) =>
    Math.max(
      -1,
      ...agents.map((agent) =>
        agent === "*" ? 0 : agent && product.includes(agent) ? agent.length : -1,
      ),
    );
  const best = Math.max(-1, ...groups.map((group) => score(group.agents)));
  const selected = groups.filter((group) => score(group.agents) === best && best >= 0);
  const path = new URL(url).pathname + new URL(url).search;
  let allowed = true,
    length = -1;
  for (const group of selected)
    for (const rule of group.rules) {
      const escaped = rule.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      const expression = new RegExp(`^${escaped.replace(/\$$/, "$")}`);
      if (
        expression.test(path) &&
        (rule.path.length > length || (rule.path.length === length && rule.allow))
      ) {
        length = rule.path.length;
        allowed = rule.allow;
      }
    }
  return { allowed, delaySeconds: Math.max(0, ...selected.map((group) => group.delay)) };
}
