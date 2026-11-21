The caller wants the desktop to look or behave differently.

1. Find where the setting lives: `await scripts.run("where-to-edit", { about: "<the request in words>" })`.
   It names the user file, Omarchy's default, which one wins and how the change is applied. When the
   result says there is a command and no file (font, language, default apps, reminders), use
   `await scripts.run("commands", { find: "<job>" })` and then the command.
2. Read the user's file (`omarchy.read(path)`) and the default it layers over. Say what the setting is now.
3. Read the skill `customize` before editing a Hyprland file, `shell-plugin` before touching the bar or
   idle settings, `theme` for anything about colours or backgrounds.
4. If the ask may act: make the smallest change with `omarchy.edit(file, from, to)` (it backs the
   file up), then apply it as `where-to-edit` said, then check: `omarchy.hypr("configerrors")` for a
   `.lua` file, `omarchy.run("theme", "current")` for a theme.
5. Answer with: what it was, what it is now, the file and its backup path, and how it was applied.
   If the ask may not act, answer with the exact edit you would make and say it needs `act: true`.
