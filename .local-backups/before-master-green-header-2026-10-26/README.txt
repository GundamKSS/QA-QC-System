QCheck — green Master heading and filters,26 October2026(Asia/Bangkok)

The Master heading and search/status filters share one forest-green cutting mat.
Its background expands on scroll and contracts when returning to the top,using the same
140px range and0.2 easing as Home. Inputs and text retain stable positions and cream fields.
Existing page/header back-button docking and API/database behaviour are preserved.

Changed:components/master/MasterTableView.tsx,components/master/master-table.css,
components/dom/WorkspaceDrawing.tsx. Added:MasterHero.tsx and expandingSurface.ts.
The Home drawing uses the shared surface binding;its visual behaviour is unchanged.

Check undo safety:
  python3 .local-backups/before-master-green-header-2026-10-26/restore.py
Restore previous presentation:
  python3 .local-backups/before-master-green-header-2026-10-26/restore.py --apply

Undo refuses the entire operation when an affected file has later edits.
It was rehearsed in a temporary directory;the workspace was never rolled back.
See changes.patch,validation.json,and screenshots captured with isolated mock data.
