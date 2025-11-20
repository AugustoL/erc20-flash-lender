import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import '../../../styles/styles.css';
import { ActionType, WithdrawType, PoolActionModalProps } from '../../../types';
import { getNetworkContracts } from '../../../config';
import { useChainId } from 'wagmi';
import { formatTokenAmount } from '../../../utils';
import BaseModal from './BaseModal';

// Re-export types for backward compatibility
export type { ActionType, WithdrawType };

const PoolActionModal: React.FC<PoolActionModalProps> = ({
  isOpen,
  onClose,
  action,
  tokenSymbol = 'TOKEN',
  availableBalance = '0',
  availableFees = '0',
  currentAllowance = '0',
  testerBalance,
  currentVoteFee = 0,
  feeGovernance = [],
  onConfirm,
  onSwitchToApprove,
  isLoading = false,
}) => {
  const [amount, setAmount] = useState('');
  const [feePercentage, setFeePercentage] = useState(currentVoteFee.toString());
  const [withdrawType, setWithdrawType] = useState<WithdrawType>('all');
  const [useExecutorFactory, setUseExecutorFactory] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState('');
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const chainId = useChainId();
  const flashLenderTesterAddress = getNetworkContracts(chainId).find(c => c.name === 'FlashLoanTester')?.address || '';

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
      setShowDropdown(false);
      setError('');
    }
  }, [isOpen, action, currentVoteFee, availableBalance, availableFees]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDropdown && !(event.target as Element)?.closest('.fee-input-container')) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    // Explicitly return undefined if not showing dropdown
    return undefined;
  }, [showDropdown]);

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
        return `Set Allowance for ${tokenSymbol}`;
      case 'testLoan':
        return `Test Flash Loan (${tokenSymbol})`;
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
        return `Set the allowance for the flash lender contract to spend your ${tokenSymbol} tokens. You can set any amount, use "Unlimited" for maximum convenience, or set to zero to revoke approval.`;
      case 'testLoan':
        return `Execute a test flash loan for ${tokenSymbol}. You'll specify the amount to borrow and an extra percentage to return in addition to the owed fee to validate end-to-end repayment. 
        Make sure the ${flashLenderTesterAddress} contract has enough tokens to repay the loan plus fees.`;
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
    // For approve actions, allow zero to revoke approval
    if (action === 'approve' && (value === '0' || value === '')) {
      setError('');
      return true;
    }

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
    setShowDropdown(false); // Close dropdown when user starts typing
    
    if (value) {
      validateFeePercentage(value);
    } else {
      setError('');
    }
  };

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  const handleFeeSelect = (selectedFee: number) => {
    const feePercentageValue = (selectedFee / 100).toFixed(2);
    setFeePercentage(feePercentageValue);
    setShowDropdown(false);
    setError('');
  };

  const handleConfirm = () => {
    let isValid = false;

    if (action === 'vote') {
      isValid = validateFeePercentage(feePercentage);
      if (isValid) {
        onConfirm('', parseFloat(feePercentage));
      }
    } else if (action === 'testLoan') {
      // Validate amount and extra percentage
      const amountValid = validateAmount(amount);
      isValid = amountValid;
      if (isValid) {
        // Overload: pass extra percentage via feePercentage param to avoid breaking props
        onConfirm(amount, undefined, useExecutorFactory);
      }
    } else if (action === 'withdraw') {
      // For withdrawals, we don't validate amount since it's based on selection
      onConfirm(amount, undefined, false, withdrawType);
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
    } else if (action === 'testLoan') {
      return !amount ||  error !== '';
    } else {
      return !amount || error !== '';
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={getModalTitle()}
      isLoading={isLoading}
    >
      <p className="form-help action-modal-help-text">
        {getModalDescription()}
      </p>

          {action !== 'vote' ? (
            <>
              {action === 'withdraw' && (
                <div className="form-group">
                  <label className="form-label">
                    Withdrawal Type
                  </label>
                  <div className="action-modal-withdrawal-type-buttons">
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
                  {(action !== 'withdraw' && action !== 'testLoan') && (
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
                        <>
                          <button
                            type="button"
                            className="btn-xs outline"
                            onClick={handleInfiniteClick}
                            disabled={isLoading}
                          >
                            Unlimited
                          </button>
                          <button
                            type="button"
                            className="btn-xs outline"
                            onClick={() => { setAmount('0'); setError(''); }}
                            disabled={isLoading}
                          >
                            Zero
                          </button>
                        </>
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
                        (availableFees && availableFees !== '0' ? `${formatTokenAmount(availableFees)} ${tokenSymbol}` : `0 ${tokenSymbol}`) :
                        (availableBalance && availableBalance !== '0' ? `${formatTokenAmount(availableBalance)} ${tokenSymbol}` : `0 ${tokenSymbol}`)
                      }
                    </span>
                    {(action === 'deposit' || action === 'approve') && currentAllowance && (
                      <div className="available-balance">
                        Current Allowance: <span className="available-amount">
                          {currentAllowance === ethers.MaxUint256.toString() || parseFloat(currentAllowance) >= parseFloat(availableBalance) * 1000 
                            ? 'Unlimited' 
                            : `${formatTokenAmount(currentAllowance)} ${tokenSymbol}`
                          }
                        </span>
                      </div>
                    )}
                    {(action === 'deposit' || action === 'approve') && (!availableBalance || availableBalance === '0') && (
                      <div className="action-modal-balance-note">
                        Note: Make sure you have {tokenSymbol} tokens in your wallet
                      </div>
                    )}
                    {action === 'testLoan' && testerBalance && (
                      <div className="available-balance">
                        Tester Balance: <span className="available-amount">{formatTokenAmount(testerBalance)}</span> {tokenSymbol}
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
              <div className="fee-input-container">
                <div className="input-group">
                  <input
                    type="number"
                    className={`form-input ${action === 'vote' ? 'with-dropdown' : ''}`}
                    placeholder="0.00"
                    value={feePercentage}
                    onChange={handleFeeChange}
                    disabled={isLoading}
                    step="0.01"
                    min="0"
                    max="5"
                  />
                  {action === 'vote' && (
                    <button
                      type="button"
                      className="dropdown-toggle"
                      onClick={toggleDropdown}
                      disabled={isLoading}
                      title={feeGovernance.length > 0 ? "Select from existing voted fees" : "No fee options available"}
                    >
                      <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 16 16" 
                        fill="none"
                        className={showDropdown ? 'token-dropdown-arrow-rotated' : 'token-dropdown-arrow'}
                      >
                        <path 
                          d="M4 6L8 10L12 6" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {showDropdown && (
                  <div className="dropdown-menu">
                    {feeGovernance.length > 0 ? (
                      feeGovernance.map(fee => (
                        <button
                          key={fee.fee}
                          type="button"
                          className={`dropdown-item ${fee.isActive ? 'active' : ''}`}
                          onClick={() => handleFeeSelect(fee.fee)}
                          disabled={isLoading}
                        >
                          <div className="fee-option">
                            <div className="fee-percentage">
                              <strong>{(fee.fee / 100).toFixed(2)}%</strong>
                              {fee.isActive && <span className="active-indicator">• Active</span>}
                            </div>
                            <div className="fee-votes">
                              {fee.percentage.toFixed(1)}% votes
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="dropdown-item disabled">
                        <div className="fee-option">
                          <div className="fee-percentage">No fee options available</div>
                          <div className="fee-votes">Debug: {JSON.stringify(feeGovernance)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-help">
                {feeGovernance.length > 0 
                  ? 'Select from existing voted fees or enter a custom value between 0.00% and 5.00%. Your vote weight is proportional to your shares.'
                  : 'Enter a value between 0.00% and 5.00%. Your vote weight is proportional to your shares.'
                }
              </div>
              {error && <div className="form-error">{error}</div>}
            </div>
          )}

          {/* Only show for Test Loan action */}
          {action === 'testLoan' && (
            <div className="mt-3 flex items-center">
              <input
                id="use-executor-factory"
                type="checkbox"
                className="h-4 w-4"
              checked={useExecutorFactory}
              onChange={(e) => setUseExecutorFactory(e.target.checked)}
            />
            <label htmlFor="use-executor-factory" className="ml-2 text-sm">
              Use executor factory
            </label>
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-actions">
          <button
            className="btn-md outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          {action === 'deposit' && onSwitchToApprove && (
            <button
              className="btn-md secondary"
              onClick={onSwitchToApprove}
              disabled={isLoading}
            >
              Set Allowance
            </button>
          )}
          <button
            className={`btn-md primary ${isLoading ? 'loading' : ''}`}
            onClick={handleConfirm}
            disabled={isConfirmDisabled()}
            ref={confirmBtnRef}
          >
            <span className="btn-text">Confirm</span>
            <span className="button-spinner" aria-hidden={!isLoading}>
              {isLoading && <Spinner />}
            </span>
          </button>
        </div>
    </BaseModal>
  );
};

const Spinner = () => (
  <div className="modal-loading-spinner" role="status" aria-live="polite" aria-label="Loading">
    <svg className="spinner-ring" viewBox="0 0 50 50">
      <circle className="spinner-path" cx="25" cy="25" r="20" fill="none" />
    </svg>
  </div>
);
export default PoolActionModal;