import React from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { TokenPoolRow, ActionType } from '../../types';

interface DashboardTableRowProps {
  row: TokenPoolRow;
  isConnected: boolean;
  address?: string;
  onOpenModal: (action: ActionType, tokenAddress: string) => void;
  shouldShowApproveButton: (tokenAddress: string) => boolean;
  shouldShowDepositButton: (tokenAddress: string) => boolean;
  getButtonState: (tokenAddress: string) => 'approve' | 'deposit' | 'insufficient' | 'none';
}

const DashboardTableRow = React.memo<DashboardTableRowProps>(({
  row,
  isConnected,
  address,
  onOpenModal,
  shouldShowApproveButton,
  shouldShowDepositButton,
  getButtonState
}) => {
  const buttonState = getButtonState(row.address);
  const showApprove = shouldShowApproveButton(row.address);
  const showDeposit = shouldShowDepositButton(row.address);

  const handleApproveClick = React.useCallback(() => {
    onOpenModal('approve', row.address);
  }, [onOpenModal, row.address]);

  const handleDepositClick = React.useCallback(() => {
    onOpenModal('deposit', row.address);
  }, [onOpenModal, row.address]);

  const handleWithdrawClick = React.useCallback(() => {
    onOpenModal('withdraw', row.address);
  }, [onOpenModal, row.address]);

  return (
    <tr>
      <td>
        <div className="asset-cell">
          <div className="avatar" />
          <div>
            <div className="sym">
              <Link 
                to={`/pool/${row.address}`}
                className="token-link"
              >
                {row.symbol}
              </Link>
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
      <td className="center">{row.apy !== undefined && row.apy !== null ? `${row.apy.toFixed(2)}%` : 'N/A'}</td>
      <td className="center">
        {row.totalShares && row.decimals 
          ? Number(ethers.formatUnits(row.totalShares, row.decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 })
          : 'N/A'
        }
      </td>
      <td className="center">{row.lpFeeBps}%</td>
      <td className="center">
        <div className="row-actions center">
          {isConnected && address ? (
            <>
              {buttonState === 'none' ? (
                <button 
                  className="btn-xs outline" 
                  disabled
                >
                  No Balance Data
                </button>
              ) : (
                <>
                  {showApprove && (
                    <button 
                      className="btn-xs primary" 
                      onClick={handleApproveClick}
                      style={{ marginRight: showDeposit ? '4px' : '0' }}
                    >
                      Approve
                    </button>
                  )}
                  {showDeposit && (
                    <button 
                      className="btn-xs success" 
                      onClick={handleDepositClick}
                    >
                      Deposit
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <button 
              className="btn-xs success" 
              disabled
            >
              Connect Wallet
            </button>
          )}
          {row.hasUserDeposits && (
            <button 
              className="btn-xs success" 
              disabled={!address}
              onClick={handleWithdrawClick}
            >
              Withdraw
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

DashboardTableRow.displayName = 'DashboardTableRow';

export default DashboardTableRow;