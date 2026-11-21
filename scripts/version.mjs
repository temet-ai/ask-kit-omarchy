import fs from "node:fs";
import path from "node:path";

export const meta = {
  purpose:
    "Which Omarchy version is installed and what the latest update changed: the version and release channel, whether an update is waiting, the Omarchy packages the newest upgrades moved from and to (from the pacman log, with dates), when system packages were last upgraded, and the migrations Omarchy ships with whether each has run here, with the one-line description each carries.",
  params: {
    updates: "how many upgrade days to list, newest first, default 3",
    migrations: "how many of the newest migrations to list, default 8",
    available: "ask the package mirror whether an update is waiting (a network check), default true",
  },
  returns:
    "{version, channel, package:{name, version, installed}, omarchyPath, lastUpgrade, update:{available, lines}, upgrades:[{date, packages:[\"omarchy 1.0-1 -> 1.1-1 (upgraded)\"]}], migrations:{shipped, pending:[id], recent:[{id, date, applied, summary}]}}",
  example: 'await scripts.run("version")',
};

const LOG = "/var/log/pacman.log";

export default async function ({ omarchy }, { updates = 3, migrations = 8, available = true } = {}) {
  const out = { version: null, channel: null };
  const v = await omarchy.run("version");
  out.version = v.code === 0 ? v.out.trim() : null;
  const ch = await omarchy.run("channel", "current");
  out.channel = ch.code === 0 ? ch.out.trim() : null;
  out.omarchyPath = omarchy.path;

  // The package that holds Omarchy: `omarchy`, or `omarchy-dev` on the edge channel.
  out.package = await packageInfo();

  const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n") : [];
  const upgraded = log.filter((l) => / upgraded /.test(l)).at(-1);
  out.lastUpgrade = upgraded ? upgraded.match(/^\[([^\]]+)\]/)?.[1] ?? null : null;

  // Omarchy packages in the log, by day: "[2026-11-09T13:38:22+0200] [ALPM] upgraded omarchy (4.0.6-1 -> 4.5.0-3)".
  const days = new Map();
  for (const l of log) {
    const m = l.match(/^\[(\d{4}-\d\d-\d\d)T[^\]]*\] \[ALPM\] (upgraded|installed|removed|downgraded|reinstalled) (omarchy[\w.+-]*) \(([^)]*)\)/);
    if (!m) continue;
    const [, day, action, name, rest] = m;
    const [from, to] = rest.includes(" -> ") ? rest.split(" -> ") : [action === "removed" ? rest : null, action === "removed" ? null : rest];
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(action === "upgraded" || action === "downgraded" ? `${name} ${from} -> ${to} (${action})` : `${name} ${to ?? from} (${action})`);
  }
  out.upgrades = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, updates).map(([date, packages]) => ({ date, packages: packages.slice(0, 30), ...(packages.length > 30 ? { more: packages.length - 30 } : {}) }));

  if (available) {
    const u = await omarchy.run("update", "available");
    out.update = { available: u.code === 0, lines: u.out.split("\n").filter(Boolean).slice(0, 10) };
  } else out.update = null;

  // Migrations: epoch-named scripts whose first echo says what they do; a marker in the state folder means it ran here.
  const dir = path.join(omarchy.path, "migrations");
  const stateDir = process.env.OMARCHY_MIGRATION_STATE || path.join(omarchy.state, "migrations");
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".sh")).sort();
  } catch {}
  const pend = await omarchy.run("migrate", "--pending");
  const pending = pend.code === 0 ? pend.out.split("\n").map((s) => s.trim().replace(/\.sh$/, "")).filter((s) => /^\d+$/.test(s)) : files.filter((f) => !fs.existsSync(path.join(stateDir, f))).map((f) => f.replace(/\.sh$/, ""));
  out.migrations = {
    shipped: files.length,
    pending,
    recent: files.slice(-migrations).reverse().map((f) => {
      const id = f.replace(/\.sh$/, "");
      const head = fs.readFileSync(path.join(dir, f), "utf8").split("\n").slice(0, 12).join("\n");
      const summary = head.match(/^echo\s+["'](.+?)["']\s*$/m)?.[1] ?? null;
      return { id, date: /^\d{9,11}$/.test(id) ? new Date(+id * 1000).toISOString().slice(0, 10) : null, applied: fs.existsSync(path.join(stateDir, f)), summary };
    }),
  };
  return out;

  async function packageInfo() {
    for (const pkg of ["omarchy-dev", "omarchy"]) {
      const r = await runPacman(pkg);
      if (r) return r;
    }
    return null;
  }
  async function runPacman(pkg) {
    const { execFile } = await import("node:child_process");
    return new Promise((resolve) => {
      execFile("pacman", ["-Qi", pkg], { timeout: 15000, env: { ...process.env, LC_ALL: "C" } }, (err, stdout) => {
        if (err) return resolve(null);
        const f = (k) => stdout.match(new RegExp(`^${k}\\s*:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
        resolve({ name: f("Name"), version: f("Version"), installed: f("Install Date"), built: f("Build Date") });
      });
    });
  }
}
