UPDATE news
SET status = 'DRAFT',
    is_featured = false,
    updated_at = now()
WHERE slug = 'free-kiremt-health-screening-campaign'
  AND (status <> 'DRAFT' OR is_featured);
