import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import '../../styles/styles.css';
import { ActionType, WithdrawType, ActionModalProps } from '../../types';

// Re-export types for backward compatibility
export type { ActionType, WithdrawType };

const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  action,
  tokenSymbol = 'TOKEN',
  tokenDecimals = 18,
  availableBalance = '0',
  availableFees = '0',
  currentVoteFee = 0,
  onConfirm,
  isLoading = false
}) => {
  const [amount, setAmount] = useState('');
  const [feePercentage, setFeePercentage] = useState(currentVoteFee.toString());
  const [withdrawType, setWithdrawType] = useState<WithdrawType>('all');
  const [error, setError] = useState('');

  // Reset form when modal opens/closes or action changes
  useEffect(() => {
    if (isOpen) {
      if (action === 'withdraw') {
        // Default to withdraw all, and set amount based on selection
        setWithdrawType('all');
        const withdrawAmount = formatBalance(availableBalance);
        setAmount(withdrawAmount);
      } else {
        setAmount('');
      }
      setFeePercentage(currentVoteFee.toString());
      setError('');
    }
  }, [isOpen, action, currentVoteFee, availableBalance, availableFees]);

  if (!isOpen) return null;

  const getModalTitle = () => {
    switch (action) {
      case 'deposit':
        return `Deposit ${tokenSymbol}`;
      case 'withdraw':
        return `Withdraw ${tokenSymbol}`;
      case 'vote':
        return `Vote for LP Fee`;
      case 'approve':
        return `Approve ${tokenSymbol}`;
      default:
        return 'Action';
    }
  };

  const getModalDescription = () => {
    switch (action) {
      case 'deposit':
        return `Enter the amount of ${tokenSymbol} you want to deposit into the liquidity pool. You'll receive shares proportional to your deposit and earn fees from flash loans.`;
      case 'withdraw':
        return `This will withdraw your entire position from the liquidity pool (principal deposit plus accumulated fees). The amount shown is your total withdrawable balance.`;
      case 'vote':
        return 'Vote for your preferred LP fee rate. Your vote weight is proportional to your shares in the pool. The fee can be between 0% and 5% with up to 2 decimal places.';
      case 'approve':
        return `Approve the flash lender contract to spend your ${tokenSymbol} tokens. Enter the amount you want to allow the contract to spend.`;
      default:
        return '';
    }
  };

  const formatBalance = (balance: string) => {
    // Since Pool.tsx now provides properly formatted balances, just return them directly
    return balance;
  };

  const handleMaxClick = () => {
    if (availableBalance && availableBalance !== '0') {
      const formatted = formatBalance(availableBalance);
      setAmount(formatted);
      setError('');
    }
  };

  const handleInfiniteClick = () => {
    // Use ethers MaxUint256 constant for proper handling
    const maxUint256 = ethers.MaxUint256.toString();
    setAmount(maxUint256);
    setError('');
  };

  // Helper function to display amount in a user-friendly way
  const getDisplayAmount = () => {
    const maxUint256 = ethers.MaxUint256.toString();
    if (amount === maxUint256) {
      return 'Unlimited';
    }
    return amount;
  };

  const validateAmount = (value: string): boolean => {
    if (!value || value === '0') {
      setError('Amount is required');
      return false;
    }

    try {
      // For approve actions, allow the MAX_UINT256 value
      const maxUint256 = ethers.MaxUint256.toString();
      if (action === 'approve' && value === maxUint256) {
        setError('');
        return true;
      }

      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue <= 0) {
        setError('Amount must be greater than 0');
        return false;
      }

      // For approve actions, don't check against available balance since user can approve more than they have
      if (action === 'approve') {
        setError('');
        return true;
      }

      const availableNum = parseFloat(formatBalance(availableBalance));
      if (numValue > availableNum) {
        setError(`Amount exceeds available balance (${formatBalance(availableBalance)} ${tokenSymbol})`);
        return false;
      }

      setError('');
      return true;
    } catch {
      setError('Invalid amount format');
      return false;
    }
  };

  const validateFeePercentage = (value: string): boolean => {
    if (!value) {
      setError('Fee percentage is required');
      return false;
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setError('Fee percentage must be a valid number');
      return false;
    }

    if (numValue < 0 || numValue > 5) {
      setError('Fee percentage must be between 0% and 5%');
      return false;
    }

    // Check for maximum 2 decimal places
    const decimalPlaces = (value.split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      setError('Fee percentage can have at most 2 decimal places');
      return false;
    }

    setError('');
    return true;
  };

  const handleWithdrawTypeChange = (type: WithdrawType) => {
    setWithdrawType(type);
    if (type === 'all') {
      setAmount(formatBalance(availableBalance));
    } else {
      setAmount(formatBalance(availableFees));
    }
    setError('');
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Handle "Unlimited" input by converting it to MAX_UINT256
    const maxUint256 = ethers.MaxUint256.toString();
    if (value.toLowerCase() === 'unlimited') {
      setAmount(maxUint256);
    } else {
      setAmount(value);
    }
    
    if (value) {
      validateAmount(value.toLowerCase() === 'unlimited' ? maxUint256 : value);
    } else {
      setError('');
    }
  };

  const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFeePercentage(value);
    
    if (value) {
      validateFeePercentage(value);
    } else {
      setError('');
    }
  };

  const handleConfirm = () => {
    let isValid = false;

    if (action === 'vote') {
      isValid = validateFeePercentage(feePercentage);
      if (isValid) {
        onConfirm('', parseFloat(feePercentage));
      }
    } else if (action === 'withdraw') {
      // For withdrawals, we don't validate amount since it's based on selection
      onConfirm(amount, undefined, withdrawType);
    } else {
      isValid = validateAmount(amount);
      if (isValid) {
        onConfirm(amount);
      }
    }
  };

  const isConfirmDisabled = () => {
    if (isLoading) return true;
    
    if (action === 'vote') {
      return !feePercentage || error !== '';
    } else {
      return !amount || error !== '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{getModalTitle()}</h3>
          <button className="modal-close" onClick={onClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="form-help" style={{ marginBottom: '20px' }}>
            {getModalDescription()}
          </p>

          {action !== 'vote' ? (
            <>
              {action === 'withdraw' && (
                <div className="form-group">
                  <label className="form-label">
                    Withdrawal Type
                  </label>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <button
                      type="button"
                      className={`btn-md ${withdrawType === 'all' ? 'primary' : 'outline'}`}
                      onClick={() => handleWithdrawTypeChange('all')}
                      disabled={isLoading}
                    >
                      Withdraw All (Principal + Fees)
                    </button>
                    <button
                      type="button"
                      className={`btn-md ${withdrawType === 'fees' ? 'primary' : 'outline'}`}
                      onClick={() => handleWithdrawTypeChange('fees')}
                      disabled={isLoading || !availableFees || availableFees === '0'}
                    >
                      Withdraw Fees Only
                    </button>
                  </div>
                  <div className="form-help">
                    {withdrawType === 'all' 
                      ? 'Withdraw your entire position (original deposit plus accumulated fees)' 
                      : 'Withdraw only the fees you have earned, keeping your principal deposited'
                    }
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">
                  Amount ({tokenSymbol})
                </label>
                <div className="input-group">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="0.0"
                    value={getDisplayAmount()}
                    onChange={handleAmountChange}
                    disabled={isLoading || action === 'withdraw'}
                    readOnly={action === 'withdraw'}
                  />
                  {action !== 'withdraw' && (
                    <div className="input-group-append">
                      <button
                        type="button"
                        className="btn-xs outline"
                        onClick={handleMaxClick}
                        disabled={isLoading || ((action === 'deposit' || action === 'approve') && (!availableBalance || availableBalance === '0'))}
                      >
                        MAX
                      </button>
                      {action === 'approve' && (
                        <button
                          type="button"
                          className="btn-xs outline"
                          onClick={handleInfiniteClick}
                          disabled={isLoading}
                          style={{ marginLeft: '4px' }}
                        >
                          Unlimited
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {(availableBalance && availableBalance !== '0') || action === 'deposit' || action === 'approve' ? (
                  <div className="available-balance">
                    {action === 'withdraw' ? 
                      (withdrawType === 'all' ? 'Total withdrawable:' : 'Fees available:') : 
                      action === 'approve' ? 'Wallet balance:' : 'Available:'
                    } <span className="available-amount">
                      {action === 'withdraw' && withdrawType === 'fees' ? 
                        (availableFees && availableFees !== '0' ? `${formatBalance(availableFees)} ${tokenSymbol}` : `0 ${tokenSymbol}`) :
                        (availableBalance && availableBalance !== '0' ? `${formatBalance(availableBalance)} ${tokenSymbol}` : `0 ${tokenSymbol}`)
                      }
                    </span>
                    {(action === 'deposit' || action === 'approve') && (!availableBalance || availableBalance === '0') && (
                      <div style={{ fontSize: '0.8em', color: '#888', marginTop: '4px' }}>
                        Note: Make sure you have {tokenSymbol} tokens in your wallet
                      </div>
                    )}
                  </div>
                ) : null}
                {error && <div className="form-error">{error}</div>}
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label">
                Fee Percentage (%)
              </label>
              <input
                type="number"
                className="form-input"
                placeholder="0.00"
                value={feePercentage}
                onChange={handleFeeChange}
                disabled={isLoading}
                step="0.01"
                min="0"
                max="5"
              />
              <div className="form-help">
                Enter a value between 0.00% and 5.00%. Your vote weight is proportional to your shares.
              </div>
              {error && <div className="form-error">{error}</div>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn-md outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="btn-md primary"
            onClick={handleConfirm}
            disabled={isConfirmDisabled()}
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;
