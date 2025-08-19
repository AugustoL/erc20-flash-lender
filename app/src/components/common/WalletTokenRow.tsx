import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WalletTableRow } from '../../types';
import { formatAmount, getTokenType } from '../../utils/helpers';
import TokenIcon from './TokenIcon';

interface WalletTokenRowProps {
  row: WalletTableRow;
  isConnected: boolean;
  address?: string;
  chainId: number;
  onDeposit?: (tokenAddress: string) => void;
}

const WalletTokenRow = React.memo<WalletTokenRowProps>(({
  row,
  isConnected,
  address,
  chainId,
  onDeposit
}) => {
  const navigate = useNavigate();
  
  const handleRowClick = () => {
    if (row.poolExists) {
      navigate(`/pool/${row.address}`);
    }
  };

  const haveDeposits = row.depositedAmount && parseFloat(row.depositedAmount) > 0;
  const haveWalletBalance = row.walletBalance && parseFloat(row.walletBalance) > 0;
  const shouldShowDeposit = isConnected && address && haveWalletBalance;

  const handleDepositClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click navigation
    if (onDeposit) {
      onDeposit(row.address);
    }
  };

  const tokenType = getTokenType(chainId, row.address, row.symbol);

  return (
    <tr className="tokens-row">
      <td onClick={handleRowClick}>
        <div className="asset-cell">
          <TokenIcon 
            address={row.address}
            symbol={row.symbol}
            logoUrl={row.logoUrl}
          />
          <div className="row-asset-content">
            <div className="sym">
              <span>{row.symbol}</span>
            </div>
            <div className="nm">{row.name}</div>
            <div className="row-address-short">
              {row.address.slice(0, 10)}...
            </div>
          </div>
        </div>
      </td>
      <td onClick={handleRowClick} className="center">{tokenType}</td>
      <td onClick={handleRowClick} className="center">
        <div className="status-info">
          {isConnected && address ? (
            <div className="row-status-info">
              <div className="row-status-item">
                <span className="row-status-label">Wallet:</span>{' '}
                <span className="row-status-value">{formatAmount(row.walletBalance)} {row.symbol}</span>
              </div>
              <div className="row-status-item">
                <span className="row-status-label">Allowance:</span>{' '}
                <span className={row.approvedAmount && parseFloat(row.approvedAmount) > 0 ? 'row-status-value-approved' : 'row-status-value-gray'}>
                  {formatAmount(row.approvedAmount)} {row.symbol}
                </span>
              </div>
              <div>
                <span className="row-status-label">Deposited:</span>{' '}
                <span className={haveDeposits ? 'row-status-value-deposited' : 'row-status-value-gray'}>
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
      <td className="center">
        <div className="wallet-actions">
          {shouldShowDeposit && (
            <button 
              className="btn-xs success" 
              onClick={handleDepositClick}
            >
              Deposit
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

WalletTokenRow.displayName = 'WalletTokenRow';

export default WalletTokenRow;