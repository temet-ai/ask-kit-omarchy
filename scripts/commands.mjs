import fs from "node:fs";
import path from "node:path";

export const meta = {
  purpose:
    "Which `omarchy` commands exist for a job. With `find` (words such as \"night light\" or \"screenshot\"), the best-matching commands, each with its route, one-line purpose, arguments and whether it needs sudo. With `group`, every command in one group. With neither, the groups with their command counts. Read from `omarchy commands --json`; when that fails, from the `omarchy-*` programs on PATH and the `omarchy:summary` line in each.",
  params: {
    find: "words describing the job, any order (all must match somewhere; if none match every word, commands matching most words)",
    group: "a group name from the listing, such as theme, refresh, toggle, bar",
    hidden: "include commands the help leaves out, default false",
    max: "most commands to return, default 25",
  },
  returns: "{source, total, groups?:[{group,count}], commands:[{route, summary, args, sudo, hidden, examples?}], cut?}",
  example: 'await scripts.run("commands", { find: "night light" })',
};

async function listFromJson(omarchy, hidden) {
  const r = await omarchy.run("commands", "--json", ...(hidden ? ["--all"] : []));
  if (r.code !== 0) return null;
  try {
    const j = JSON.parse(r.out);
    return j.commands.map((c) => ({ route: c.route, summary: c.summary ?? "", args: c.args ?? "", sudo: !!c.requires_sudo, hidden: !!c.hidden, examples: c.examples ?? [], aliases: c.aliases ?? [] }));
  } catch {
    return null;
  }
}

// Fallback: omarchy-* programs on PATH; the purpose is the `# omarchy:summary=` header line.
function listFromPath() {
  const seen = new Map();
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.startsWith("omarchy-"));
    } catch {
      continue;
    }
    for (const n of names) {
      if (seen.has(n)) continue;
      let head = "";
      try {
        head = fs.readFileSync(path.join(dir, n), "utf8").slice(0, 1500);
      } catch {}
      const meta = (k) => head.match(new RegExp(`^#\\s*omarchy:${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
      seen.set(n, { route: "omarchy " + n.slice(8).replaceAll("-", " "), binary: n, summary: meta("summary"), args: meta("args"), sudo: meta("requires-sudo") === "true", hidden: meta("hidden") === "true", examples: meta("examples") ? meta("examples").split(" | ") : [], aliases: [] });
    }
  }
  return [...seen.values()];
}

const STOP = new Set(["the", "to", "of", "for", "my", "on", "in", "and", "me", "how", "do", "can", "is", "it", "an", "with", "from", "that", "this", "omarchy", "command", "commands"]);

export default async function ({ omarchy }, { find, group, hidden = false, max = 25 } = {}) {
  let all = await listFromJson(omarchy, hidden);
  let source = "omarchy commands --json";
  if (!all) {
    all = listFromPath();
    source = "omarchy-* programs on PATH";
    if (!hidden) all = all.filter((c) => !c.hidden);
  }
  const grp = (c) => c.route.split(" ")[1] ?? "";
  const slim = (c, ex) => ({ route: c.route, summary: c.summary, ...(c.args ? { args: c.args } : {}), ...(c.sudo ? { sudo: true } : {}), ...(c.hidden ? { hidden: true } : {}), ...(ex && c.examples.length ? { examples: c.examples.slice(0, 3) } : {}) });
  if (!find && !group) {
    const counts = {};
    for (const c of all) counts[grp(c)] = (counts[grp(c)] ?? 0) + 1;
    return { source, total: all.length, groups: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g, count]) => ({ group: g, count })), commands: [] };
  }
  if (group) {
    const rows = all.filter((c) => grp(c) === String(group).toLowerCase());
    return { source, total: rows.length, commands: rows.slice(0, max).map((c) => slim(c, false)), ...(rows.length > max ? { cut: rows.length - max } : {}) };
  }
  const words = String(find).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
  const score = (c) => {
    let hits = 0, total = 0, inRoute = 0;
    for (const w of words) {
      const stem = w.replace(/(ing|s)$/, "");
      const s = (c.route.toLowerCase().includes(stem) ? 3 : 0) + (c.summary.toLowerCase().includes(stem) ? 2 : 0) + ((c.args + " " + c.examples.join(" ")).toLowerCase().includes(stem) ? 1 : 0);
      if (s) hits++;
      if (c.route.toLowerCase().includes(stem)) inRoute++;
      total += s;
    }
    // Several query words inside a short route (omarchy theme set) beat the same words spread over a long one.
    return { hits, total: total - c.route.split(" ").length * 0.1 + (inRoute >= 2 ? 3 * inRoute - c.route.split(" ").length : 0) };
  };
  const scored = all.map((c) => ({ c, ...score(c) })).filter((x) => x.hits > 0);
  const best = Math.max(0, ...scored.map((x) => x.hits));
  const rows = scored.filter((x) => x.hits === best).sort((a, b) => b.total - a.total);
  return { source, total: rows.length, matchedWords: best, of: words.length, commands: rows.slice(0, max).map((x, i) => slim(x.c, i < 5)), ...(rows.length > max ? { cut: rows.length - max } : {}) };
}
