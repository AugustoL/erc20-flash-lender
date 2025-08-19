
export default function About() {
  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="padding-standard">
          <div className="about-container">
            {/* Hero Section */}
            <div className="center-content about-hero">
              <div className="about-hero-logo">
                <img 
                  src="/logo.png" 
                  alt="FlashLender Logo" 
                  className="about-logo"
                />
              </div>
              <h2 className="about-hero-title">
                Stake Any ERC20. Earn. Govern.
              </h2>
              <p className="about-hero-description">
                FlashLender is a decentralized platform for staking any ERC20 token in flash loan pools. Earn competitive yields from flash loan fees, and help govern pool fee rates as an investor.
              </p>
            </div>

            {/* Features Grid */}
            <div className="about-features-grid">
              <div className="card about-feature-card">
                <div className="about-feature-icon">🎯</div>
                <h4 className="about-feature-title">Key Features</h4>
                <ul className="about-feature-list">
                  <li>✓ Stake any ERC20 token</li>
                  <li>✓ Earn passive income from flash loan activity</li>
                  <li>✓ Investor-governed pool fees</li>
                  <li>✓ Real-time APY and pool stats</li>
                  <li>✓ Transparent, secure, and non-custodial</li>
                </ul>
              </div>

              <div className="card about-feature-card">
                <div className="about-feature-icon">⚙️</div>
                <h4 className="about-feature-title">How It Works</h4>
                <p className="about-feature-description">
                  Deposit your tokens into a pool. When flash loans are executed, you earn a share of the fees. Investors vote to set pool fee rates, ensuring fair returns for all.
                </p>
              </div>

              <div className="card about-feature-card">
                <div className="about-feature-icon">🗳️</div>
                <h4 className="about-feature-title">Governance</h4>
                <p className="about-feature-description">
                  Pool fees are governed by you—the investors. Vote on fee rates and shape the future of each pool.
                </p>
              </div>

              <div className="card about-feature-card">
                <div className="about-feature-icon">🔧</div>
                <h4 className="about-feature-title">Technology</h4>
                <p className="about-feature-description">
                  Built on Ethereum, powered by smart contracts. Open source and community-driven.
                </p>
              </div>
            </div>

            {/* Contact Section */}
            <div className="card about-contact-card">
              <div className="about-contact-content">
                <div className="about-contact-icon">💬</div>
                <h4 className="about-contact-title">Open Source</h4>
                <p className="about-contact-description">
                  FlashLender is open source and community-driven. Check out the code, contribute, or report issues on GitHub.
                </p>
                <div className="about-contact-buttons">
                  <a 
                    href="https://github.com/AugustoL/erc20-flash-lender" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-md github-btn"
                  >
                  GitHub Repository
                  </a>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="about-disclaimer">
              <div>
                <h5 className="about-disclaimer-title">Important Disclaimer</h5>
                <p className="about-disclaimer-text">
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