import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { TokenPoolRow } from '../../types';

interface DashboardTableRowProps {
  row: TokenPoolRow;
  isConnected: boolean;
  address?: string;
}

const DashboardTableRow = React.memo<DashboardTableRowProps>(({
  row,
  isConnected,
  address
}) => {
  const navigate = useNavigate();
  
  const formatAmount = (amount: string | undefined, maxLength: number = 8): string => {
    if (!amount || amount === '0') return '0';
    
    const num = parseFloat(amount);
    if (num === 0) return '0';
    
    // For very small numbers, use scientific notation
    if (num < 0.0001) {
      return num.toExponential(2);
    }
    
    // For large numbers, use K/M/B notation
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    
    // For normal numbers, limit decimal places
    const str = num.toFixed(4);
    return str.length > maxLength ? num.toFixed(2) : str;
  };
  
  const handleRowClick = () => {
    navigate(`/pool/${row.address}`);
  };

  return (
    <tr onClick={handleRowClick} style={{ cursor: 'pointer' }}>
      <td>
        <div className="asset-cell">
          <div className="avatar" />
          <div style={{ flex: 1 }}>
            <div className="sym">
              <span>{row.symbol}</span>
              {row.hasUserDeposits && (
                <span style={{ 
                  marginLeft: '8px', 
                  color: '#22c55e', 
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  ●
                </span>
              )}
            </div>
            <div className="nm">{row.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'gray', fontFamily: 'monospace' }}>
              {row.address.slice(0, 10)}...
            </div>
          </div>
        </div>
      </td>
      <td className="center">{row.tvl}</td>
      <td className="center">{row.apy !== undefined && row.apy !== null ? `${row.apy.toFixed(2)}%` : '0%'}</td>
      <td className="center">{row.lpFeeBps}%</td>
      <td className="center">
        <div className="status-info">
          {isConnected && address ? (
            <div style={{ fontSize: '0.85em', lineHeight: '1.3' }}>
              <div style={{ marginBottom: '2px' }}>
                <span style={{ color: '#6b7280' }}>Wallet:</span>{' '}
                <span style={{ fontWeight: '500' }}>{formatAmount(row.walletBalance)} {row.symbol}</span>
              </div>
              <div style={{ marginBottom: '2px' }}>
                <span style={{ color: '#6b7280' }}>Approved:</span>{' '}
                <span style={{ fontWeight: '500', color: row.approvedAmount && parseFloat(row.approvedAmount) > 0 ? '#10b981' : '#6b7280' }}>
                  {formatAmount(row.approvedAmount)} {row.symbol}
                </span>
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>Deposited:</span>{' '}
                <span style={{ fontWeight: '500', color: row.depositedAmount && parseFloat(row.depositedAmount) > 0 ? '#3b82f6' : '#6b7280' }}>
                  {formatAmount(row.depositedAmount)} {row.symbol}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: '#9ca3af', fontSize: '0.875em' }}>
              Connect wallet to view status
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});

DashboardTableRow.displayName = 'DashboardTableRow';

export default DashboardTableRow;