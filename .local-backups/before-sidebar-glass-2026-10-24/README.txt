Sidebar glass — 2026-10-24

Only src/app/app-theme.css changed for this correction.
Header, rail glass, expanded labels and account card share blur(18px) saturate(1.6), and rgba(255,249,237,0.62).
The icon rail's glass moves to its ::before surface. The rail container itself has no backdrop filter, so its expanded descendants can blur page pixels outside the narrow rail instead of sampling a nested backdrop root.
The current expanding icon-card navigation, scroll illustration and theme adjustments were preserved.

Checks: lint and TypeScript passed; 440 tests passed, 8 DB-dependent tests skipped; production build passed.
Browser QA used a separate mock-auth preview, with synthetic master/plan rows and an explicit mock-data label. No real database or authentication submissions.
Computed backdrop filters and background opacity matched on Header, rail surface, expanded label and account card. Tested desktop 1280×720, tablet 820×1180 and mobile 390×844; no horizontal overflow. Mobile still has five tabs.

Undo (from project root):
python3 .local-backups/before-sidebar-glass-2026-10-24/restore.py
python3 .local-backups/before-sidebar-glass-2026-10-24/restore.py --apply

Undo was rehearsed in a temporary folder. The guard refuses to overwrite later edits.
