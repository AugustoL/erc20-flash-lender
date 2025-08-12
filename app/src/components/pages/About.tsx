import React from 'react';
import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head">
          <h3>About</h3>
        </div>
        <div className="padding-standard">
          <div className="center-content">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              ℹ️
            </div>
            <h4>About this application</h4>
            <p style={{ color: 'var(--text-sec)', marginBottom: '2rem' }}>
              Information about the ERC20 Flash Lender application will be displayed here.
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
