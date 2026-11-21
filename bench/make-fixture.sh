#!/bin/sh
# Builds the two app projects the bench questions are about, in bench/fixtures (ignored by git):
# clacks, a project made from the kit's own templates, and clacks-broken, the same project with
# fixed defects. Run it once before the bench.
set -e
here=$(cd "$(dirname "$0")" && pwd)
kit=$(cd "$here/.." && pwd)
rm -rf "$here/fixtures"
mkdir -p "$here/fixtures"
KIT="$kit" OUT="$here/fixtures" node --input-type=module <<'JS'
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
const { make } = await import(pathToFileURL(process.env.KIT + "/omarchy.mjs").href);
const out = process.env.OUT;
const o = make({ settings: {}, kitDir: process.env.KIT, cwd: out, act: true });
await o.scaffold("clacks", { dir: out + "/clacks", description: "Send a message down the line of clacks towers", author: "Moist von Lipwig" });
fs.cpSync(out + "/clacks", out + "/clacks-broken", { recursive: true });
const b = out + "/clacks-broken";
const sub = (f, from, to) => fs.writeFileSync(path.join(b, f), fs.readFileSync(path.join(b, f), "utf8").replace(from, to));
sub("src/main.cpp", "QGuiApplication app(argc, argv);", "QApplication app(argc, argv);");
sub("src/main.cpp", '#include <QGuiApplication>', '#include <QApplication>');
sub("pkgbuild/clacks.desktop", "StartupWMClass=clacks", "StartupWMClass=Clacks");
sub("src/theme.cpp", /#FFD60A/g, "#000000");
fs.chmodSync(path.join(b, "bin/install"), 0o644);
fs.rmSync(path.join(b, "pkgbuild/clacks.svg"));
fs.rmSync(path.join(b, "tests"), { recursive: true });
fs.writeFileSync(path.join(b, "src/ItemView.qml"), 'import QtQuick\nItem {\n  Material.theme: Material.Dark\n}\n');
fs.writeFileSync(path.join(b, "CMakeLists.txt"), "project(clacks)\n");
JS
echo "built $here/fixtures/clacks and $here/fixtures/clacks-broken"
