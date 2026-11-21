import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

export const meta = {
  purpose:
    "Whether the user's config has drifted from what Omarchy ships. Compares each file under $OMARCHY_PATH/config with its copy under ~/.config: unchanged, changed (lines added and removed), or not present for the user yet. For shell.json it lists the settings whose value differs (by key path). Also lists the user-only files Omarchy does not ship and the backups that earlier edits left. With `show`, the unified diff of one file.",
  params: { show: "one path relative to ~/.config (e.g. hypr/bindings.lua) to get its diff against the shipped copy", max: "most files to list per kind, default 40" },
  returns: "{omarchyPath, shipped, same, changed:[{file, added, removed}], missing:[file], shellSettings:{changed:[{key, user, default}], added:[key], removed:[key]}, userOnly:[file], backups:n} or {file, diff} with `show`",
  example: 'await scripts.run("drift")',
};

const TEXT = 200_000;
function walk(dir, base = dir, out = []) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile() || e.isSymbolicLink()) out.push(path.relative(base, p));
  }
  return out.sort();
}
const lines = (s) => s.split("\n");
function counts(a, b) {
  // lines in b that are not in a (added), lines in a not in b (removed); order ignored.
  const m = new Map();
  for (const l of lines(a)) m.set(l, (m.get(l) ?? 0) + 1);
  let added = 0;
  for (const l of lines(b)) {
    const n = m.get(l) ?? 0;
    if (n > 0) m.set(l, n - 1);
    else added++;
  }
  let removed = 0;
  for (const n of m.values()) removed += n;
  return { added, removed };
}
function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {}
  try {
    return JSON.parse(s.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
}
function flat(o, p = "", out = {}) {
  if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, out);
  else out[p] = o;
  return out;
}
const short = (v) => {
  const s = JSON.stringify(v);
  return s && s.length > 80 ? s.slice(0, 77) + "..." : s;
};
function diffU(a, b) {
  return new Promise((resolve) => execFile("diff", ["-u", a, b], { timeout: 10000, maxBuffer: 8 << 20 }, (err, out) => resolve(err && err.code !== 1 ? null : out)));
}

export default async function ({ omarchy }, { show, max = 40 } = {}) {
  const shippedDir = path.join(omarchy.path, "config");
  if (show) {
    const rel = String(show).replace(/^~?\/?\.config\//, "");
    const def = path.join(shippedDir, rel), usr = path.join(omarchy.config, rel);
    if (omarchy.isSecret(usr) || /^(git|chromium|opencode|gh|fcitx5?)\//.test(rel)) throw new Error(`${rel} can hold a credential or personal data; only its line counts are listed`);
    if (!fs.existsSync(def)) return { file: rel, note: "Omarchy ships no copy of this file, so there is nothing to compare with; hypr/*.lua files are layered over $OMARCHY_PATH/default/hypr" };
    if (!fs.existsSync(usr)) return { file: rel, note: "the user has no copy yet; the shipped one is used or copied on first refresh" };
    const d = await diffU(def, usr);
    if (d == null) return { file: rel, note: "diff is not available" };
    const all = d.split("\n");
    return { file: rel, note: "lines starting with - are Omarchy's, + are the user's", changed: d !== "", diff: all.slice(0, 120).join("\n"), ...(all.length > 120 ? { cut: all.length - 120 } : {}) };
  }
  const shipped = walk(shippedDir).filter((f) => !omarchy.isSecret(path.join(shippedDir, f)));
  const same = [], changed = [], missing = [];
  let shell = null;
  for (const f of shipped) {
    const def = path.join(shippedDir, f), usr = path.join(omarchy.config, f);
    if (!fs.existsSync(usr)) {
      missing.push(f);
      continue;
    }
    let a, b;
    try {
      if (fs.statSync(def).size > TEXT || fs.statSync(usr).size > TEXT) {
        (fs.readFileSync(def).equals(fs.readFileSync(usr)) ? same : changed).push(f);
        continue;
      }
      a = fs.readFileSync(def, "utf8");
      b = fs.readFileSync(usr, "utf8");
    } catch {
      continue;
    }
    if (a === b) same.push(f);
    else changed.push({ file: f, ...counts(a, b) });
    if (f === "omarchy/shell.json") shell = { a, b };
  }
  const out = { omarchyPath: omarchy.path, shipped: shipped.length, same: same.length, changed: changed.slice(0, max), ...(changed.length > max ? { changedCut: changed.length - max } : {}), missing: missing.slice(0, max), ...(missing.length > max ? { missingCut: missing.length - max } : {}) };
  if (shell) {
    const A = parseJson(shell.a), B = parseJson(shell.b);
    if (A && B) {
      const fa = flat(A), fb = flat(B);
      const ch = [], add = [], rem = [];
      for (const k of Object.keys(fb)) k in fa ? JSON.stringify(fa[k]) !== JSON.stringify(fb[k]) && ch.push({ key: k, user: short(fb[k]), default: short(fa[k]) }) : add.push(k);
      for (const k of Object.keys(fa)) if (!(k in fb)) rem.push(k);
      out.shellSettings = { changed: ch.slice(0, max), added: add.slice(0, max), removed: rem.slice(0, max), ...(ch.length > max ? { changedCut: ch.length - max } : {}) };
    } else out.shellSettings = { note: "shell.json could not be parsed to compare keys" };
  }
  // Files in the places Omarchy keeps user overrides that Omarchy does not ship.
  const shippedSet = new Set(shipped);
  const userOnly = [];
  let backups = 0;
  for (const sub of ["hypr", "omarchy"]) {
    for (const f of walk(path.join(omarchy.config, sub))) {
      const rel = path.join(sub, f);
      if (/\.bak([.-]|$)|\.before-/.test(f)) {
        backups++;
        continue;
      }
      if (omarchy.isSecret(path.join(omarchy.config, rel))) continue;
      if (rel.startsWith("omarchy/plugins/") || rel.startsWith("omarchy/themes/") || rel.startsWith("omarchy/backgrounds/")) continue;
      if (!shippedSet.has(rel)) userOnly.push(rel);
    }
  }
  out.userOnly = userOnly.slice(0, max);
  if (userOnly.length > max) out.userOnlyCut = userOnly.length - max;
  out.backups = backups;
  const plugins = walk(path.join(omarchy.config, "omarchy/plugins")).map((f) => f.split(path.sep)[0]).filter((v, i, a) => a.indexOf(v) === i && !v.startsWith("."));
  const themes = (() => {
    try {
      return fs.readdirSync(path.join(omarchy.config, "omarchy/themes"));
    } catch {
      return [];
    }
  })();
  out.userPlugins = plugins.slice(0, max);
  if (plugins.length > max) out.userPluginsCut = plugins.length - max;
  out.userThemes = themes;
  out.note = "Omarchy copies its config/ files into ~/.config once and does not update them, so a changed file is a user edit or a newer shipped default (`show` gives the diff, `omarchy refresh config <file>` takes the shipped one and backs up the user's). hypr/*.lua are starting points layered over $OMARCHY_PATH/default/hypr, which does update";
  return out;
}
