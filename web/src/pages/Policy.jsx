import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Policy({ kind }) {
  const isPrivacy = kind === 'privacy';
  useEffect(() => { document.title = `${isPrivacy ? 'Privacy Policy' : 'Terms of Service'} — Adare General Hospital`; }, [isPrivacy]);
  return (
    <div className="wrap" style={{ padding: '34px 20px 60px', maxWidth: 780 }}>
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> / {isPrivacy ? 'Privacy' : 'Terms'}</nav>
      <h1 style={{ color: 'var(--navy)', margin: '16px 0 20px' }}>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
      <div className="prose">
        {isPrivacy ? (
          <>
            <p>Adare General Hospital collects only the information needed to provide healthcare services: your name, contact details, appointment information and payment references.</p>
            <h2>How your information is used</h2>
            <ul>
              <li>To process appointment requests and confirmations</li>
              <li>To verify payments and issue references</li>
              <li>To contact you about your care (SMS/phone)</li>
              <li>To maintain legally required hospital records</li>
            </ul>
            <h2>Protection</h2>
            <p>Data is stored on secured hospital systems with role-based access control and audit logging. Staff access is limited to what their role requires. We do not sell or share personal data with third parties except as required by law or for your direct care.</p>
            <h2>Your rights</h2>
            <p>You may request to view or correct your registration information at the hospital registration desk or through the patient portal.</p>
          </>
        ) : (
          <>
            <p>By using the Adare General Hospital website and patient portal you agree to the following terms.</p>
            <h2>Appointments</h2>
            <p>Online appointment requests are confirmed by hospital staff. A submitted request is not a confirmed booking until you receive confirmation. Emergency cases should come directly to the Emergency Unit.</p>
            <h2>Payments</h2>
            <p>Online payment submissions are verified by the finance team before being marked successful. Keep your payment reference for any follow-up.</p>
            <h2>Accounts</h2>
            <p>You are responsible for keeping your portal password confidential. Notify the hospital of any suspected unauthorized access.</p>
            <h2>Medical information</h2>
            <p>Website content, including health education, is general information and does not replace professional medical advice, diagnosis or treatment.</p>
          </>
        )}
      </div>
    </div>
  );
}
