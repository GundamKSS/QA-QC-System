Continuous glass sidebar — 2026-10-24

One frosted surface and one continuous perimeter now form the rail and its hovered extension. The right edge grows into a rounded shoulder beside the active icon; labels have no independent background, border or shadow. The original icon enlarges, without a duplicated popup icon.
A damped animation follows new menu positions from its current shape. Text fades in after the surface starts opening. Header and Sidebar still share blur(18px) saturate(1.6) and the same 62% glass tint.
The extended menu remains clickable. Keyboard focus opens the same surface; Escape closes it. The account panel uses the same continuous surface, with inert hidden controls and focus returned to the avatar on Escape.
Narrow screens retain five bottom tabs. Short landscape viewports compact the rail and omit unavailable module shortcuts to keep enabled navigation and account controls on screen, with 44px targets.
No page routes, roles, authentication or database logic changed. Animation writes SVG paths and one CSS variable through refs, without per-frame React renders; listeners, observer, timers and RAF are cleaned up.

QA: lint and TypeScript passed. 456 tests passed; 8 DB-dependent tests skipped. Production build checked separately in validation.json.
Browser: mocked account in an isolated preview without DB credentials; Home and Plans focus, account open/close/reopen, Escape from account actions, click outside; 1280×720, 820×1180, 844×390, 390×844; no horizontal overflow. One glass layer, labels transparent, blur matches Header.

Undo (from project root):
python3 .local-backups/before-unified-sidebar-2026-10-24/restore.py
python3 .local-backups/before-unified-sidebar-2026-10-24/restore.py --apply

Undo rehearsed in a temporary folder. The guard refuses to overwrite later source changes.
