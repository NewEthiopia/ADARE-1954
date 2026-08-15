-- ============================================================
-- Migration 004 — Free winter (kiremt) volunteer health
-- screening campaign announcement (hospital-provided banner).
-- Published + featured so it leads the public News section.
-- ============================================================
BEGIN;

INSERT INTO news (slug, title, excerpt, body_html, category_id, tags, image_path, is_featured, status, publish_at)
VALUES (
  'free-kiremt-health-screening-campaign',
  'ነፃ የጤና ምርመራ! Free Kiremt Volunteer Health Screening Campaign',
  'Adare General Hospital invites the community to free health screening services under the kiremt goodwill program — blood pressure, diabetes, cervical and breast cancer screening, eye and ear examinations, HIV and hepatitis testing, blood donation and more.',
  '<p lang="am"><strong>በአዳሬ አጠቃላይ ሆስፒታል የክረምት በጎ ፈቃድ መርሃ ግብር የሚሰጡ አገልግሎቶች፦</strong></p>'
  || '<ul lang="am">'
  || '<li>የደም ግፊት ምርመራ</li>'
  || '<li>የስኳር ህመም ምርመራ</li>'
  || '<li>የማህፀን ጫፍ ካንሰር ምርመራ</li>'
  || '<li>የዓይን ምርመራ</li>'
  || '<li>የጡት ካንሰር ምርመራ</li>'
  || '<li>የቆዳ ህክምና</li>'
  || '<li>የ HIV ምርመራ</li>'
  || '<li>የሳምባ ህመም ምርመራ</li>'
  || '<li>የጤና ትምህርት</li>'
  || '<li>የጆሮ ህመም ምርመራ</li>'
  || '<li>የቀዶ ህክምና አገልግሎት</li>'
  || '<li>የምግብ አጥረት ልየታ</li>'
  || '<li>የደም ልገሳ</li>'
  || '<li>የጉበት ቫይረስ ምርመራና ህክምና</li>'
  || '<li>የስነ-አዕምሮ ምርመራና ህክምና ሌሎችም</li>'
  || '</ul>'
  || '<p><strong>Free services under the kiremt goodwill program at Adare General Hospital:</strong></p>'
  || '<ul>'
  || '<li>Blood pressure screening</li>'
  || '<li>Diabetes screening</li>'
  || '<li>Cervical cancer screening</li>'
  || '<li>Eye examination</li>'
  || '<li>Breast cancer screening</li>'
  || '<li>Skin (dermatology) care</li>'
  || '<li>HIV testing</li>'
  || '<li>Lung (TB) screening</li>'
  || '<li>Health education</li>'
  || '<li>Ear examination</li>'
  || '<li>Surgical services</li>'
  || '<li>Malnutrition screening</li>'
  || '<li>Blood donation</li>'
  || '<li>Hepatitis (liver virus) screening &amp; treatment</li>'
  || '<li>Mental health screening &amp; treatment — and more</li>'
  || '</ul>'
  || '<p lang="am"><strong>ነፃ የጤና ምርመራ!</strong> — ሁሉም አገልግሎቶች በነፃ ይሰጣሉ።</p>'
  || '<p>All services are provided <strong>free of charge</strong>. Visit Adare General Hospital, Hawassa — phone 046 221 1661.</p>',
  (SELECT id FROM news_categories WHERE slug = 'notices'),
  'campaign,free screening,kiremt,community',
  '/uploads/news/free-screening-campaign.jpg',
  true,
  'PUBLISHED',
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  image_path = EXCLUDED.image_path,
  body_html  = EXCLUDED.body_html,
  is_featured = true,
  status = 'PUBLISHED';

COMMIT;
