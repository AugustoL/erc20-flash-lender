import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenPoolRow } from '../../types';
import { formatAmount } from '../../utils/helpers';
import TokenIcon from './TokenIcon';

interface TokensTableRowProps {
  row: TokenPoolRow;
  isConnected: boolean;
  address?: string;
}

const TokensTableRow = React.memo<TokensTableRowProps>(({
  row,
  isConnected,
  address
}) => {
  const navigate = useNavigate();
  
  const handleRowClick = () => {
    navigate(`/pool/${row.address}`);
  };


  return (
    <tr onClick={handleRowClick} className="tokens-row">
      <td>
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

TokensTableRow.displayName = 'TokensTableRow';

export default TokensTableRow;