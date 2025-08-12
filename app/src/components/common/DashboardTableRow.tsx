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

  const getTokenIconUrl = (tokenAddress: string): string => {
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${ethers.getAddress(tokenAddress)}/logo.png`;
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
    // Show the fallback avatar
    const fallback = img.nextElementSibling as HTMLElement;
    if (fallback) {
      fallback.style.display = 'block';
    }
  };

  return (
    <tr onClick={handleRowClick} className="dashboard-row">
      <td>
        <div className="asset-cell">
          <div className="token-avatar">
            <img 
              src={getTokenIconUrl(row.address)}
              alt={`${row.symbol} logo`}
              className="token-icon"
              onError={handleImageError}
            />
            <div className="avatar pool-avatar-fallback" />
          </div>
          <div className="row-asset-content">
            <div className="sym">
              <span>{row.symbol}</span>
              {row.hasUserDeposits && (
                <span className="row-user-indicator">
                  ●
                </span>
              )}
            </div>
            <div className="nm">{row.name}</div>
            <div className="row-address-short">
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
            <div className="row-status-info">
              <div className="row-status-item">
                <span className="row-status-label">Wallet:</span>{' '}
                <span className="row-status-value">{formatAmount(row.walletBalance)} {row.symbol}</span>
              </div>
              <div className="row-status-item">
                <span className="row-status-label">Approved:</span>{' '}
                <span className={row.approvedAmount && parseFloat(row.approvedAmount) > 0 ? 'row-status-value-approved' : 'row-status-value-gray'}>
                  {formatAmount(row.approvedAmount)} {row.symbol}
                </span>
              </div>
              <div>
                <span className="row-status-label">Deposited:</span>{' '}
                <span className={row.depositedAmount && parseFloat(row.depositedAmount) > 0 ? 'row-status-value-deposited' : 'row-status-value-gray'}>
                  {formatAmount(row.depositedAmount)} {row.symbol}
                </span>
              </div>
            </div>
          ) : (
            <div className="row-status-disconnected">
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