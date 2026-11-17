Master table presentation polish — 22 October 2026

Scope: Master table page, responsive record presentation and Master forms. Existing warm titanium / Cosmic Orange theme retained. No database changes.

Undo check (no changes):
python3 .local-backups/before-master-table-polish-2026-10-22/restore.py

Undo after review:
python3 .local-backups/before-master-table-polish-2026-10-22/restore.py --apply

Restore refuses to overwrite subsequent edits. Original files, applied SHA256 manifest and patch are included.

Parallel work preserved: generated-code field support was added independently while this layout was being reviewed. Undo targets preserve that addition; the initial snapshots are retained separately.
