import React from 'react';
import { Link } from 'react-router-dom';

interface FooterProps {
  className?: string;
}

const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  // Get commit hash from environment variable, fallback to 'development'
  const commitHash = process.env.REACT_APP_COMMIT_HASH || 'development';
  
  // Format commit hash - show first 7 characters if it's a full hash
  const formattedCommitHash = commitHash.length > 7 ? commitHash.substring(0, 7) : commitHash;
  
  // Get version from environment variable or fallback
  const appVersion = process.env.REACT_APP_VERSION || '0.1.0';
  
  // Get the GitHub repository URL from package.json or environment
  const repoUrl = process.env.REACT_APP_GITHUB_REPO || 'https://github.com/your-username/erc20Loan';
  
  return (
    <footer className={`app-footer ${className}`}>
      <div className="footer-content">
        <div className="footer-left">
          <Link to="/api" className="footer-link">
            API & Docs
          </Link>
        </div>
        <div className="footer-version">
          <span className="version-label">Version:</span>
          <a 
            href={`${repoUrl}/commit/${commitHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="commit-link"
            title={`View commit ${formattedCommitHash} on GitHub`}
          >
            {appVersion} {formattedCommitHash}
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;