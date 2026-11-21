// A client for Omarchy on this machine: its `omarchy` command, the files it ships (defaults, stock
// themes, migrations), the user's override files under ~/.config, and a scaffold for a new
// Qt Quick app. It reads in every ask and changes things only when the caller asked for a change
// (`act`).
//
// Four checks. An `omarchy` command that changes something needs `act`; what never ends or needs
// a person (an update, a menu, a wizard, an agent sign-in) is refused even then; answers go to a
// cloud model, so files that hold credentials are never read or written and secrets in output
// are masked; and edits stay inside ~/.config, backed up first the way `omarchy refresh` does.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const deny = (why) => {
  throw new Error(`not allowed: ${why}`);
};
const notInThisAsk = (what) => {
  throw new Error(`not in this ask: ${what} changes things, and the caller did not ask for a change (act: true), so nothing was done. Answer what you can, and say that this needs \`ask\` with act: true. Do not look for another way to do it.`);
};

const home = os.homedir();
const expand = (p) => String(p ?? "").replace(/^~(?=\/|$)/, home);
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// Names that hold credentials. Omarchy keeps agent sign-ins under an `agents` folder.
const SECRET = /(^|[\/._-])(env|token|tokens|secret|secrets|credential|credentials|passw\w*|oauth|cookies?|keyring|id_rsa|id_ed25519|auth)([\/._-]|$)|\.(pem|key|sqlite3?|db|ldb|sock)$/i;
const SECRET_DIR = /\/(agents?|accounts?|gnupg|ssh)(\/|$)/i;
/** True when a path looks like it holds credentials: the kit neither reads nor writes it. */
export const isSecret = (p) => SECRET.test(path.basename(p)) || SECRET.test(p) || SECRET_DIR.test(p);

// URL passwords, bearer headers and `token = value` lines never reach the model.
const mask = (s) =>
  String(s ?? "")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, "$1***@")
    .replace(/(authorization:\s*)(bearer|basic)\s+\S+/gi, "$1$2 ***")
    .replace(/\b((?:api[_-]?key|token|secret|password|passwd)\w*\s*[=:]\s*)["']?[^\s"']{6,}/gi, "$1***");

// `omarchy` commands that only read. A command not listed here changes something. A rule is the
// words of the route, and `when` (optional) looks at the arguments after them.
const has = (a, ...f) => a.some((x) => f.includes(x));
const READS = [
  { r: ["version"] }, { r: ["version", "channel"] }, { r: ["version", "pkgs"] }, { r: ["version", "branch"] },
  { r: ["channel", "current"] }, { r: ["theme", "list"] }, { r: ["theme", "current"] }, { r: ["theme", "bg", "current"] },
  { r: ["font", "list"] }, { r: ["font", "current"] }, { r: ["plugin", "list"] }, { r: ["plugin", "validate"] },
  { r: ["plugin", "catalog"] }, { r: ["update", "available"] }, { r: ["update", "analyze", "logs"] },
  { r: ["migrate"], when: (a) => a.length === 1 && has(a, "--pending", "--check") },
  { r: ["debug"], when: (a) => has(a, "--no-sudo") && has(a, "--print") }, { r: ["debug", "idle"] },
  { r: ["menu", "keybindings"], when: (a) => has(a, "--print", "-p") },
  { r: ["commands"] }, { r: ["plymouth", "current"] }, { r: ["plymouth", "list"] }, { r: ["powerprofiles", "list"] },
  { r: ["battery", "status"] }, { r: ["network", "status"] }, { r: ["reminder", "show"] },
  { r: ["hyprland", "workspace", "layout", "current"] }, { r: ["hibernation", "available"] }, { r: ["bar", "get"] },
  { r: ["language"], when: (a) => a.length === 0 || a[0] === "list" || (a[0] === "locale" && a.length === 1) },
  { r: ["dev", "status"] }, { r: ["capture", "webcam", "list"] }, { r: ["drive", "info"] }, { r: ["weather", "status"] },
];
// Never run from here, even in an ask that may change things.
const REFUSED = {
  update: "an update needs sudo, restarts services and can take minutes; run `omarchy update` in a terminal",
  reinstall: "a reinstall replaces the configuration; run it in a terminal",
  system: "lock, logout, suspend, reboot and shutdown end the session",
  agent: "it signs in to subscription accounts or launches an agent in a terminal",
  setup: "the setup wizards ask questions in a terminal",
  launch: "it opens a program in the desktop session and does not end",
  show: "it waits for a key press",
  menu: "a menu waits for a person (only `menu keybindings --print` is run)",
  dev: "it is for developing Omarchy itself",
};

/** Sort an `omarchy` argument list into "read", "change" or "refuse". */
export function classify(args) {
  const a = args.map(String);
  if (a[0] === "omarchy") a.shift();
  if (!a.length) return { kind: "read", route: [] };
  if (a.at(-1) === "--help" || a.at(-1) === "-h" || a[0] === "--help" || a[0] === "help") return { kind: "read", route: a };
  if (has(a, "-i", "--interactive")) return { kind: "refuse", why: "interactive mode waits for a person" };
  const words = [];
  for (const x of a) {
    if (x.startsWith("-")) break;
    words.push(x);
  }
  // Aliases the help lists: `omarchy screenshot` is `capture screenshot`, `omarchy screenrecord` is `capture screenrecording`.
  if (words[0] === "screenshot") words.splice(0, 1, "capture", "screenshot");
  else if (words[0] === "screenrecord") words.splice(0, 1, "capture", "screenrecording");
  if (words[0] === "capture" && words[1] === "screenshot") {
    const mode = words[2] ?? a.find((x) => !x.startsWith("-"));
    if (mode !== "fullscreen") return { kind: "refuse", why: "this mode waits for a pointer selection; use `capture screenshot fullscreen save`" };
    return { kind: "change", route: words };
  }
  if (words[0] === "capture" && ["text", "qr"].includes(words[1])) return { kind: "refuse", why: "it waits for a pointer selection" };
  if (words[0] === "capture" && words[1] === "screenrecording") {
    if (has(a, "--status")) return { kind: "read", route: words };
    if (!has(a, "--fullscreen", "--stop-recording")) return { kind: "refuse", why: "without --fullscreen it opens a region picker" };
    return { kind: "change", route: words };
  }
  const first = words[0] ?? a[0];
  const isRead = (() => {
    let best = null;
    for (const e of READS) {
      if (e.r.length > words.length || !e.r.every((w, i) => words[i] === w)) continue;
      if (e.when && !e.when(a.slice(e.r.length))) continue;
      if (!best || e.r.length > best.r.length) best = e;
    }
    return !!best;
  })();
  if (isRead) return { kind: "read", route: words };
  if (REFUSED[first]) return { kind: "refuse", why: REFUSED[first] };
  if (first?.startsWith("omarchy-")) return { kind: "refuse", why: "call it as `omarchy <group> <action>`" };
  return { kind: "change", route: words };
}

function exec(file, args, { cwd, timeoutMs = 60_000, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = execFile(file, args, { cwd, timeout: timeoutMs, maxBuffer: 64 << 20, encoding: "utf8", detached: true, env: { ...process.env, NO_COLOR: "1", TERM: "dumb", PAGER: "cat", ...env } }, (err, stdout, stderr) => {
      if (err?.code === "ENOENT") resolve({ code: 127, out: "", err: `${file} is not installed` });
      else resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: mask(stdout), err: mask(stderr).slice(0, 4000), ...(err?.killed ? { timedOut: true } : {}) });
    });
    child.stdin?.end();
  });
}

const HYPR_READS = new Set(["configerrors", "getoption", "binds", "version", "monitors", "workspaces", "activeworkspace"]);

// Inside ~/.config an edit may go anywhere a person's own settings live; never into what Omarchy
// ships and never into a file that holds credentials.
function editable(file, configDir) {
  const p = path.resolve(expand(file));
  if (!p.startsWith(configDir + path.sep)) deny(`${p} is outside ${configDir}; user overrides live there. Omarchy's own files (/usr/share/omarchy, $OMARCHY_PATH) are replaced on update and are never edited`);
  if (isSecret(p)) deny(`${p} can hold a credential`);
  return p;
}
const backup = (p) => {
  if (!fs.existsSync(p)) return null;
  const b = `${p}.bak.${Math.floor(Date.now() / 1000)}`;
  fs.copyFileSync(p, b);
  return b;
};

const NAME = /^[a-z][a-z0-9-]{1,30}$/;
const RESERVED = /^(omarchy|qt|test|build|bin|src)$/;
function copyTemplate(from, to, vars, made) {
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const rel = ent.name === "dot-gitignore" ? ".gitignore" : ent.name.replaceAll("__name__", vars.name);
    const dst = path.join(to, rel);
    if (ent.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyTemplate(path.join(from, ent.name), dst, vars, made);
    } else {
      let text = fs.readFileSync(path.join(from, ent.name), "utf8");
      for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, v);
      fs.writeFileSync(dst, text, { mode: from.endsWith("/bin") || /\/bin$/.test(from) ? 0o755 : 0o644 });
      made.push(path.relative(made.root, dst));
    }
  }
}

function resolveOmarchyPath(settings) {
  const cands = [expand(settings?.OMARCHY_PATH || ""), "/usr/share/omarchy"].filter(Boolean);
  return cands.find((c) => isDir(path.join(c, "themes"))) ?? cands[0];
}

export function make({ settings, push, kitDir, cwd, act }) {
  const root = resolveOmarchyPath(settings);
  // Omarchy itself reads ~/.config and ~/.local/state under $HOME, whatever XDG_* says.
  const configDir = path.join(home, ".config");
  const stateDir = path.join(home, ".local/state/omarchy");
  const readable = [root, "/usr/share/omarchy", configDir, stateDir];
  const here = cwd || process.cwd();
  const env = { OMARCHY_PATH: root };

  const readOk = (file) => {
    const p = path.resolve(expand(file));
    if (!readable.some((r) => p === r || p.startsWith(r + path.sep))) deny(`${p} is outside Omarchy's files, ~/.config and Omarchy's state folder`);
    if (isSecret(p)) deny(`${p} can hold a credential`);
    return p;
  };

  const api = {
    path: root,
    config: configDir,
    state: stateDir,
    cwd: here,
    act: !!act,
    isSecret,
    classify,

    /** `omarchy <args>` (no shell). Reading commands run; changing ones need act; some are refused. Never throws on a non-zero exit. */
    async run(...args) {
      const c = classify(args);
      if (c.kind === "refuse") deny(`omarchy ${args.join(" ").slice(0, 60)}: ${c.why}`);
      if (c.kind === "change" && !act) notInThisAsk(`omarchy ${args.join(" ").slice(0, 80)}`);
      const a = args.map(String);
      if (a[0] === "omarchy") a.shift();
      return exec("omarchy", a, { cwd: here, env });
    },
    /** As run, but returns stdout (trailing newlines removed) and throws the command's own error on a non-zero exit. */
    async text(...args) {
      const r = await api.run(...args);
      if (r.code !== 0) throw new Error(`omarchy ${args.join(" ")} exited ${r.code}: ${(r.err || r.out).trim().slice(0, 600)}`);
      return r.out.replace(/\n+$/, "");
    },
    /** hyprctl: configerrors, getoption, binds, version, monitors, workspaces are always allowed; `reload` needs act. */
    async hypr(...args) {
      const sub = args.find((x) => !String(x).startsWith("-"));
      if (sub === "reload") {
        if (!act) notInThisAsk("hyprctl reload");
      } else if (!HYPR_READS.has(sub)) deny(`hyprctl ${sub ?? ""}: only configerrors, getoption, binds, version, monitors, workspaces (and reload when asked to change) are run here; the desktop kit operates windows`);
      return exec("hyprctl", args.map(String), { cwd: here });
    },

    /** Read a file under Omarchy's folder, ~/.config or Omarchy's state folder. Lines from..to (1-based, at most 400). A file that can hold a credential is refused. */
    read(file, o = {}) {
      const p = readOk(file);
      const lines = fs.readFileSync(p, "utf8").split("\n");
      const from = Math.max(1, o.from ?? 1);
      const to = Math.min(lines.length, o.to ?? from + 399, from + 399);
      return { file: p, from, to, lines: lines.length, text: mask(lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`).join("\n")) };
    },
    /** Entries of a folder with their kind: {name, kind: "dir"|"file"|"link", target?}. Names that can hold credentials are left out. */
    list(dir) {
      const p = readOk(dir);
      return fs.readdirSync(p, { withFileTypes: true }).filter((e) => !isSecret(path.join(p, e.name))).map((e) => {
        const full = path.join(p, e.name);
        const link = e.isSymbolicLink();
        let kind = e.isDirectory() ? "dir" : "file";
        if (link) {
          try {
            kind = fs.statSync(full).isDirectory() ? "dir" : "file";
          } catch {
            kind = "broken-link";
          }
        }
        return { name: e.name, kind: link ? "link" : kind, ...(link ? { target: fs.readlinkSync(full), targetKind: kind } : {}) };
      });
    },

    /** Replace `from` with `to` in a file under ~/.config: exactly one occurrence, or all with {all: true}. The old file is saved as <file>.bak.<epoch>. Needs act. */
    edit(file, from, to, o = {}) {
      if (!act) notInThisAsk("editing a file under ~/.config");
      const p = editable(file, configDir);
      const text = fs.readFileSync(p, "utf8");
      const n = text.split(from).length - 1;
      if (n === 0) throw new Error(`text not found in ${p}`);
      if (n > 1 && !o.all) throw new Error(`text found ${n} times in ${p}; add context or pass {all: true}`);
      const bak = backup(p);
      fs.writeFileSync(p, text.replaceAll(from, to));
      return { file: p, replaced: n, backup: bak };
    },
    /** Write a whole file under ~/.config (folders are created). An existing file is saved as <file>.bak.<epoch>. Needs act. */
    write(file, text) {
      if (!act) notInThisAsk("writing a file under ~/.config");
      const p = editable(file, configDir);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const bak = backup(p);
      fs.writeFileSync(p, text);
      return { file: p, bytes: Buffer.byteLength(text), backup: bak };
    },

    /**
     * New app project from the kit's templates (C++, Qt Quick, qmake): <dir>/<name>.pro, bin/, src/, tests/, pkgbuild/, README, LICENSE, git repository.
     * name: lowercase letters, digits, hyphens. Needs act. dir defaults to ./<name> in the folder the caller works in; it must not exist or be empty.
     */
    async scaffold(name, o = {}) {
      if (!act) notInThisAsk("scaffolding an app project");
      if (!NAME.test(name) || RESERVED.test(name)) deny(`app name "${name}": use 2 to 31 lowercase letters, digits or hyphens, starting with a letter`);
      const dir = path.resolve(expand(o.dir || path.join(here, name)));
      if (fs.existsSync(dir) && fs.readdirSync(dir).length) deny(`${dir} exists and is not empty`);
      let author = o.author;
      if (!author) author = (await exec("git", ["config", "user.name"])).out.trim() || "the author";
      const description = String(o.description || "One line on what it does").replace(/['"\\{}]/g, "").slice(0, 120);
      const vars = { name, Name: o.display || name.charAt(0).toUpperCase() + name.slice(1), description, author: author.replace(/[{}]/g, ""), year: String(new Date().getFullYear()) };
      const tpl = path.join(kitDir, "templates");
      fs.mkdirSync(dir, { recursive: true });
      const made = [];
      made.root = dir;
      copyTemplate(tpl, dir, vars, made);
      for (const f of ["bin/build", "bin/test", "bin/install"]) fs.chmodSync(path.join(dir, f), 0o755);
      const files = {
        LICENSE: `MIT License\n\nCopyright (c) ${vars.year} ${vars.author}\n\nParts of the Theme and Translator classes follow Omacut and Monologue\n(MIT, David Heinemeier Hansson).\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`,
        "README.md": `# ${vars.Name}\n\n${description}\n\n## Build and run\n\n\`\`\`sh\nbin/build\nbuild/${name}\nbin/test\nbin/install   # makepkg -fsi: installs the binary, the desktop entry and the icon\n\`\`\`\n\n## Shortcuts\n\n| Key | Action |\n|---|---|\n| ? | Show the shortcuts |\n| Space | Main action |\n| Q | Quit |\n`,
      };
      for (const [f, t] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, f), t);
        made.push(f);
      }
      const g = await exec("git", ["init", "-q", "-b", "main"], { cwd: dir });
      return { dir, name, files: made.sort(), git: g.code === 0 ? "initialised, nothing committed" : `git init failed: ${g.err.trim()}` };
    },
  };
  return api;
}
