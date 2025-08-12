import React from 'react';
import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="padding-standard">
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {/* Hero Section */}
            <div className="center-content" style={{ marginBottom: '3rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <img 
                  src="/logo.png" 
                  alt="FlashLender Logo" 
                  style={{ 
                    width: '80px', 
                    height: '80px',
                    objectFit: 'contain'
                  }} 
                />
              </div>
              <h2 style={{ 
                fontSize: '2rem', 
                fontWeight: '700', 
                marginBottom: '1rem',
                background: 'linear-gradient(135deg, var(--text-primary), var(--accent))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                Stake Any ERC20. Earn. Govern.
              </h2>
              <p style={{ 
                color: 'var(--text-sec)', 
                fontSize: '1.1rem',
                lineHeight: '1.6',
                maxWidth: '600px'
              }}>
                FlashLender is a decentralized platform for staking any ERC20 token in flash loan pools. Earn competitive yields from flash loan fees, and help govern pool fee rates as an investor.
              </p>
            </div>

            {/* Features Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
              gap: '2rem',
              marginBottom: '3rem'
            }}>
              <div className="card" style={{ padding: '1.5rem', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎯</div>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Key Features</h4>
                <ul style={{ 
                  listStyle: 'none', 
                  padding: 0, 
                  color: 'var(--text-sec)',
                  lineHeight: '1.8'
                }}>
                  <li>✓ Stake any ERC20 token</li>
                  <li>✓ Earn passive income from flash loan activity</li>
                  <li>✓ Investor-governed pool fees</li>
                  <li>✓ Real-time APY and pool stats</li>
                  <li>✓ Transparent, secure, and non-custodial</li>
                </ul>
              </div>

              <div className="card" style={{ padding: '1.5rem', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚙️</div>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>How It Works</h4>
                <p style={{ color: 'var(--text-sec)', lineHeight: '1.6' }}>
                  Deposit your tokens into a pool. When flash loans are executed, you earn a share of the fees. Investors vote to set pool fee rates, ensuring fair returns for all.
                </p>
              </div>

              <div className="card" style={{ padding: '1.5rem', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🗳️</div>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Governance</h4>
                <p style={{ color: 'var(--text-sec)', lineHeight: '1.6' }}>
                  Pool fees are governed by you—the investors. Vote on fee rates and shape the future of each pool.
                </p>
              </div>

              <div className="card" style={{ padding: '1.5rem', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔧</div>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Technology</h4>
                <p style={{ color: 'var(--text-sec)', lineHeight: '1.6' }}>
                  Built on Ethereum, powered by smart contracts. Open source and community-driven.
                </p>
              </div>
            </div>

            {/* Contact Section */}
            <div className="card" style={{ 
              padding: '2rem', 
              background: 'linear-gradient(135deg, var(--surface-2), var(--surface))',
              border: '1px solid var(--accent)',
              marginBottom: '2rem'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>💬</div>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Open Source</h4>
                <p style={{ color: 'var(--text-sec)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                  FlashLender is open source and community-driven. Check out the code, contribute, or report issues on GitHub.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a 
                    href="https://github.com/AugustoL/erc20-flash-lender" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-md secondary" 
                    style={{ 
                      textDecoration: 'none',
                      color: 'white',
                      backgroundColor: '#24292f',
                      fontWeight: '500'
                    }}
                  >
                  GitHub Repository
                  </a>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{ 
              padding: '1.5rem', 
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              marginBottom: '2rem'
            }}>
              <div>
                <h5 style={{ color: '#f59e0b', margin: '0.1rem 0rem' }}>Important Disclaimer</h5>
                <p style={{ color: 'var(--text-sec)', fontSize: '0.95em', lineHeight: '1.5', margin: 0 }}>
                  FlashLender is a DeFi platform. Use at your own risk. Smart contracts may contain bugs or vulnerabilities. 
                  Always do your own research and never invest more than you can afford to lose.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};