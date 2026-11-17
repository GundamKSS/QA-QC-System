-- QCheck — 024: Publish standard checklist templates (QA & QC)
-- Sets status = 'PUBLISHED' for versions 1..6 and links current_version_id
-- Ensures newly created inspection plans automatically inherit the valid QA/QC checklist version.

SET XACT_ABORT ON;

-- 1. Publish standard template versions 1..6
UPDATE dbo.template_versions
   SET status = 'PUBLISHED',
       published_at = COALESCE(published_at, SYSUTCDATETIME()),
       updated_at = SYSUTCDATETIME()
 WHERE id IN (1, 2, 3, 4, 5, 6)
   AND status = 'DRAFT';

-- 2. Set current_version_id on standard templates 1..6
UPDATE dbo.checklist_templates
   SET current_version_id = id,
       updated_at = SYSUTCDATETIME()
 WHERE id IN (1, 2, 3, 4, 5, 6)
   AND current_version_id IS NULL;

-- 3. Backfill any existing plans that had qa_template_version_id set to NULL
UPDATE p
   SET p.qa_template_version_id = qat.current_version_id,
       p.updated_at = SYSUTCDATETIME()
  FROM dbo.plans p
  JOIN dbo.models m ON m.id = p.model_id
  JOIN dbo.checklist_templates qat ON qat.id = m.qa_template_id
 WHERE p.qa_template_version_id IS NULL
   AND qat.current_version_id IS NOT NULL;
