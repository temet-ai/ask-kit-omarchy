import fs from "node:fs";
import path from "node:path";

export const meta = {
  purpose:
    "Which file to edit for a customisation, where Omarchy's default for it lives, which of the two wins, and how to apply the change. Matches the request against a table of what Omarchy lets a user change (keybindings, monitors, input, look and feel, window rules, autostart, night light, the bar and shell, plugins, the menu, themes, theme templates, backgrounds, terminals, hooks, other apps) and reports whether each file exists on this machine. Without `about`, lists every topic.",
  params: { about: "what to change, in words: \"keybinding\", \"gaps\", \"lock after ten minutes\", \"alacritty font\"", max: "most topics to return, default 3" },
  returns: "{topics:[{topic, edit:[{path, exists, mtime}], default:[{path, exists}], wins, apply, playbook, notes}]} or {topics:[{topic, keywords}]} without `about`",
  example: 'await scripts.run("where-to-edit", { about: "change the window gaps" })',
};

const U = "~/.config";
// Each topic: where the user's file is (`edit`), where Omarchy's default is (`def`, under $OMARCHY_PATH), who wins and how it takes effect.
const TOPICS = [
  { topic: "keybindings", kw: ["keybinding", "key bind", "bind", "shortcut", "hotkey", "super", "unbind", "rebind"], edit: [`${U}/hypr/bindings.lua`], def: ["default/hypr/bindings.lua", "default/hypr/bindings"], wins: "the user file loads after the defaults. To replace a default key use o.rebind(keys, description, action); o.bind adds; hl.unbind removes", apply: "Hyprland reloads on save; confirm with `hyprctl reload` then `hyprctl configerrors`. List current bindings with `omarchy menu keybindings --print` first and say what a rebound key did before", playbook: "customize" },
  { topic: "monitors and display", kw: ["monitor", "display", "resolution", "refresh rate", "scale", "screen layout", "external screen"], edit: [`${U}/hypr/monitors.lua`], def: ["config/hypr/monitors.lua"], wins: "the user file is the only monitor config; the shipped copy is its starting point", apply: "reload as for keybindings; `hyprctl monitors all` lists outputs and modes", playbook: "customize" },
  { topic: "keyboard, mouse and touchpad input", kw: ["input", "keyboard layout", "touchpad", "mouse", "repeat", "sensitivity", "natural scroll", "caps lock"], edit: [`${U}/hypr/input.lua`], def: ["default/hypr/input.lua", "config/hypr/input.lua"], wins: "the user file loads after the defaults", apply: "reload as for keybindings", playbook: "customize" },
  { topic: "look and feel: gaps, borders, rounding, blur, opacity, animations", kw: ["gap", "border", "rounding", "rounded", "blur", "opacity", "animation", "look", "shadow", "appearance"], edit: [`${U}/hypr/looknfeel.lua`], def: ["default/hypr/looknfeel.lua", "config/hypr/looknfeel.lua"], wins: "the user file loads after the defaults", apply: "reload as for keybindings", playbook: "customize" },
  { topic: "autostart", kw: ["autostart", "startup", "start at login", "on boot", "launch at start"], edit: [`${U}/hypr/autostart.lua`], def: ["default/hypr/autostart.lua", "config/hypr/autostart.lua"], wins: "both run; the user file adds to the defaults", apply: "takes effect at next login; `hyprctl reload` does not restart programs", playbook: "customize" },
  { topic: "window rules, layer rules, workspace settings", kw: ["window rule", "layer rule", "windowrule", "float", "workspace rule", "workspace setting", "workspace layout", "tile", "size of window", "opacity of"], edit: [`${U}/hypr/hyprland.lua`], def: ["default/hypr/windows.lua", "config/hypr/hyprland.lua"], wins: "rules in the user's hyprland.lua (or a module it requires) load after the defaults; use the o.window(match, rules) helper", apply: "reload as for keybindings. Rule syntax changes between Hyprland versions: read the wiki page for window rules before writing one", playbook: "customize" },
  { topic: "night light", kw: ["night light", "nightlight", "blue light", "hyprsunset", "warm", "color temperature"], edit: [`${U}/hypr/hyprsunset.conf`], def: ["config/hypr/hyprsunset.conf"], wins: "the user file is the only config", apply: "`omarchy restart hyprsunset`; toggle now with `omarchy toggle nightlight` (hyprctl does not read this file)", playbook: "customize" },
  { topic: "screen sharing portal", kw: ["screen sharing", "xdph", "portal", "screencast"], edit: [`${U}/hypr/xdph.conf`], def: ["config/hypr/xdph.conf"], wins: "the user file is the only config", apply: "applies when the portal restarts, for example at next login", playbook: "customize" },
  { topic: "bar, widgets, notifications, idle, lock, screensaver (the shell)", kw: ["bar", "widget", "status bar", "notification", "idle", "lock", "screensaver", "shell", "tray", "clock", "workspaces widget", "workspace label", "label"], edit: [`${U}/omarchy/shell.json`], def: ["config/omarchy/shell.json"], wins: "the user file is read by the shell; the shipped copy is the canonical default, restored by `omarchy refresh shell` (which backs the user's up). idle.lock and idle.screensaver are seconds of idleness", apply: "the shell reloads shell.json on save. Move a widget with `omarchy bar move <id> --section right`", playbook: "shell-plugin" },
  { topic: "shell plugins and built-in widgets", kw: ["plugin", "clone widget", "custom widget", "omarchy.workspaces", "qml widget"], edit: [`${U}/omarchy/plugins/<id>/`], def: ["shell/plugins"], wins: "a user plugin with the same function replaces the built-in after `omarchy plugin clone <id>`, which also switches the bar to the clone. Never edit the shipped plugin folder", apply: "saving under ~/.config/omarchy/plugins/ reloads plugin code; `omarchy-shell shell rescanPlugins` forces it", playbook: "shell-plugin" },
  { topic: "launcher and menu entries", kw: ["menu", "launcher", "omarchy menu", "app launcher entry", "extensions"], edit: [`${U}/omarchy/extensions/omarchy-menu.jsonc`], def: ["config/omarchy/extensions/omarchy-menu.jsonc"], wins: "the user file extends the shipped menu", apply: "hot-reloads on save", playbook: "customize" },
  { topic: "change one colour of a stock theme (overlay)", kw: ["theme colour", "theme color", "tweak theme", "overlay", "colors.toml", "accent"], edit: [`${U}/omarchy/themes/<theme-slug>/colors.toml`], def: ["themes/<theme-slug>/colors.toml"], wins: "a user folder with the same slug as a stock theme is an overlay: the stock theme is copied first and the user's files win over it", apply: "`omarchy theme set <slug>` again", playbook: "theme" },
  { topic: "new theme", kw: ["new theme", "own theme", "custom theme", "create theme", "install theme", "fork theme"], edit: [`${U}/omarchy/themes/<new-name>/`], def: ["themes/<an existing slug, as a model>"], wins: "user themes sit beside the stock ones; a theme installed from git has its Lua, terminal and VS Code files dropped", apply: "`omarchy theme set \"<name>\"`", playbook: "theme" },
  { topic: "theme templates (how an app is themed for every theme)", kw: ["template", "themed", ".tpl", "tpl", "theme an app"], edit: [`${U}/omarchy/themed/<file>.tpl`], def: ["default/themed/<file>.tpl"], wins: "a user template with the same name replaces the built-in one for every theme", apply: "`omarchy theme set <current slug>` regenerates the app files", playbook: "theme" },
  { topic: "backgrounds", kw: ["background", "wallpaper", "backgrounds"], edit: [`${U}/omarchy/backgrounds/<theme-slug>/`], def: ["themes/<theme-slug>/backgrounds"], wins: "images in both folders are offered; `omarchy theme bg next` cycles", apply: "`omarchy theme bg next`", playbook: "theme" },
  { topic: "terminal emulator", kw: ["terminal", "alacritty", "foot", "kitty", "ghostty", "terminal font", "terminal config"], edit: [`${U}/alacritty/alacritty.toml`, `${U}/foot/foot.ini`, `${U}/kitty/kitty.conf`, `${U}/ghostty/config`], def: ["config/alacritty/alacritty.toml", "config/foot/foot.ini", "config/kitty/kitty.conf", "config/ghostty/config"], wins: "the user copy is the only config; the shipped one is what `omarchy refresh config <path>` restores (backing the user's up)", apply: "`omarchy restart terminal` (foot picks it up in new windows)", playbook: "customize" },
  { topic: "hooks (scripts that run on theme change, font change, update, boot, low battery)", kw: ["hook", "on theme change", "after update", "post-update", "run a script when", "theme-set"], edit: [`${U}/omarchy/hooks/<event>.d/`], def: ["config/omarchy/hooks"], wins: "every executable in the .d folder runs; a flat hooks/<event> file runs first", apply: "`omarchy hook install <event> <script>` copies and marks it executable", playbook: "hooks" },
  { topic: "other apps: btop, lazygit, starship, git, tmux, fastfetch", kw: ["btop", "lazygit", "starship", "tmux", "fastfetch", "git config", "prompt"], edit: [`${U}/btop/btop.conf`, `${U}/lazygit/config.yml`, `${U}/starship.toml`, `${U}/git/config`, `${U}/tmux/tmux.conf`, `${U}/fastfetch/config.jsonc`], def: ["config/btop", "config/lazygit", "config/starship.toml", "config/git", "config/tmux/tmux.conf"], wins: "the user copy is the config; fastfetch has a system default in /etc/fastfetch/config.jsonc that the user file overrides", apply: "restart the program; `omarchy refresh config <path relative to ~/.config>` restores the shipped copy", playbook: "customize" },
  { topic: "font, language, default apps, reminders (commands, no file)", kw: ["font", "language", "default browser", "default app", "reminder", "timezone"], edit: [], def: [], wins: "set with commands: `omarchy font set <name>`, `omarchy language <code>`, `omarchy default ...`, `omarchy reminder <minutes> [message]`", apply: "immediately", playbook: "customize" },
];

function stat(p, omarchy, isDefault) {
  const raw = isDefault ? path.join(omarchy.path, p) : p;
  const full = isDefault ? raw : raw.replace(/^~\/\.config/, omarchy.config);
  try {
    const s = fs.statSync(full);
    return { path: isDefault ? "$OMARCHY_PATH/" + p : p, exists: true, ...(isDefault ? {} : { mtime: s.mtime.toISOString().slice(0, 10) }), ...(s.isDirectory() ? { dir: true } : {}) };
  } catch {
    return { path: isDefault ? "$OMARCHY_PATH/" + p : p, exists: false };
  }
}

export default async function ({ omarchy }, { about, max = 3 } = {}) {
  if (!about) return { omarchyPath: omarchy.path, topics: TOPICS.map((t) => ({ topic: t.topic, keywords: t.kw.slice(0, 6) })) };
  const q = String(about).toLowerCase();
  const scored = TOPICS.map((t) => ({ t, s: t.kw.reduce((n, k) => n + (q.includes(k) ? k.length : 0), 0) + (q.includes(t.topic.split(" ")[0].replace(/,$/, "")) ? 2 : 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return { omarchyPath: omarchy.path, matched: false, note: "no topic matches; these exist", topics: TOPICS.map((t) => t.topic) };
  return {
    omarchyPath: omarchy.path,
    note: "Never edit anything under $OMARCHY_PATH (the omarchy package replaces it on update); user files under ~/.config win or load after the defaults as `wins` says. Back a file up before editing it.",
    topics: scored.slice(0, max).map(({ t }) => ({ topic: t.topic, edit: t.edit.map((p) => stat(p, omarchy, false)), default: t.def.map((p) => stat(p, omarchy, true)), wins: t.wins, apply: t.apply, playbook: t.playbook })),
  };
}
