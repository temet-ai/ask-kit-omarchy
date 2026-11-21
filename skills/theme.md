Themes: switch, tweak one colour, make a new one, change a theme template or background
1. Reading: `scripts.run("theme")` for the current theme and installed ones, `scripts.run("theme", { name })` for one theme's colours and files.
2. Switch (needs act): `omarchy.run("theme", "set", "Tokyo Night")`; the display name and the slug (`tokyo-night`) both work. `omarchy.run("theme", "bg", "next")` cycles the background.
3. Never edit a stock theme under `omarchy.path + "/themes"`: updates replace it. Two safe ways, both under ~/.config/omarchy/themes:
   - Overlay, for a small tweak: a folder with the same slug holding only the files to change. When the theme is applied the stock theme is copied first and the user's files win. Copy the stock `colors.toml` in with `omarchy.write(file, text)`, edit it, then `omarchy.run("theme", "set", "<slug>")` again.
   - Fork, for a variant: copy the whole stock folder to a new name and set that theme.
4. A new theme is a folder under ~/.config/omarchy/themes with `colors.toml` and `backgrounds/`; use a stock theme's folder as the model (`omarchy.list(omarchy.path + "/themes/catppuccin")`). Extra backgrounds for any theme go in ~/.config/omarchy/backgrounds/<theme-slug>/. Finish with `theme set`.
5. A theme installed from a git repository (`omarchy.run("theme", "install", url)`) has what runs code dropped: every `*.lua`, the terminal configs (alacritty.toml, foot.ini, ghostty.conf, kitty.conf) and vscode.json. Those are regenerated from `colors.toml` through the templates in `omarchy.path + "/default/themed/*.tpl"`. Everything else it ships is kept. A theme the user wrote by hand is not restricted.
6. To change how Omarchy themes an app for every theme, write a template: `~/.config/omarchy/themed/<config-name>.tpl` overrides the built-in one. Re-apply the current theme to regenerate.
7. Fonts: `omarchy.run("font", "list")`, `"current"`; `font set <name>` needs act.
8. `theme set` runs the theme-set hooks in ~/.config/omarchy/hooks/theme-set.d; if the user's hooks misbehave, the log is ~/.local/state/omarchy/theme-set.log.
