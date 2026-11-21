# ask-kit-omarchy

An [ask-kit](https://github.com/temet-ai/ask-kit) kit that lets your coding agent's `ask` tool
answer questions about [Omarchy](https://omarchy.org/) on your machine, and change its
configuration when asked. A cheap model runs the `omarchy` command and reads Omarchy's files
outside your agent's context and answers with the command, the file and the line.

Questions from its bench, of the kinds agents answer by hand with Omarchy's commands and files:

- Which omarchy commands toggle the night light and restart the service behind it?
- Which setting makes the screen lock after ten minutes, in which file, and what does the number mean?
- Check this app project against the Omarchy app conventions: which files miss which convention?

## Install

You need [ask-kit](https://github.com/temet-ai/ask-kit#set-it-up) and Omarchy (the `omarchy`
command on PATH).

Paste this into your agent:

```
Read ~/.config/ask-kit/AGENTS.md, then add this kit: github.com/temet-ai/ask-kit-omarchy
```

Or run it yourself:

```sh
ask-kit kit install temet-ai/ask-kit-omarchy        # shows what it reads, changes and runs
ask-kit kit install temet-ai/ask-kit-omarchy --yes  # installs and enables it
```

Restart your agents so `ask` lists `omarchy`. One setting: `OMARCHY_PATH`, the folder Omarchy
ships its commands, defaults and stock themes in. It defaults to `~/.local/share/omarchy`; the
kit also tries `/usr/share/omarchy` (where the package puts it) when that folder does not exist,
and an `OMARCHY_PATH` in the environment wins over both.

## What it carries

| | |
|---|---|
| Scripts | `version` (installed version, channel, update waiting, what the newest upgrades changed, migrations), `commands` (the `omarchy` command for a job, searched by word), `theme` (current theme with its colours, installed themes, one theme's files), `where-to-edit` (which file holds a setting, Omarchy's default for it, which one wins, how to apply it), `drift` (what differs from the shipped config, shell.json setting by setting), `app-check` (does a Qt Quick and qmake app follow the Omarchy app conventions, each miss named by file) |
| Skills | `customize`, `theme`, `shell-plugin`, `hooks`, `capture`, `report-bug`, `new-app`, `qt-traps`: playbooks the investigator loads when the job calls for one |
| Roles | `customizer` for requests to change how the desktop looks or behaves; `app-builder` for building, scaffolding or checking an app for Omarchy |

Each script also runs with no model: `ask-kit run omarchy theme`, or `ask(do: "omarchy.theme")`
from an agent.

It covers what Omarchy owns: its commands, the layout of defaults and overrides, themes,
updates and the app conventions. Which file under `~/.config` sets some keybinding in general is
the dotfiles kit, the live desktop (windows, workspaces, screenshots, clicking) the desktop kit,
coredumps the crash kit and services the ops or systemd kit.

## What it can change

A question never changes anything. When the request asks for a change, it can:

- run an `omarchy` command that changes something: `theme set`, `font set`, `refresh`, `restart`,
  `toggle`, `bar move`, `plugin clone`, `hook install`, `install`, `pkg add`, `reminder`;
- edit or write a file under `~/.config`, after saving the old one as `<file>.bak.<epoch>`;
- reload Hyprland (`hyprctl reload`);
- scaffold an app project from the kit's templates.

`omarchy.mjs` sorts every `omarchy` call into reading, changing or refused, and a changing call
is refused unless the caller asked for a change (`act`). It also checks each call before it runs:

- Never run, even when asked to act: `update`, `reinstall`, `system`, `setup`, `launch`, `menu`
  (except `menu keybindings --print`), `agent`, `show`, `dev`, interactive flags, and the
  screenshot and recording modes that wait for a pointer selection. They need a terminal or a
  person.
- Files that can hold credentials (tokens, secrets, auth files, `.env`, keys, cookies, agent
  sign-ins) are never read or written. What the investigator reads goes to a model.
- Edits stay inside `~/.config`. Omarchy's own folder is replaced by every update and is read-only
  here.

Its instructions tell it to do what the request names and nothing wider, and to run
`omarchy refresh` (which overwrites a config with the shipped one) only when asked for a reset.

## How well it works

`bench/questions.json` holds seven questions and two script runs (run `bench/make-fixture.sh`
first to build the two app projects they ask about), each with patterns its answer must hold.
It has not been run on a model yet; `ask-kit kit test omarchy` runs it.
