import fs from "node:fs";
import path from "node:path";

export const meta = {
  purpose:
    "Which Omarchy theme is current and what its colours are, and which themes are installed. Without `name`: the current theme (slug, where it comes from, mode, every colour in its colors.toml, the current background) and the installed themes split into stock, the user's own and overlays of a stock theme. With `name` (a slug or the display name): that theme's colours and files, and which files a user overlay replaces.",
  params: { name: "a theme slug or display name, optional (default: the current theme)", list: "include the full lists of installed themes, default true when name is not given" },
  returns:
    "{current:{slug, display, source, mode, colors:{accent, background, foreground, ...}, background, backgrounds:n}, theme?:{slug, source, colors, files, overlaidFiles}, installed:{stock:[slug], user:[{slug, overlaysStock, clonedFromGit, files}], total}}",
  example: 'await scripts.run("theme")',
};

const slugOf = (s) => String(s).trim().toLowerCase().replace(/[\s_]+/g, "-");
const display = (slug) => slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// colors.toml is flat `key = "value"` lines.
function parseColors(file) {
  const colors = {};
  try {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/);
      if (m) colors[m[1]] = m[2] ?? m[3] ?? m[4];
    }
  } catch {
    return null;
  }
  return colors;
}
const dirs = (d) => {
  try {
    return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name).sort();
  } catch {
    return [];
  }
};
const files = (d) => {
  try {
    return fs.readdirSync(d).sort();
  } catch {
    return [];
  }
};

export default async function ({ omarchy }, { name, list } = {}) {
  const userDir = path.join(omarchy.config, "omarchy/themes");
  const stockDir = path.join(omarchy.path, "themes");
  const stock = dirs(stockDir);
  const user = dirs(userDir);
  const nameFile = path.join(omarchy.state, "current/theme.name");
  const slug = fs.existsSync(nameFile) ? fs.readFileSync(nameFile, "utf8").trim() : null;

  const describe = (s) => {
    const u = path.join(userDir, s), st = path.join(stockDir, s);
    const inUser = user.includes(s), inStock = stock.includes(s);
    const source = inUser && inStock ? "stock theme with a user overlay" : inUser ? (fs.existsSync(path.join(u, ".git")) ? "user theme installed from a git repository" : "user theme") : inStock ? "stock theme" : "not found";
    const colorsFile = inUser && fs.existsSync(path.join(u, "colors.toml")) ? path.join(u, "colors.toml") : inStock ? path.join(st, "colors.toml") : null;
    const colors = colorsFile ? parseColors(colorsFile) : null;
    return { slug: s, source, colorsFrom: colorsFile, mode: colors?.mode ?? (inStock && fs.existsSync(path.join(st, "light.mode")) ? "light" : "dark"), colors, files: [...new Set([...files(inStock ? st : u), ...(inUser ? files(u) : [])])], overlaidFiles: inUser && inStock ? files(u) : [], backgrounds: [...files(path.join(inUser ? u : st, "backgrounds"))].length };
  };

  const out = {};
  if (slug) {
    const d = describe(slug);
    // The applied theme is what the apps read; its colors.toml is the truth for "what are the colours now".
    const applied = parseColors(path.join(omarchy.state, "current/theme/colors.toml"));
    let bg = null;
    try {
      bg = fs.readlinkSync(path.join(omarchy.state, "current/background"));
    } catch {}
    out.current = { slug, display: display(slug), source: d.source, mode: applied?.mode ?? d.mode, ...(name ? {} : { colors: applied ?? d.colors }), background: bg, backgrounds: d.backgrounds };
  } else out.current = null;

  if (name) {
    const s = slugOf(name);
    const cand = [...new Set([...stock, ...user])];
    const hit = cand.find((c) => c === s) ?? cand.find((c) => c.replace(/-/g, "") === s.replace(/-/g, ""));
    out.theme = hit ? describe(hit) : { slug: s, source: "not found", similar: cand.filter((c) => c.includes(s.split("-")[0])).slice(0, 10) };
  }
  if (list ?? !name) {
    out.installed = {
      total: new Set([...stock, ...user]).size,
      stock,
      user: user.map((s) => ({ slug: s, overlaysStock: stock.includes(s), clonedFromGit: fs.existsSync(path.join(userDir, s, ".git")), files: files(path.join(userDir, s)).length })),
    };
  }
  return out;
}
