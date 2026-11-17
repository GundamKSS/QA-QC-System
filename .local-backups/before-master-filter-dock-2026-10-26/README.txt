QCheck — Master filter docking, 26 October 2026 (Asia/Bangkok)

The search/status row moves from the expanding green card into the persistent Header,
then returns when the card comes back into view. React ViewTransition shares the form
between these locations. Draft values remain in one component; the inactive card form
is an inert, hidden layout placeholder. Focus and caret are restored without scrolling;
IME composition defers docking until composition ends. Focused controls and reduced-motion
preferences skip the snapshot animation. No API or database logic was changed.

Desktop: one Header row. Phone: a compact second row with one continuous glass plane,
44px controls, and no change to the Header's document-flow height.
Boundary hysteresis prevents flickering when scrolling near the docking point.

Check undo safety:
  python3 .local-backups/before-master-filter-dock-2026-10-26/restore.py
Restore the previous green-card filters:
  python3 .local-backups/before-master-filter-dock-2026-10-26/restore.py --apply

The helper refuses all changes when an affected file has later edits.
Undo was rehearsed in a temporary directory, never against the live workspace.
See changes.patch, validation.json, and screenshots using isolated mock data.
