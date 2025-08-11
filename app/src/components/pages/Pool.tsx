import { useParams } from 'react-router-dom';

export default function Pool() {
  const { tokenAddress } = useParams<{ tokenAddress: string }>();

  return (
    <div className="dash-container">     
      <div className="card surface">
        <div className="card-head">
          <h3>Pool Information</h3>
        </div>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-sec)', marginBottom: '20px' }}>
            <strong>Parameter received:</strong> {tokenAddress || 'No token address provided'}
          </p>
          <p style={{ color: 'var(--text-primary)' }}>
            This view will display:
          </p>
          <ul style={{ 
            listStyle: 'none', 
            padding: 0, 
            color: 'var(--text-sec)', 
            lineHeight: '1.8' 
          }}>
            <li>🪙 Token information and current price</li>
            <li>💧 Total Value Locked (TVL) and liquidity</li>
            <li>📊 Flash loan volume and frequency charts</li>
            <li>💰 Fee structure and earnings distribution</li>
            <li>👥 Liquidity providers and their shares</li>
            <li>🗳️ Fee voting history and current proposals</li>
            <li>📈 Historical performance metrics</li>
            <li>⚡ Real-time flash loan activity</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
