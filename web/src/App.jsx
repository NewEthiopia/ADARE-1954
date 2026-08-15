import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { tryRefresh, auth } from './lib/api.js';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';

const ServicesPage = lazy(() => import('./pages/Services.jsx'));
const DoctorsPage = lazy(() => import('./pages/Doctors.jsx'));
const DepartmentsPage = lazy(() => import('./pages/Departments.jsx'));
const AboutPage = lazy(() => import('./pages/About.jsx'));
const NewsPage = lazy(() => import('./pages/News.jsx'));
const NewsArticlePage = lazy(() => import('./pages/NewsArticle.jsx'));
const AppointmentPage = lazy(() => import('./pages/Appointment.jsx'));
const ContactPage = lazy(() => import('./pages/Contact.jsx'));
const EmergencyPage = lazy(() => import('./pages/Emergency.jsx'));
const HealthEdPage = lazy(() => import('./pages/HealthEducation.jsx'));
const PortalPage = lazy(() => import('./pages/Portal.jsx'));
const StaffPage = lazy(() => import('./pages/Staff.jsx'));
const PolicyPage = lazy(() => import('./pages/Policy.jsx'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  const [booted, setBooted] = useState(false);
  useEffect(() => { tryRefresh().finally(() => setBooted(true)); }, []);
  if (!booted) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }} className="muted">Loading…</div>;
  return (
    <>
      <ScrollTop />
      <Suspense fallback={<div className="wrap" style={{ padding: 60 }}><div className="skeleton" style={{ height: 220 }} /></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/doctors" element={<DoctorsPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/news/:slug" element={<NewsArticlePage />} />
            <Route path="/appointments" element={<AppointmentPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/emergency" element={<EmergencyPage />} />
            <Route path="/health-education" element={<HealthEdPage />} />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/privacy" element={<PolicyPage kind="privacy" />} />
            <Route path="/terms" element={<PolicyPage kind="terms" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="/staff/*" element={<StaffPage />} />
        </Routes>
      </Suspense>
    </>
  );
}

function NotFound() {
  return (
    <div className="wrap" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 60, color: 'var(--navy)' }}>404</h1>
      <p className="muted">The page you are looking for does not exist.</p>
      <p style={{ marginTop: 16 }}><a className="btn btn-primary" href="/">Back to home</a></p>
    </div>
  );
}
