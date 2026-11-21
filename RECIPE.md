# Recipe: omarchy kit

## What it answers

Omarchy on this machine: the installed version and what the latest update changed; which
`omarchy` command does a job; the current theme, its colours and the installed themes; which file
to edit for a customisation, where Omarchy's default lives and which one wins; whether the user's
config has drifted from the shipped one; and whether a Qt Quick and qmake app project follows the
conventions of Omarchy's own apps. It changes things when asked: `omarchy` commands that change
state, files under `~/.config`, and a new app project.

## What it needs

- The `omarchy` command on PATH (`requires`), Linux (`platforms`).
- `OMARCHY_PATH` (setting, default `~/.local/share/omarchy`, with `/usr/share/omarchy` tried when
  the folder is missing): where Omarchy's `bin`, `config`, `default`, `themes` and `migrations` are.
- Optional: `pacman` and `/var/log/pacman.log` for the upgrade history, `hyprctl` for config
  errors, `diff` for the `drift` diff. A scaffolded app needs `qmake6`, `make` and a C++ compiler
  to build; the kit does not build it.

## What it reads and runs

- Runs `omarchy` and `hyprctl` (no shell) through `omarchy.mjs`; reads Omarchy's folder,
  `~/.config` and `~/.local/state/omarchy`, and an app project folder named in a question.
- Refuses a call that changes something unless the ask may act; refuses what needs a terminal or
  a person; refuses and never reads credential-looking files; masks secrets in output.

## Rebuild it from an empty folder

Write `ask-kit.toml` with one `module` source named `omarchy`, an `OMARCHY_PATH` setting,
`requires = ["omarchy"]`, and `acts` written as prose plus `omarchy.edit`, `omarchy.write` and
`omarchy.scaffold` (the host cannot tell `omarchy theme current` from `omarchy theme set`, so the
module does the holding back). The module exports `make({settings, push, kitDir, cwd, act})`
returning a client with `run(...args)` and `text(...args)` (every call classified as read, change
or refuse from a table of reading routes; aliases `screenshot` and `screenrecord` are expanded;
changing throws without `act`), `hypr(...args)` (configerrors and a few reads; `reload` needs
`act`), `read(file, {from, to})` and `list(dir)` limited to Omarchy's folder, `~/.config` and
Omarchy's state folder and refusing credential names, and, with `act`, `edit`, `write` (inside
`~/.config`, backup first) and `scaffold(name, {dir, description})` copying `templates/`. Describe
it exactly in `api.d.ts`.

Scripts: `version` (`omarchy version`, `channel current`, `update available`, `migrate --pending`,
the `omarchy*` lines of `pacman.log`, the migration files with the first `echo` of each),
`commands` (`omarchy commands --json`, scored by word; falls back to `omarchy-*` on PATH),
`theme` (`~/.local/state/omarchy/current`, stock and user theme folders, `colors.toml`),
`where-to-edit` (a table of topics with user file, default, who wins, how to apply; checks the
files exist), `drift` (each file under `$OMARCHY_PATH/config` against `~/.config`, shell.json by
key path), `app-check` (about fifty file and content checks of an app folder).

Skills in `skills/`: customize, theme, shell-plugin, hooks, capture, report-bug, new-app,
qt-traps. Roles in `roles/`: customizer, app-builder. `templates/` holds the files of a minimal
Omarchy app (taken from Omarchy's own apps, MIT) with `{{name}}`, `{{Name}}`, `{{description}}`.

## Bench

`bench/questions.json`: seven questions of the kinds agents answer by hand, and two script runs.
`bench/make-fixture.sh` builds the two app projects (`clacks` from the templates, `clacks-broken`
with defects) in `bench/fixtures`, which git ignores.
