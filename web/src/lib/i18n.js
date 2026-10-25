// i18n: translations separated from logic (spec §15). RTL for Arabic.
export const LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'am', label: 'አማርኛ', flag: '🇪🇹' },
  { code: 'om', label: 'Afaan Oromoo', flag: '🇪🇹' },
  { code: 'sid', label: 'Sidaamu Afoo', flag: '🇪🇹' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

const dict = {
  en: {
    home: 'Home', about: 'About', services: 'Services', departments: 'Departments', doctors: 'Doctors',
    news: 'News', contact: 'Contact', appointments: 'Appointments', portal: 'Patient Portal',
    emergency: 'Emergency', bookAppointment: 'Book Appointment', findDoctor: 'Find a Doctor',
    findService: 'Find a Service', healthEducation: 'Health Education', gallery: 'Gallery',
    leadership: 'Leadership', tagline: 'Compassionate Care. Professional Excellence. Better Health.',
    heroSub: 'A public general hospital serving Hawassa and the Sidama Region since 1954 E.C. — now with online appointments, a patient portal and 24/7 emergency care.',
    emergencyOpen: 'Emergency & trauma services operate 24 hours, every day',
    callEmergency: 'Call Emergency', checkStatus: 'Check Status', signIn: 'Sign in', signOut: 'Sign out',
    search: 'Search services, doctors, news…', pharmacy: 'Pharmacy', laboratory: 'Laboratory',
  },
  am: {
    home: 'መነሻ', about: 'ስለ ሆስፒታሉ', services: 'አገልግሎቶች', departments: 'ክፍሎች', doctors: 'ሐኪሞች',
    news: 'ዜና', contact: 'ያግኙን', appointments: 'ቀጠሮዎች', portal: 'የታካሚ ፖርታል',
    emergency: 'ድንገተኛ', bookAppointment: 'ቀጠሮ ያስይዙ', findDoctor: 'ሐኪም ይፈልጉ',
    findService: 'አገልግሎት ይፈልጉ', healthEducation: 'የጤና ትምህርት', gallery: 'ፎቶዎች',
    leadership: 'አመራር', tagline: 'ርኅራኄ ያለው እንክብካቤ። ሙያዊ ብቃት። የተሻለ ጤና።',
    heroSub: 'ከ1954 ዓ.ም. ጀምሮ ሀዋሳንና የሲዳማ ክልልን የሚያገለግል የመንግሥት አጠቃላይ ሆስፒታል — አሁን በመስመር ላይ ቀጠሮ፣ የታካሚ ፖርታል እና የ24/7 ድንገተኛ አገልግሎት።',
    emergencyOpen: 'የድንገተኛ እና ትራውማ አገልግሎት በቀን 24 ሰዓት ክፍት ነው',
    callEmergency: 'ድንገተኛ ይደውሉ', checkStatus: 'ሁኔታ ይመልከቱ', signIn: 'ግባ', signOut: 'ውጣ',
    search: 'አገልግሎቶች፣ ሐኪሞች፣ ዜና ይፈልጉ…', pharmacy: 'ፋርማሲ', laboratory: 'ላቦራቶሪ',
  },
  om: {
    home: 'Mana', about: 'Waa’ee keenya', services: 'Tajaajiloota', departments: 'Kutaalee', doctors: 'Ogeessota',
    news: 'Oduu', contact: 'Nu qunnamaa', appointments: 'Beellama', portal: 'Pootaalii dhukkubsataa',
    emergency: 'Balaa tasaa', bookAppointment: 'Beellama qabadhu', findDoctor: 'Ogeessa barbaadi',
    findService: 'Tajaajila barbaadi', healthEducation: 'Barnoota fayyaa', gallery: 'Suuraalee',
    leadership: 'Hooggansa', tagline: 'Kunuunsa gara-laafessa. Ogummaa cimaa. Fayyaa fooyya’aa.',
    heroSub: 'Hospitaala waliigalaa mootummaa bara 1954 A.L.I. irraa kaasee Hawaasaa fi Naannoo Sidaamaa tajaajilu.',
    emergencyOpen: 'Tajaajilli balaa tasaa sa’aatii 24 guyyaa hunda banaa dha',
    callEmergency: 'Bilbilaa balaa tasaa', checkStatus: 'Haala ilaali', signIn: 'Seeni', signOut: 'Ba’i',
    search: 'Tajaajila, ogeessa, oduu barbaadi…', pharmacy: 'Faarmasii', laboratory: 'Laaboraatorii',
  },
  sid: {
    home: 'Mine', about: 'Kiiro', services: 'Oosho', departments: 'Kifile', doctors: 'Ogeessa',
    news: 'Oduu', contact: 'Nu qunnami', appointments: 'Beellama', portal: 'Hordofto pootaale',
    emergency: 'Hasaawa', bookAppointment: 'Beellama afiri', findDoctor: 'Ogeessa hasi',
    findService: 'Oosho hasi', healthEducation: 'Fayyimma rosicho', gallery: 'Misile',
    leadership: 'Hooggansa', tagline: 'Shaqqado towanno. Ogimma dancha. Fayyimma woyyaabbino.',
    heroSub: 'Hosopitaale 1954 E.C. kawa Hawaasanna Sidaamu qoqqowo towatanno.',
    emergencyOpen: 'Hasaawu oosho barru 24 saate fa’natino',
    callEmergency: 'Hasaawa bilbili', checkStatus: 'Garincho la\'i', signIn: 'E\'i', signOut: 'Fuli',
    search: 'Oosho, ogeessa, oduu hasi…', pharmacy: 'Faarmase', laboratory: 'Laboraatore',
  },
  ar: {
    home: 'الرئيسية', about: 'عن المستشفى', services: 'الخدمات', departments: 'الأقسام', doctors: 'الأطباء',
    news: 'الأخبار', contact: 'اتصل بنا', appointments: 'المواعيد', portal: 'بوابة المريض',
    emergency: 'الطوارئ', bookAppointment: 'احجز موعداً', findDoctor: 'ابحث عن طبيب',
    findService: 'ابحث عن خدمة', healthEducation: 'التثقيف الصحي', gallery: 'معرض الصور',
    leadership: 'القيادة', tagline: 'رعاية رحيمة. تميز مهني. صحة أفضل.',
    heroSub: 'مستشفى عام حكومي يخدم هواسا ومنطقة سيداما منذ عام 1954 بالتقويم الإثيوبي.',
    emergencyOpen: 'خدمات الطوارئ تعمل على مدار الساعة كل يوم',
    callEmergency: 'اتصل بالطوارئ', checkStatus: 'تحقق من الحالة', signIn: 'تسجيل الدخول', signOut: 'خروج',
    search: 'ابحث عن الخدمات والأطباء والأخبار…', pharmacy: 'الصيدلية', laboratory: 'المختبر',
  },
  fr: {
    home: 'Accueil', about: 'À propos', services: 'Services', departments: 'Départements', doctors: 'Médecins',
    news: 'Actualités', contact: 'Contact', appointments: 'Rendez-vous', portal: 'Portail patient',
    emergency: 'Urgences', bookAppointment: 'Prendre rendez-vous', findDoctor: 'Trouver un médecin',
    findService: 'Trouver un service', healthEducation: 'Éducation à la santé', gallery: 'Galerie',
    leadership: 'Direction', tagline: 'Soins bienveillants. Excellence professionnelle. Meilleure santé.',
    heroSub: 'Hôpital général public au service de Hawassa et de la région Sidama depuis 1954 (calendrier éthiopien).',
    emergencyOpen: 'Les urgences sont ouvertes 24h/24, tous les jours',
    callEmergency: 'Appeler les urgences', checkStatus: 'Vérifier le statut', signIn: 'Connexion', signOut: 'Déconnexion',
    search: 'Rechercher services, médecins, actualités…', pharmacy: 'Pharmacie', laboratory: 'Laboratoire',
  },
};

let lang = localStorage.getItem('agh_lang') || 'en';

export function t(key) { return dict[lang]?.[key] ?? dict.en[key] ?? key; }
export function getLang() { return lang; }
export function setLang(code) {
  if (!dict[code]) return;
  lang = code;
  localStorage.setItem('agh_lang', code);
  document.documentElement.lang = code;
  document.documentElement.dir = LANGS.find(l => l.code === code)?.rtl ? 'rtl' : 'ltr';
  window.dispatchEvent(new CustomEvent('langchange'));
}
document.documentElement.lang = lang;
document.documentElement.dir = LANGS.find(l => l.code === lang)?.rtl ? 'rtl' : 'ltr';
