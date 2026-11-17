QCheck — shared corner radii, 25 October 2026 (Asia/Bangkok)

Scope: 32 presentation files only. No business logic, database, credentials, colour palette,
layout sizing, 3D geometry or animation behaviour changed.

Shape hierarchy:
  inset: 6px (nested small controls)
  control: 10px (buttons, inputs, selects, action/icon tiles)
  panel: 16px (cards, forms, table frames, grouped controls)
  surface: 22px (large Login panels, dashboard welcome, rail body)
Circles, capsules, skeleton bars, the rail's continuous SVG curves and the Home scroll morph retain their intentional shapes.

Backup: originals.tar.gz plus original-manifest.json.
Review: changes.patch; validation.json; screenshots use an isolated mock preview.

Check whether undo is safe, without changing files:
  python3 .local-backups/before-radius-system-2026-10-25/restore.py

Restore previous corner radii:
  python3 .local-backups/before-radius-system-2026-10-25/restore.py --apply

The restore helper refuses the entire operation if any affected file has later edits.
It was rehearsed in a temporary directory; no rollback was applied to the live workspace.
