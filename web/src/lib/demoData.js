const departments = [
  { id: 1, slug: 'outpatient', name: 'Outpatient Department', name_am: 'ተመላላሽ ታካሚ ክፍል', description: 'Illustrative outpatient services for this non-production preview.', location: 'Main building' },
  { id: 2, slug: 'maternal-child', name: 'Maternal & Child Health', name_am: 'እናቶች እና ሕፃናት ጤና', description: 'Illustrative maternal and child health services for this preview.', location: 'MCH wing' },
  { id: 3, slug: 'laboratory', name: 'Laboratory & Diagnostics', name_am: 'ላቦራቶሪ', description: 'Illustrative laboratory information for this preview.', location: 'Diagnostics wing' },
  { id: 4, slug: 'emergency', name: 'Emergency & Trauma Unit', name_am: 'ድንገተኛ እና ትራውማ', description: 'Emergency information shown for demonstration only.', location: 'Main building, ground floor' },
];

const services = [
  { id: 1, slug: 'general-consultation', name: 'General Consultation (Demo)', description: 'Sample service information. This preview does not accept appointment requests.', available_days: 'Mon–Fri', working_hours: '8:00–17:00', location: 'Outpatient Department', bookable: true, emergency: false, department: 'Outpatient Department', department_slug: 'outpatient' },
  { id: 2, slug: 'maternal-health', name: 'Maternal Health (Demo)', description: 'Sample service information. This preview does not accept appointment requests.', available_days: 'Mon–Fri', working_hours: '8:00–17:00', location: 'MCH wing', bookable: true, emergency: false, department: 'Maternal & Child Health', department_slug: 'maternal-child' },
  { id: 3, slug: 'laboratory', name: 'Laboratory Services (Demo)', description: 'Illustrative diagnostic service information for this preview.', available_days: 'Every day', working_hours: '8:00–17:00', location: 'Diagnostics wing', bookable: false, emergency: false, department: 'Laboratory & Diagnostics', department_slug: 'laboratory' },
  { id: 4, slug: 'emergency-care', name: 'Emergency & Trauma Care', description: 'Emergency information only. In an emergency, contact local emergency services or visit the hospital.', available_days: 'Every day', working_hours: '24 hours', location: 'Main building, ground floor', bookable: false, emergency: true, department: 'Emergency & Trauma Unit', department_slug: 'emergency' },
];

const doctors = [
  { id: 1, slug: 'sample-clinician-one', full_name: 'Dr. Sample Clinician One', title: 'Demo clinician', specialty: 'General care', department: 'Outpatient Department', department_slug: 'outpatient', qualifications: 'Illustrative profile', languages: 'Amharic, English', working_days: 'Mon–Fri', working_hours: '8:00–17:00', accepts_appointments: false, biography: 'Fictional profile shown for demonstration only.' },
  { id: 2, slug: 'sample-clinician-two', full_name: 'Dr. Sample Clinician Two', title: 'Demo clinician', specialty: 'Maternal & child health', department: 'Maternal & Child Health', department_slug: 'maternal-child', qualifications: 'Illustrative profile', languages: 'Amharic, English', working_days: 'Mon–Fri', working_hours: '8:00–17:00', accepts_appointments: false, biography: 'Fictional profile shown for demonstration only.' },
];

const news = [
  {
    id: 1,
    slug: 'digital-services-preview',
    title: 'Digital Services Preview',
    excerpt: 'An illustrative announcement for this non-production website preview.',
    body_html: '<p>This sample announcement is fictional and appears only to demonstrate the website layout.</p>',
    category: 'Demo announcement',
    is_featured: true,
    publish_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    slug: 'website-preview-information',
    title: 'About this website preview',
    excerpt: 'This preview uses fictional directory records and does not accept submissions.',
    body_html: '<p>All directory records in this preview are fictional. Forms, sign-in, payments and appointment requests are disabled.</p>',
    category: 'Demo information',
    is_featured: false,
    publish_at: '2026-01-02T00:00:00.000Z',
    created_at: '2026-01-02T00:00:00.000Z',
  },
];

const healthArticles = [
  { id: 1, slug: 'preview-health-information', title: 'Health information preview', category: 'preventive', body_html: '<p>This sample card demonstrates the health education layout. It is not medical advice.</p>' },
  { id: 2, slug: 'preview-wellbeing-information', title: 'Wellbeing information preview', category: 'mental', body_html: '<p>This fictional sample demonstrates the article layout. For personal medical concerns, contact a qualified health professional.</p>' },
];

const settings = {
  hospital_name: 'Adare General Hospital',
  hospital_tagline: 'Compassionate Care. Professional Excellence. Better Health.',
  address: 'Hawassa, Sidama Regional State, Ethiopia',
  phone_main: '',
  phone_emergency: '',
  email_public: '',
  working_hours: 'Demo preview — no services are being booked',
  stat_years_of_service: '0',
  stat_departments: String(departments.length),
  stat_health_professionals: String(doctors.length),
  stat_opd_attendances: '0',
  stat_emergency_visits: '0',
  stat_ipd_admissions: '0',
  stat_total_staff: '0',
  site_heartbeat: 'false',
};

function filtered(rows, query, fields) {
  const value = (query || '').trim().toLocaleLowerCase();
  return value ? rows.filter(row => fields.some(field => String(row[field] || '').toLocaleLowerCase().includes(value))) : rows;
}

export function getDemoResponse(path) {
  const url = new URL(path, window.location.origin);
  const query = url.searchParams;

  if (url.pathname === '/settings') return { settings: { ...settings } };
  if (url.pathname === '/translations') return { translations: [] };
  if (url.pathname === '/departments') return { departments: departments.filter(row => !query.get('q') || filtered([row], query.get('q'), ['name', 'description']).length) };
  if (url.pathname === '/services') {
    let rows = filtered(services, query.get('q'), ['name', 'description', 'department']);
    if (query.has('department')) rows = rows.filter(row => row.department_slug === query.get('department'));
    if (query.get('emergency') === '1') rows = rows.filter(row => row.emergency);
    return { services: rows };
  }
  if (url.pathname === '/doctors') {
    let rows = filtered(doctors, query.get('q'), ['full_name', 'specialty', 'qualifications']);
    if (query.has('department')) rows = rows.filter(row => row.department_slug === query.get('department'));
    return { doctors: rows };
  }
  if (url.pathname === '/leaders' || url.pathname === '/leadership') return { leaders: [], leadership: [] };
  if (url.pathname === '/news') {
    const rows = filtered(news, query.get('q'), ['title', 'excerpt']);
    const page = Math.max(1, Number(query.get('page') || 1));
    const perPage = Math.max(1, Math.min(24, Number(query.get('per_page') || 9)));
    return { news: rows.slice((page - 1) * perPage, page * perPage), total: rows.length, page, per_page: perPage };
  }
  if (url.pathname.startsWith('/news/')) {
    const article = news.find(item => item.slug === url.pathname.slice('/news/'.length));
    if (article) return { article: { ...article, author: 'Preview content' } };
    throw new Error('This sample article is not available in the preview.');
  }
  if (url.pathname === '/health-articles') {
    const rows = query.has('category') ? healthArticles.filter(row => row.category === query.get('category')) : healthArticles;
    return { articles: rows };
  }
  if (url.pathname === '/search') {
    const items = [...services, ...doctors, ...news].map((row, index) => ({
      id: row.id,
      slug: row.slug,
      name: row.name || row.full_name || row.title,
      kind: row.full_name ? 'doctor' : row.title ? 'news' : 'service',
      index,
    }));
    return { results: filtered(items, query.get('q'), ['name']).map(({ index, ...row }) => row) };
  }
  if (url.pathname === '/procurement') return { tenders: [] };

  throw new Error('This feature is not included in the read-only preview.');
}
