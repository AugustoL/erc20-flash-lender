
export default function Help() {
  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="padding-standard">
          <div className="help-container">
            <h1 className="center-content margin-0">
              FlashLender Help & Guide
            </h1>

            {/* Quick Start Guide */}
            <div className="card help-quick-start">
              <div className="help-section-header">
                <div className="help-section-icon">🚀</div>
                <h3 className="help-section-title">Quick Start Guide</h3>
                <p className="help-section-subtitle">Get started with FlashLender in 3 easy steps</p>
              </div>
              
              <div className="help-steps-grid">
                <div className="help-step">
                  <div className="help-step-number">1</div>
                  <h5 className="help-step-title">Connect Wallet</h5>
                  <p className="help-step-description">
                    Connect your MetaMask or compatible Ethereum wallet to get started.
                  </p>
                </div>
                
                <div className="help-step">
                  <div className="help-step-number">2</div>
                  <h5 className="help-step-title">Choose a Pool</h5>
                  <p className="help-step-description">
                    Browse available token pools and select one that matches your strategy.
                  </p>
                </div>
                
                <div className="help-step">
                  <div className="help-step-number">3</div>
                  <h5 className="help-step-title">Deposit & Earn</h5>
                  <p className="help-step-description">
                    Deposit your tokens and start earning from flash loan fees.
                  </p>
                </div>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="help-faq-section">
              <h3 className="help-faq-title">
                Frequently Asked Questions
              </h3>
              
              <div className="help-faq-grid">
                <div className="card help-faq-item">
                  <h5 className="help-faq-question">
                    💰 What are flash loans and how do I earn from them?
                  </h5>
                  <p className="help-faq-answer">
                    Flash loans are uncollateralized loans that must be repaid within the same transaction. 
                    When you deposit tokens into a pool, you earn a share of the fees charged to flash loan borrowers. 
                    The more flash loan activity, the more you earn.
                  </p>
                </div>

                <div className="card help-faq-item">
                  <h5 className="help-faq-question">
                    🗳️ How does governance work?
                  </h5>
                  <p className="help-faq-answer">
                    As a depositor, you can vote on pool fee rates. Your voting power is proportional to your deposit. 
                    Higher fees mean more earnings per loan but might reduce loan volume. Lower fees attract more borrowers 
                    but reduce per-transaction earnings.
                  </p>
                </div>

                <div className="card help-faq-item">
                  <h5 className="help-faq-question">
                    🔒 Is my money safe?
                  </h5>
                  <p className="help-faq-answer">
                    FlashLender uses audited smart contracts and follows DeFi security best practices.
                    But <strong>IS NOT AUDITED</strong> and like all DeFi protocols, there are inherent risks including smart contract bugs, 
                    market volatility, and regulatory changes. Only invest what you can afford to lose.
                  </p>
                </div>

                <div className="card help-faq-item">
                  <h5 className="help-faq-question">
                    📊 How is APY calculated?
                  </h5>
                  <p className="help-faq-answer">
                    APY is calculated based on recent flash loan activity and pool utilization. 
                    It represents an annualized projection of earnings. Actual returns may vary based on 
                    future flash loan volume and pool fee changes.
                  </p>
                </div>

                <div className="card help-faq-item">
                  <h5 className="help-faq-question">
                    💸 When can I withdraw my tokens?
                  </h5>
                  <p className="help-faq-answer">
                    You can withdraw your tokens and earned fees at any time, as long as there's sufficient 
                    liquidity in the pool. Withdrawals are processed immediately upon confirmation.
                  </p>
                </div>

                <div className="card help-faq-item">
                  <h5 className="help-faq-question">
                    🔄 What tokens can I deposit?
                  </h5>
                  <p className="help-faq-answer">
                    FlashLender supports any ERC20 token. You can deposit into existing pools or create 
                    new pools for tokens that aren't yet supported. Popular tokens like USDC, USDT, 
                    DAI, and WETH typically have the most activity.
                  </p>
                </div>
              </div>
            </div>

            {/* Troubleshooting Section */}
            <h3 className="help-troubleshooting-title">Troubleshooting</h3>
            <div className="card help-troubleshooting">
              <h6 className="help-troubleshooting-item-title">
                Transaction Failed?
              </h6>
              <ul className="help-troubleshooting-list">
                <li>Check your gas limit and try again</li>
                <li>Ensure sufficient ETH for gas fees</li>
                <li>Verify token approval if depositing</li>
              </ul>
            </div>
            
            <div className="card help-troubleshooting">
              <h6 className="help-troubleshooting-item-title">
                Wallet Not Connecting?
              </h6>
              <ul className="help-troubleshooting-list">
                <li>Refresh the page and try again</li>
                <li>Check MetaMask is unlocked</li>
                <li>Switch to Ethereum mainnet</li>
              </ul>
            </div>
            
            <div className="card help-troubleshooting">
              <h6 className="help-troubleshooting-item-title">
                Balance Not Updating?
              </h6>
              <ul className="help-troubleshooting-list">
                <li>Wait for transaction confirmation</li>
                <li>Refresh the page if needed</li>
                <li>Check transaction on Etherscan</li>
              </ul>
            </div>

            {/* Support Section */}
            <div className="card help-support">
              <div className="help-support-content">
                <div className="help-support-icon">💬</div>
                <h4 className="help-support-title">Need More Help?</h4>
                <p className="help-support-description">
                  Can't find what you're looking for? Check out our GitHub repository for technical details, 
                  report issues, or contribute to the project.
                </p>
                <div className="help-support-buttons">
                  <a 
                    href="https://github.com/AugustoL/erc20-flash-lender" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-md secondary github-btn"
                  >
                    🐙 GitHub Repository
                  </a>
                  <a 
                    href="https://github.com/AugustoL/erc20-flash-lender/issues" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-md outline github-btn-outline"
                  >
                    🐛 Report Issue
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
