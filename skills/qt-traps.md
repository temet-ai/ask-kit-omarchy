Qt Quick problems that cost time in an Omarchy app: files that will not load, drags that stop, layouts that jump
- A component file named after a Qt Quick type (`ItemView.qml`) fails with "abstract base class". Prefix the name with what it shows (`PlacedItem.qml`). `app-check` flags this as `qml-type-name`.
- A `MouseArea` inside a `ListView` or `Flickable` loses its drag after a few pixels unless it sets `preventStealing: true`.
- `ListView` pins delegates to `x: 0`. To centre content, make the delegate a full-width `Item` and centre the content inside it.
- Every file that sets a `Material.*` attached property must `import QtQuick.Controls.Material`, or the file fails to load (`material-import`).
- A Material `TextField` floats its `placeholderText` as the label. Do not add a separate label above it: the two overlap.
- `font.pixelSize` is an int. Standard keys go in `sequences: [StandardKey.Undo]`, not `sequence:`.
- Text that must look the same on screen and in an exported file is measured and painted by one C++ function, used by a `QQuickPaintedItem` on screen and by the exporter, never laid out twice.
- QML warnings go to the journal unless `QT_FORCE_STDERR_LOGGING=1` is set.
- A binding that formats a number or date re-renders on a language switch only if it reads `translator.language`.
