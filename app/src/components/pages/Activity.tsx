import { useParams } from 'react-router-dom';

export default function Activity() {
  const { userAddress } = useParams<{ userAddress: string }>();

  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head">
          <h3>User Activity</h3>
        </div>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-sec)', marginBottom: '20px' }}>
            <strong>Parameter received:</strong> {userAddress || 'No user address provided'}
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
            <li>📊 Flash loan history for the user</li>
            <li>💰 Deposit and withdrawal transactions</li>
            <li>🗳️ Fee voting activity</li>
            <li>📈 Earnings and fee distributions</li>
            <li>⏰ Transaction timestamps and status</li>
            <li>🔗 Links to view transactions on block explorer</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
