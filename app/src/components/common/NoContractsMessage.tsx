import { useChainId } from 'wagmi';
import { getNetworkConfig } from '../../config';

interface NoContractsMessageProps {
  pageName: string;
}

export default function NoContractsMessage({ pageName }: NoContractsMessageProps) {
  const chainId = useChainId();
  const network = getNetworkConfig(chainId);

  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="padding-standard">
          <div className="center-content">
            <div className="no-contracts-message">
              <div className="no-contracts-icon">🚫</div>
              <h2>No Contracts Deployed</h2>
              <p>
                The ERC20FlashLender protocol is not yet deployed on{' '}
                <strong>{network?.name || `Chain ${chainId}`}</strong>.
              </p>
              <p>
                This {pageName} page requires the flash loan contracts to be available
                on the current network to function properly.
              </p>
              <div className="no-contracts-actions">
                <p><strong>Available options:</strong></p>
                <ul>
                  <li>Switch to a supported network (like Localhost for development)</li>
                  <li>Check the <a href="/api">API documentation</a> for deployment information</li>
                  <li>Contact the team about deploying to this network</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}