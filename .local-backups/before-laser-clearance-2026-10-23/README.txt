Laser orbit clearance — 2026-10-23

Only ScanRing.tsx, scanOrbit.ts and scanOrbit.test.ts changed.
Credential focus eases into a wider ellipse: local X/Z radii 2.42 / 1.364.
Laser surfaces render after body depth is written, with depth testing enabled; rear arcs remain behind the solid model.
Idle scan and the success seal retain their original proportions. Camera, Login and database logic remain unchanged.
A geometry test verifies that every compressor vertex lies inside the focused orbit with a 0.06-unit margin.

Undo (from project root):
python3 .local-backups/before-laser-clearance-2026-10-23/restore.py
python3 .local-backups/before-laser-clearance-2026-10-23/restore.py --apply

The guard refuses to overwrite later edits. Undo was rehearsed in a temporary folder.
