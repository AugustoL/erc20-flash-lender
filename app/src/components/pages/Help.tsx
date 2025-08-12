import React from 'react';
import { Link } from 'react-router-dom';

export default function Help() {
  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head">
          <h3>Help & Support</h3>
        </div>
        <div className="padding-standard">
          <div className="center-content">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              ❓
            </div>
            <h4>Help content coming soon</h4>
            <p style={{ color: 'var(--text-sec)', marginBottom: '2rem' }}>
              This section will contain guides, FAQs, and support information.
            </p>
            <Link to="/" className="btn primary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
