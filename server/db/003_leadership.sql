-- ============================================================
-- Migration 003 — leadership CMS fields + real photo paths
-- ============================================================
BEGIN;

ALTER TABLE leaders ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Attach the real hospital-provided photographs (processed: name banners
-- cropped out, optimized JPEG + WebP variants; faces untouched).
UPDATE leaders SET photo_path = '/uploads/leaders/fikru-tesfaye.jpg'   WHERE full_name = 'Fikru Tesfaye';
UPDATE leaders SET photo_path = '/uploads/leaders/muntash-birhanu.jpg' WHERE full_name = 'Muntash Birhanu';
UPDATE leaders SET photo_path = '/uploads/leaders/firew-hanke.jpg'     WHERE full_name = 'Firew Hanke';
UPDATE leaders SET photo_path = '/uploads/leaders/maradona-zeleke.jpg' WHERE full_name = 'Maradona Zeleke';
UPDATE leaders SET photo_path = '/uploads/leaders/zenebe-turiche.jpg'  WHERE full_name = 'Zenebe Turiche';
UPDATE leaders SET photo_path = '/uploads/leaders/yirdachew-anato.jpg' WHERE full_name = 'Yirdachew Anato';

-- Normalize the era/description text used by the carousel
UPDATE leaders SET period = 'Adare Primary Hospital era' WHERE order_label IN ('1st','2nd','3rd');
UPDATE leaders SET period = 'Hospital expansion era'     WHERE order_label IN ('4th','5th');
UPDATE leaders SET period = 'Adare General Hospital'     WHERE order_label = '6th';

COMMIT;
