interface OmarchyResult { code: number; out: string; err: string; timedOut?: boolean }

declare const omarchy: {
  path: string;   // Omarchy's own folder (OMARCHY_PATH): bin, config, default, themes, shell, migrations. Never edited.
  config: string; // the user's config folder (~/.config); override files live here
  state: string;  // Omarchy's state folder (~/.local/state/omarchy): current/theme, current/theme.name, migrations
  cwd: string;    // the folder the calling agent works in
  act: boolean;   // true when this ask may change things

  // `omarchy <group> <action> ...`, no shell: pass each argument separately. omarchy.run("theme", "list"),
  // omarchy.run("theme", "set", "Tokyo Night") (a theme name with a space is one argument).
  // Never throws on a non-zero exit. It throws for:
  //  - a command that changes something (theme set, refresh, restart, toggle, install, pkg add, bar move, plugin clone, hook install, ...) when omarchy.act is false;
  //  - what never ends or needs a person, even when act is true: update, reinstall, system (lock, reboot ...), setup, launch, show, menu (except `menu keybindings --print`), agent, dev, -i. Tell the caller to run those in a terminal;
  //  - `debug` without both --no-sudo and --print, and `migrate` without --pending.
  // Reading commands: version, version channel, version pkgs, channel current, theme list|current|bg current, font list|current, plugin list|validate,
  // update available, migrate --pending, debug --no-sudo --print, menu keybindings --print, commands [--json] [--all], bar get, reminder show,
  // powerprofiles list, battery status, network status, plymouth list|current, <anything> --help (prints help, runs nothing).
  run(...args: string[]): Promise<OmarchyResult>;
  // As run, but returns stdout (trailing newlines removed) and throws the command's own error on a non-zero exit.
  text(...args: string[]): Promise<string>;
  // hyprctl for configuration checks: configerrors (what a config reload reported), getoption, binds, version, monitors, workspaces.
  // `reload` needs act. Use configerrors after editing a ~/.config/hypr file. Windows and clicking belong to the desktop kit.
  hypr(...args: string[]): Promise<OmarchyResult>;

  // Lines from..to (1-based, at most 400) of a file under Omarchy's folder, ~/.config or Omarchy's state folder, numbered "N\tline".
  // A file that can hold a credential (token, secret, auth, .env, key, cookie, agent accounts) throws.
  read(file: string, o?: { from?: number; to?: number }): { file: string; from: number; to: number; lines: number; text: string };
  // Entries of a folder under those places: {name, kind: "dir"|"file"|"link", target?}. Credential-looking names are left out.
  list(dir: string): { name: string; kind: string; target?: string; targetKind?: string }[];
  // Does this path look like it holds credentials? (The kit neither reads nor writes such a path.)
  isSecret(path: string): boolean;
  // "read" | "change" | "refuse" for an `omarchy` argument list, without running it.
  classify(args: string[]): { kind: "read" | "change" | "refuse"; why?: string; route?: string[] };

  // Needs act. Replace `from` with `to` in a file under ~/.config: exactly one occurrence, or all with {all: true}.
  // The old file is saved as <file>.bak.<epoch> first. Refuses a path outside ~/.config (never edit $OMARCHY_PATH) and credential files.
  edit(file: string, from: string, to: string, o?: { all?: boolean }): { file: string; replaced: number; backup: string | null };
  // Needs act. Write a whole file under ~/.config (folders are created); an existing file is saved as <file>.bak.<epoch>.
  write(file: string, text: string): { file: string; bytes: number; backup: string | null };
  // Needs act. New app project from the kit's templates: <name>.pro, bin/build|test|install, src/ (main.cpp, backend, theme, translator, Main.qml,
  // resources.qrc, i18n/en.json), tests/, pkgbuild/ (PKGBUILD, .desktop, .svg), README.md, LICENSE, .gitignore, and `git init` (nothing committed).
  // name: 2 to 31 lowercase letters, digits, hyphens. dir defaults to ./<name>; it must not exist or be empty.
  // author defaults to `git config user.name`; description is the one line for README, PKGBUILD and .desktop.
  scaffold(name: string, o?: { dir?: string; display?: string; description?: string; author?: string }): Promise<{ dir: string; name: string; files: string[]; git: string }>;
};
