import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const meta = {
  purpose:
    "Whether a Qt Quick / qmake app project follows the conventions Omarchy's own apps use, with each miss named by file: project layout (<name>.pro, bin/build, bin/test, bin/install, flat src/, tests/), the app's setup (QGuiApplication, setDesktopFileName, the Material style, portal file dialogs), following the Omarchy theme live (colors.toml accent, fallback colour, rounding), keyboard shortcuts and translatable strings in QML, the Arch package (PKGBUILD, .desktop entry, icon, licence) and the repository files. Reads the project only.",
  params: { path: "the project folder, default the folder the caller works in", name: "the app name, default the TARGET of the .pro file or the folder name" },
  returns: "{path, name, passed, total, miss:[{file, check, detail}], warn:[{file, check, detail}]}. miss breaks a convention the skill requires; warn is advice (translations, shortcuts, optional files).",
  example: 'await scripts.run("app-check", { path: "../my-app" })',
};

const read = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
const exists = (p) => fs.existsSync(p);
// Qt Quick types a component file must not be named after (the engine reports "abstract base class").
const QT_TYPES = new Set(["Item", "ItemView", "View", "ListView", "GridView", "PathView", "Flickable", "Rectangle", "Text", "Image", "Window", "Popup", "Dialog", "Menu", "Pane", "Page", "Button", "Label", "TextField", "Control", "Drawer", "ToolBar", "TabBar", "Loader", "Repeater"]);

export default async function ({ omarchy }, { path: dirArg, name: nameArg } = {}) {
  const root = path.resolve(dirArg ?? omarchy.cwd);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`${root} is not a folder`);
  const miss = [], warn = [], ok = [];
  const add = (level, file, check, detail) => (level === "ok" ? ok.push(check) : (level === "miss" ? miss : warn).push({ file, check, detail }));
  const rule = (cond, level, file, check, detail) => add(cond ? "ok" : level, file, check, detail);

  const pros = fs.readdirSync(root).filter((f) => f.endsWith(".pro"));
  let name = nameArg;
  if (!name && pros.length) name = read(path.join(root, pros[0]))?.match(/^\s*TARGET\s*=\s*(\S+)/m)?.[1] ?? pros[0].replace(/\.pro$/, "");
  name ??= path.basename(root);
  const f = (...p) => path.join(root, ...p);

  // Layout
  if (exists(f("CMakeLists.txt"))) add("miss", "CMakeLists.txt", "no-cmake", "Omarchy apps build with qmake6 and make; no CMake");
  const pro = read(f(`${name}.pro`));
  if (pro == null) add("miss", `${name}.pro`, "pro-file", `no ${name}.pro at the project root${pros.length ? ` (found ${pros.join(", ")})` : ""}`);
  else {
    add("ok", "", "pro-file");
    rule(new RegExp(`^\\s*TARGET\\s*=\\s*${name}\\s*$`, "m").test(pro), "miss", `${name}.pro`, "pro-target", `TARGET should be ${name}: the binary, package, .desktop file and app id share one name`);
    rule(/quickcontrols2/.test(pro) && /\bqml\b/.test(pro) && /\bquick\b/.test(pro), "miss", `${name}.pro`, "pro-modules", "QT needs qml, quick and quickcontrols2");
    rule(!/\bwidgets\b/.test(pro), "miss", `${name}.pro`, "pro-no-widgets", "QT += widgets pulls in QApplication; use QGuiApplication and Qt Quick");
    rule(/c\+\+17/.test(pro), "warn", `${name}.pro`, "pro-cxx17", "CONFIG += c++17 is what the templates set");
    rule(/RESOURCES\s*\+?=.*resources\.qrc/s.test(pro), "miss", `${name}.pro`, "pro-resources", "RESOURCES should compile src/resources.qrc so the QML is inside the binary");
    rule(/dbus/.test(pro), "warn", `${name}.pro`, "pro-dbus", "the xdg-desktop-portal file picker needs QT += dbus");
  }
  for (const b of ["build", "test", "install"]) {
    const p = f("bin", b);
    if (!exists(p)) add("miss", `bin/${b}`, `bin-${b}`, `bin/${b} is missing`);
    else {
      const mode = fs.statSync(p).mode;
      rule(!!(mode & 0o111), "miss", `bin/${b}`, `bin-${b}-exec`, "not executable");
      const t = read(p) ?? "";
      if (b === "build") rule(/qmake6/.test(t) && /\bmake\b/.test(t), "miss", "bin/build", "bin-build-qmake6", "bin/build should run qmake6 and make into build/");
      if (b === "install") rule(/makepkg/.test(t), "miss", "bin/install", "bin-install-makepkg", "bin/install should run makepkg -fsi so the app lands in the launcher");
      if (b === "test") rule(/offscreen/.test(t), "warn", "bin/test", "bin-test-offscreen", "run tests with QT_QPA_PLATFORM=offscreen");
    }
  }
  for (const s of ["main.cpp", "backend.h", "backend.cpp", "theme.h", "theme.cpp", "Main.qml", "resources.qrc"]) rule(exists(f("src", s)), "miss", `src/${s}`, `src-${s}`, `src/${s} is missing`);
  if (exists(f("src"))) {
    const sub = fs.readdirSync(f("src"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "i18n").map((e) => e.name);
    rule(!sub.length, "warn", "src/", "src-flat", `src/ stays flat; found folders ${sub.join(", ")}`);
  }
  rule(exists(f("tests", `${name}_tests.pro`)) && exists(f("tests", `${name}_tests.cpp`)), "miss", `tests/${name}_tests.{pro,cpp}`, "tests", "the Qt Test project is missing");

  // Files in git that should be generated
  if (exists(f(".git"))) {
    try {
      const tracked = execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8", timeout: 10000 }).split("\n");
      const gen = tracked.filter((t) => /^build\/|^pkgbuild\/(pkg|src)\/|\.pkg\.tar\.|(^|\/)(moc_|qrc_|ui_)[^/]*$|(^|\/)Makefile$/.test(t));
      rule(!gen.length, "miss", gen[0] ?? "", "no-generated-files", `generated files are committed: ${gen.slice(0, 4).join(", ")}${gen.length > 4 ? ` and ${gen.length - 4} more` : ""}`);
    } catch {}
  } else add("warn", ".git", "git-repo", "not a git repository; the skill starts every app with git init");
  const ign = read(f(".gitignore"));
  if (ign == null) add("miss", ".gitignore", "gitignore", ".gitignore is missing");
  else rule(/^\/?build\/?$/m.test(ign) && /pkgbuild\/pkg/.test(ign), "miss", ".gitignore", "gitignore-entries", "ignore /build/, /pkgbuild/pkg/, /pkgbuild/src/ and *.pkg.tar.*");

  // main.cpp
  const main = read(f("src", "main.cpp"));
  if (main != null) {
    rule(/QGuiApplication/.test(main) && !/\bQApplication\b/.test(main), "miss", "src/main.cpp", "gui-application", "use QGuiApplication, not QApplication");
    rule(new RegExp(`setDesktopFileName\\(\\s*"${name}"\\s*\\)`).test(main), "miss", "src/main.cpp", "desktop-file-name", `app.setDesktopFileName("${name}") matches the window to ${name}.desktop and its icon`);
    rule(/QQuickStyle::setStyle\(\s*"Material"/.test(main), "miss", "src/main.cpp", "material-style", 'QQuickStyle::setStyle("Material")');
    rule(/setContextProperty\(\s*"theme"/.test(main), "warn", "src/main.cpp", "theme-exposed", 'hand the Theme to QML with setContextProperty("theme", &theme)');
    rule(/Translator/.test(main) || exists(f("src", "translator.cpp")), "warn", "src/main.cpp", "translator-installed", "no Translator: the app will not follow Setup > Language");
  }
  // sources: banned things
  const srcFiles = exists(f("src")) ? fs.readdirSync(f("src"), { recursive: true }).filter((p) => /\.(cpp|h|qml)$/.test(p)) : [];
  const dialog = srcFiles.find((p) => /QFileDialog|QtQuick\.Dialogs/.test(read(f("src", p)) ?? "") && /FileDialog|FolderDialog/.test(read(f("src", p)) ?? ""));
  rule(!dialog, "miss", dialog ? `src/${dialog}` : "", "portal-dialogs", "open and save go through xdg-desktop-portal over D-Bus (org.freedesktop.portal.FileChooser), not QFileDialog or QML FileDialog");
  const qapp = srcFiles.find((p) => /#include <QApplication>/.test(read(f("src", p)) ?? ""));
  rule(!qapp, "miss", qapp ? `src/${qapp}` : "", "no-qapplication", "includes QApplication; use QGuiApplication");

  // Theme
  const theme = read(f("src", "theme.cpp"));
  if (theme != null) {
    rule(/\.local\/state\/omarchy\/current|state\/omarchy\/current/.test(theme) && /colors\.toml/.test(theme) && /accent/.test(theme), "miss", "src/theme.cpp", "theme-reads-accent", "read accent from ~/.local/state/omarchy/current/theme/colors.toml");
    rule(/#FFD60A/i.test(theme), "miss", "src/theme.cpp", "theme-fallback", "fall back to #FFD60A when Omarchy is not there");
    rule(/QFileSystemWatcher/.test(theme), "miss", "src/theme.cpp", "theme-watches", "watch the theme files and re-arm after every change (a switch replaces files and symlinks)");
    rule(/decoration:rounding/.test(theme) && /radius/.test(read(f("src", "theme.h")) ?? ""), "warn", "src/theme.cpp", "theme-radius", "corners should follow Hyprland's decoration:rounding through theme.radius");
  }
  // QML
  const qml = srcFiles.filter((p) => p.endsWith(".qml"));
  const mainQml = read(f("src", "Main.qml"));
  if (mainQml != null) {
    rule(/ApplicationWindow\s*{/.test(mainQml), "miss", "src/Main.qml", "application-window", "Main.qml should be an ApplicationWindow");
    rule(/Material\.theme\s*:\s*Material\.Dark/.test(mainQml), "warn", "src/Main.qml", "material-dark", "Material.theme: Material.Dark");
    rule(/Material\.accent\s*:\s*theme\.accent/.test(mainQml), "miss", "src/Main.qml", "accent-follows-theme", "Material.accent: theme.accent so the window follows the Omarchy accent");
    rule(/roundedScale\s*:\s*theme\.radius/.test(mainQml), "warn", "src/Main.qml", "rounded-scale", "Material.roundedScale: theme.radius");
    rule(/Shortcut\s*{[^}]*Qt\.ApplicationShortcut/s.test(mainQml), "miss", "src/Main.qml", "shortcuts", "key bindings are Shortcut items with context: Qt.ApplicationShortcut");
    rule(/sequence\s*:\s*"\?"/.test(mainQml), "warn", "src/Main.qml", "shortcut-help", "? should show every shortcut");
    rule(/sequence\s*:\s*"Q"/.test(mainQml) || /Qt\.quit|StandardKey\.Quit/.test(mainQml), "warn", "src/Main.qml", "shortcut-quit", "Q should quit");
    rule(/LayoutMirroring\.enabled/.test(mainQml), "warn", "src/Main.qml", "rtl-mirroring", "keep content under a mirrored root so Arabic, Hebrew, Persian and Urdu read right to left");
  }
  const bare = [];
  for (const p of qml) {
    const t = read(f("src", p)) ?? "";
    const base = path.basename(p, ".qml");
    if (QT_TYPES.has(base)) add("miss", `src/${p}`, "qml-type-name", `${base}.qml is named after a Qt Quick type and fails to load ("abstract base class"); prefix it with what it shows`);
    if (/\bMaterial\.\w+/.test(t) && !/import QtQuick\.Controls\.Material/.test(t)) add("miss", `src/${p}`, "material-import", "uses Material.* but does not import QtQuick.Controls.Material");
    if (/\bsequence\s*:\s*StandardKey/.test(t)) add("warn", `src/${p}`, "standardkey-sequences", "standard keys go in sequences: [StandardKey.X], not sequence:");
    for (const m of t.matchAll(/^\s*(text|title|placeholderText|ToolTip\.text)\s*:\s*"([^"]*[A-Za-z]{3,}[^"]*)"/gm)) if (!/^[%\d\s.,:;()+\-\/\\|#?]*$/.test(m[2]) && m[2].toLowerCase() !== name.toLowerCase()) bare.push(`${p}: ${m[1]}: "${m[2].slice(0, 30)}"`);
  }
  if (bare.length) add("warn", "src/*.qml", "qsTr-strings", `${bare.length} visible string(s) not wrapped in qsTr(), e.g. ${bare.slice(0, 3).join("; ")}`);
  else if (qml.length) add("ok", "", "qsTr-strings");
  const qrc = read(f("src", "resources.qrc"));
  if (qrc != null) {
    for (const p of qml) rule(new RegExp(`>\\s*${path.basename(p).replace(".", "\\.")}\\s*<|alias="${path.basename(p).replace(".", "\\.")}"`).test(qrc) || p.includes("/") && qrc.includes(p), "miss", "src/resources.qrc", `qrc-${path.basename(p)}`, `${p} is not listed in resources.qrc, so it is not in the binary`);
    rule(exists(f("src", "i18n", "en.json")) || !exists(f("src", "translator.cpp")), "warn", "src/i18n/en.json", "i18n-en", "translator.cpp is present but src/i18n/en.json (plural forms) is not");
  }

  // Package
  const pkg = read(f("pkgbuild", "PKGBUILD"));
  if (pkg == null) add("miss", "pkgbuild/PKGBUILD", "pkgbuild", "pkgbuild/PKGBUILD is missing");
  else {
    rule(new RegExp(`^pkgname=${name}\\s*$`, "m").test(pkg), "miss", "pkgbuild/PKGBUILD", "pkgname", `pkgname should be ${name}`);
    rule(/^depends=\([^)]*qt6-base[^)]*qt6-declarative/m.test(pkg), "miss", "pkgbuild/PKGBUILD", "depends", "depends should name qt6-base and qt6-declarative (and qt6-wayland, xdg-desktop-portal, plus what the app uses)");
    rule(new RegExp(`usr/bin/${name}`).test(pkg), "miss", "pkgbuild/PKGBUILD", "installs-binary", `package() should install build/${name} to /usr/bin/${name}`);
    rule(/usr\/share\/applications\/\S+\.desktop/.test(pkg), "miss", "pkgbuild/PKGBUILD", "installs-desktop", "package() should install the .desktop file to /usr/share/applications");
    rule(/usr\/share\/icons\/hicolor\/scalable\/apps/.test(pkg), "miss", "pkgbuild/PKGBUILD", "installs-icon", "package() should install the SVG icon to /usr/share/icons/hicolor/scalable/apps");
    rule(/usr\/share\/licenses/.test(pkg), "warn", "pkgbuild/PKGBUILD", "installs-license", "package() should install LICENSE to /usr/share/licenses/$pkgname");
    rule(/^license=/m.test(pkg) && /^arch=/m.test(pkg) && /^pkgdesc=/m.test(pkg), "warn", "pkgbuild/PKGBUILD", "pkgbuild-fields", "set pkgdesc, arch and license");
  }
  const desk = read(f("pkgbuild", `${name}.desktop`));
  if (desk == null) add("miss", `pkgbuild/${name}.desktop`, "desktop-file", `pkgbuild/${name}.desktop is missing, so the app has no launcher entry`);
  else {
    const kv = (k) => desk.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
    rule(/^\[Desktop Entry\]/m.test(desk) && kv("Type") === "Application", "miss", `pkgbuild/${name}.desktop`, "desktop-type", "needs [Desktop Entry] and Type=Application");
    rule(!!kv("Name") && !!kv("Comment"), "miss", `pkgbuild/${name}.desktop`, "desktop-name", "needs Name= and Comment=");
    rule((kv("Exec") ?? "").split(/\s+/)[0] === name, "miss", `pkgbuild/${name}.desktop`, "desktop-exec", `Exec should start with ${name}`);
    rule(kv("Icon") === name, "miss", `pkgbuild/${name}.desktop`, "desktop-icon", `Icon should be ${name}`);
    rule(kv("StartupWMClass") === name, "miss", `pkgbuild/${name}.desktop`, "desktop-wmclass", `StartupWMClass should be ${name} so the compositor matches the window`);
    rule(kv("Terminal") === "false", "warn", `pkgbuild/${name}.desktop`, "desktop-terminal", "Terminal=false");
    rule(!!kv("Categories"), "warn", `pkgbuild/${name}.desktop`, "desktop-categories", "Categories= is empty");
    rule(/^Name\[\w+\]=/m.test(desk), "warn", `pkgbuild/${name}.desktop`, "desktop-translated", "no Name[xx]= lines: the launcher shows the English name in every language");
  }
  const svg = read(f("pkgbuild", `${name}.svg`));
  if (svg == null) add("miss", `pkgbuild/${name}.svg`, "icon", `pkgbuild/${name}.svg is missing`);
  else rule(/<svg[^>]*viewBox/.test(svg), "miss", `pkgbuild/${name}.svg`, "icon-valid", "the icon should be a square <svg> with a viewBox");

  // Repository
  const readme = read(f("README.md"));
  if (readme == null) add("miss", "README.md", "readme", "README.md is missing");
  else rule(/\|\s*-+\s*\|/.test(readme) && /shortcut|key/i.test(readme), "warn", "README.md", "readme-shortcuts", "the README should list the shortcuts in a table");
  rule(exists(f("LICENSE")), "miss", "LICENSE", "license", "LICENSE is missing (package() installs it)");

  const total = ok.length + miss.length + warn.length;
  return { path: root, name, passed: ok.length, total, miss, warn };
}
