import React, { useState, useEffect } from 'react';
import { ethers, MaxUint256 } from 'ethers';
import { useAccount } from 'wagmi';
import { useDebouncedTokenInfo } from '../../../hooks/useTokenInfo';
import { getERC20FlashLenderAddress } from '../../../config';
import { safeFormatUnits, safeParseUnits } from '../../../utils/helpers';
import BaseModal from './BaseModal';
import '../../../styles/styles.css';

interface TokenOption {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

interface NewTokenDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tokenAddress: string, amount: string, tokenInfo: { symbol: string; name: string; decimals: number }) => void;
  onApprove?: (tokenAddress: string, amount: string) => void;
  isLoading?: boolean;
  provider?: ethers.Provider;
  userAddress?: string;
  existingTokens?: TokenOption[];
  selectedTokenAddress?: string;
}

const NewTokenDepositModal: React.FC<NewTokenDepositModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onApprove,
  isLoading = false,
  provider,
  userAddress,
  existingTokens = [],
  selectedTokenAddress = ''
}) => {
  // Get chain ID and lender address
  const { chainId } = useAccount();
  const currentChainId = chainId || 31337; // Default to localhost if no chain
  const lenderAddress = getERC20FlashLenderAddress(currentChainId);
  const [tokenAddress, setTokenAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [actionMode, setActionMode] = useState<'none' | 'approve' | 'deposit'>('none');

  const { tokenInfo, isLoading: isValidatingToken, error: tokenError, validateToken, clearToken } = 
    useDebouncedTokenInfo(provider, 500);

  // Reset form when modal opens/closes and set selected token address
  useEffect(() => {
    if (isOpen) {
      setTokenAddress(selectedTokenAddress);
      setAmount('');
      setError('');
      setAllowance(BigInt(0));
      setBalance(BigInt(0));
      setShowDropdown(false);
      setActionMode('none');
      clearToken();
    }
  }, [isOpen, selectedTokenAddress, clearToken]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDropdown && !(event.target as Element)?.closest('.token-input-container')) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      if (showDropdown) {
        document.removeEventListener('mousedown', handleClickOutside);
      }
    };
  }, [showDropdown]);

  // Validate token address when user types
  useEffect(() => {
    validateToken(tokenAddress);
  }, [tokenAddress, validateToken]);

  // Check token allowance and balance when token info is valid
  useEffect(() => {
    const checkTokenData = async () => {
      if (!tokenInfo?.isValid || !userAddress || !lenderAddress || !provider) {
        setAllowance(BigInt(0));
        setBalance(BigInt(0));
        return;
      }

      setIsCheckingApproval(true);
      setIsCheckingBalance(true);
      
      try {
        const tokenContract = new ethers.Contract(
          tokenInfo.address,
          [
            'function allowance(address owner, address spender) view returns (uint256)',
            'function balanceOf(address owner) view returns (uint256)'
          ],
          provider
        );

        // Fetch both allowance and balance in parallel
        const [currentAllowance, currentBalance] = await Promise.all([
          tokenContract.allowance?.(userAddress, lenderAddress) || BigInt(0),
          tokenContract.balanceOf?.(userAddress) || BigInt(0)
        ]);
        
        setAllowance(currentAllowance);
        setBalance(currentBalance);
      } catch (error) {
        console.error('Error checking token data:', error);
        setAllowance(BigInt(0));
        setBalance(BigInt(0));
      } finally {
        setIsCheckingApproval(false);
        setIsCheckingBalance(false);
      }
    };

    checkTokenData();
  }, [tokenInfo, userAddress, lenderAddress, provider]);

  if (!isOpen) return null

  const parseAmount = (value: string, decimals: number = 18): bigint => {
    if (!value || value.trim() === '') return BigInt(0);
    try {
      return safeParseUnits(value.trim(), decimals);
    } catch (error) {
      throw new Error('Invalid amount format');
    }
  };

  const needsApproval = (): boolean => {
    if (!tokenInfo?.isValid || !amount.trim()) return false;
    
    try {
      const parsedAmount = parseAmount(amount, tokenInfo.decimals);
      return parsedAmount > allowance;
    } catch (error) {
      return false;
    }
  };

  const validateAmount = (value: string): string | null => {
    if (!value || value.trim() === '') {
      return 'Amount is required';
    }

    try {
      const parsedAmount = parseAmount(value, tokenInfo?.decimals || 18);
      // For approve mode, allow zero to revoke approval
      if (actionMode === 'approve' && parsedAmount === BigInt(0)) {
        return null;
      }
      if (parsedAmount <= 0) {
        return 'Amount must be greater than 0';
      }
      return null;
    } catch (error) {
      return 'Invalid amount format';
    }
  };

    const handleTokenAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTokenAddress(value);
    setError('');
    setAllowance(BigInt(0));
    setBalance(BigInt(0));
    setShowDropdown(false); // Close dropdown when user starts typing
  };

  const handleTokenSelect = (selectedToken: TokenOption) => {
    setTokenAddress(selectedToken.address);
    setError('');
    setAllowance(BigInt(0));
    setBalance(BigInt(0));
    setShowDropdown(false);
  };

  const toggleDropdown = () => {
    if (existingTokens.length > 0) {
      setShowDropdown(!showDropdown);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAmount(value);

    // Clear error when user starts typing
    if (error && error.includes('amount')) {
      setError('');
    }
  };

  const handleSetMaxAmount = () => {
    if (tokenInfo?.isValid && balance > BigInt(0)) {
      // Use the actual user balance
      const maxAmount = safeFormatUnits(balance, tokenInfo.decimals);
      setAmount(maxAmount);
    }
  };

  const handleConfirm = () => {
    if (!tokenInfo || !tokenInfo.isValid) {
      setError('Please enter a valid token address');
      return;
    }

    const amountError = validateAmount(amount);
    if (amountError) {
      setError(amountError);
      return;
    }

    onConfirm(tokenInfo.address, amount, {
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
      decimals: tokenInfo.decimals
    });
  };

  const handleApprove = () => {
    if (!tokenInfo || !tokenInfo.isValid) {
      setError('Please enter a valid token address');
      return;
    }

    const amountError = validateAmount(amount);
    if (amountError) {
      setError(amountError);
      return;
    }

    if (onApprove) {
      onApprove(tokenInfo.address, amount);
      setActionMode('none');
    }
  };

  const isFormValid = () => {
    return (
      tokenInfo && 
      tokenInfo.isValid && 
      amount.trim() !== '' && 
      validateAmount(amount) === null &&
      !isValidatingToken &&
      !isLoading &&
      !isCheckingApproval &&
      !isCheckingBalance
    );
  };

  const getTokenStatusDisplay = () => {
    if (isValidatingToken) {
      return (
        <div className="token-validation-status validating">
          <div className="loading-spinner"></div>
          <span>Validating token...</span>
        </div>
      );
    }

    if (tokenError) {
      return (
        <div className="token-validation-status error">
          <span className="error-icon">⚠️</span>
          <span>{tokenError}</span>
        </div>
      );
    }

    if (tokenInfo && tokenInfo.isValid) {
      return (
        <div className="token-validation-status valid">
          <span className="success-icon">✅</span>
          <div className="token-info">
            <div className="token-primary">
              <strong>{tokenInfo.symbol}</strong> - {tokenInfo.name}
            </div>
            <div className="token-secondary">
              Decimals: {tokenInfo.decimals}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={existingTokens.length > 0 ? 'Deposit Token' : 'Add New Token'}
      isLoading={isLoading}
    >
      <p className="form-help token-modal-help-text">
        {existingTokens.length > 0 
          ? 'Select an existing token from the dropdown or enter a new ERC20 token address to create a flash loan pool.'
          : 'Deposit a new ERC20 token to create a flash loan pool. Enter the token contract address and the amount you want to deposit.'
        }
        {needsApproval() && (
          <><br /><br />
          <strong>⚠️ Approval Required:</strong> You need to approve the contract to spend your tokens before you can deposit.
          </>
        )}
      </p>

          {/* Token Address Input */}
          <div className="form-group">
            <label className="form-label" htmlFor="tokenAddress">Token Address</label>
            <div className="token-input-container">
              <input
                id="tokenAddress"
                type="text"
                value={tokenAddress}
                onChange={handleTokenAddressChange}
                placeholder="0x... or select from existing tokens"
                className={`form-input ${tokenError ? 'error' : tokenInfo?.isValid ? 'valid' : ''} ${existingTokens.length > 0 ? 'with-dropdown' : ''}`}
                disabled={isLoading}
              />
              {existingTokens.length > 0 && (
                <button
                  type="button"
                  className="dropdown-toggle"
                  onClick={toggleDropdown}
                  disabled={isLoading}
                  title="Select from existing tokens"
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
              {showDropdown && existingTokens.length > 0 && (
                <div className="dropdown-menu">
                  {existingTokens.map(token => (
                    <button
                      key={token.address}
                      type="button"
                      className="dropdown-item"
                      onClick={() => handleTokenSelect(token)}
                      disabled={isLoading}
                    >
                      <div className="token-option">
                        <div className="token-symbol">{token.symbol}</div>
                        <div className="token-name">{token.name}</div>
                        <div className="token-address">{token.address.slice(0, 10)}...</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="form-help">
              {existingTokens.length > 0 
                ? 'Enter a token contract address or use the dropdown to select from existing deposited tokens'
                : 'Enter the contract address of the ERC20 token you want to deposit'
              }
            </div>
            
            {/* Token Validation Status */}
            {getTokenStatusDisplay()}
            
            {/* Balance Information - Show immediately when token is valid */}
            {tokenInfo?.isValid && (
              <div className="form-help">
                {isCheckingBalance ? (
                  <div className="token-checking-approval">
                    🔄 Checking balance...
                  </div>
                ) : (
                  <div className="token-allowance-display">
                    💰 Your balance: {safeFormatUnits(balance, tokenInfo.decimals)} {tokenInfo.symbol}
                  </div>
                )}
                {isCheckingApproval ? (
                  <div className="token-checking-approval">
                    🔄 Checking approval status...
                  </div>
                ) : allowance > BigInt(0) ? (
                  <div className="token-allowance-display">
                    ✅ Current allowance: {
                    allowance == MaxUint256 ? 'Unlimited' : safeFormatUnits(allowance, tokenInfo.decimals)
                    } {tokenInfo.symbol}
                  </div>
                ) : (
                  <div className="token-allowance-display">
                    ⚠️ No allowance set - You need to approve before depositing
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount Input - Only shown when in approve or deposit mode */}
          {actionMode !== 'none' && (
            <div className="form-group">
              <label className="form-label" htmlFor="amount">
                {actionMode === 'approve' ? 'Allowance Amount' : 'Deposit Amount'} {tokenInfo?.symbol ? `(${tokenInfo.symbol})` : ''}
              </label>
              <div className="input-group">
                <input
                  id="amount"
                  type="text"
                  value={amount == MaxUint256.toString() ? 'Unlimited' : amount}
                  onChange={handleAmountChange}
                  placeholder={tokenInfo?.isValid ? `Enter ${tokenInfo.symbol} amount` : 'Select a token first'}
                  className="form-input"
                  disabled={!tokenInfo?.isValid || isLoading}
                />
                <div className="input-group-append">
                  {actionMode === 'deposit' ? (
                    <button 
                      type="button" 
                      className="btn-xs primary"
                      onClick={handleSetMaxAmount}
                      disabled={!tokenInfo?.isValid || isLoading}
                    >
                      MAX
                    </button>
                  ) : (
                    <>
                      <button 
                        type="button" 
                        className="btn-xs outline"
                        onClick={handleSetMaxAmount}
                        disabled={!tokenInfo?.isValid || isLoading}
                      >
                        MAX
                      </button>
                      <button 
                        type="button" 
                        className="btn-xs outline"
                        onClick={() => { setAmount(MaxUint256.toString()); setError(''); }}
                        disabled={!tokenInfo?.isValid || isLoading}
                      >
                        Unlimited
                      </button>
                      <button 
                        type="button" 
                        className="btn-xs outline"
                        onClick={() => { setAmount('0'); setError(''); }}
                        disabled={!tokenInfo?.isValid || isLoading}
                      >
                      Zero
                    </button>
                  </>
                )}
              </div>
            </div>
            {tokenInfo?.isValid && (
              <div className="form-help">
                {actionMode === 'deposit' 
                  ? `Minimum deposit: 100M wei (0.0000001 ${tokenInfo.symbol})`
                  : `Set allowance to control how much the contract can spend. Use "Unlimited" for convenience or "Zero" to revoke.`
                }
              </div>
            )}
          </div>
          )}          {/* Error Display */}
        {error && (
          <div className="form-error token-form-error-margin">
            {error}
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-actions">
          {actionMode !== 'none' && (
            <button 
              className="btn-md outline" 
              onClick={() => { setActionMode('none'); setAmount(''); setError(''); }}
              disabled={isLoading}
            >
              Back
            </button>
          )}
          
          <button 
            className="btn-md secondary" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          
          {actionMode === 'none' ? (
            <>
              <button 
                className="btn-md outline" 
                onClick={() => { setActionMode('approve'); setAmount(''); setError(''); }}
                disabled={!tokenInfo?.isValid || isLoading}
              >
                Approve
              </button>
              <button 
                className="btn-md primary" 
                onClick={() => { setActionMode('deposit'); setAmount(''); setError(''); }}
                disabled={!tokenInfo?.isValid || isLoading || allowance === BigInt(0)}
                title={allowance === BigInt(0) ? 'You need to approve before depositing' : ''}
              >
                Deposit
              </button>
            </>
          ) : (
            <button 
              className="btn-md primary" 
              onClick={actionMode === 'approve' ? handleApprove : handleConfirm}
              disabled={!isFormValid() || isLoading || (actionMode === 'approve' && !onApprove)}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  Processing...
                </>
              ) : (
                `Confirm ${actionMode === 'approve' ? 'Approval' : 'Deposit'}`
              )}
            </button>
          )}
        </div>
    </BaseModal>
  );
};export default NewTokenDepositModal;