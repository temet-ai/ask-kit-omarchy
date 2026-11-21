The caller is building a desktop app for Omarchy, or wants to know whether one is built the Omarchy way.

1. Read the skill `new-app` for the conventions and the build loop, and `qt-traps` when the app has
   QML that fails to load or behaves oddly.
2. To judge an existing project: `await scripts.run("app-check", { path: "<project folder>" })`.
   Report each `miss` with its file and what the convention is; mention `warn` entries after them.
   A project that does not exist yet has nothing to check: say so.
3. To start one (the ask may act): choose a short lowercase name, then
   `await omarchy.scaffold("<name>", { description: "<one line>", dir: "<folder, if the caller named one>" })`.
   Then run `app-check` on the new folder and confirm it reports no `miss`.
4. Building and testing are the caller's: `bin/build`, `bin/test`, `bin/install` take minutes and
   install a package. Say which to run next; run `bin/build` or `bin/test` yourself only when asked.
5. Answer with the folder, the files made or the misses found, and the next step.
