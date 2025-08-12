import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useDebouncedTokenInfo } from '../../hooks/useTokenInfo';
import '../../styles/styles.css';

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
  lenderAddress?: string;
  existingTokens?: TokenOption[];
}

const NewTokenDepositModal: React.FC<NewTokenDepositModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onApprove,
  isLoading = false,
  provider,
  userAddress,
  lenderAddress,
  existingTokens = []
}) => {
  const [tokenAddress, setTokenAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const { tokenInfo, isLoading: isValidatingToken, error: tokenError, validateToken, clearToken } = 
    useDebouncedTokenInfo(provider, 500);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTokenAddress('');
      setAmount('');
      setError('');
      setAllowance(BigInt(0));
      setShowDropdown(false);
      clearToken();
    }
  }, [isOpen, clearToken]);

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

  // Check token allowance when token info is valid
  useEffect(() => {
    const checkAllowance = async () => {
      if (!tokenInfo?.isValid || !userAddress || !lenderAddress || !provider) {
        setAllowance(BigInt(0));
        return;
      }

      setIsCheckingApproval(true);
      try {
        const tokenContract = new ethers.Contract(
          tokenInfo.address,
          ['function allowance(address owner, address spender) view returns (uint256)'],
          provider
        );

        const currentAllowance = await tokenContract.allowance?.(userAddress, lenderAddress) || BigInt(0);
        setAllowance(currentAllowance);
      } catch (error) {
        console.error('Error checking allowance:', error);
        setAllowance(BigInt(0));
      } finally {
        setIsCheckingApproval(false);
      }
    };

    checkAllowance();
  }, [tokenInfo, userAddress, lenderAddress, provider]);

  if (!isOpen) return null;

  const formatBalance = (value: string, decimals: number = 18): string => {
    if (!value || value === '0') return '0';
    try {
      return ethers.formatUnits(value, decimals);
    } catch (error) {
      return '0';
    }
  };

  const parseAmount = (value: string, decimals: number = 18): bigint => {
    if (!value || value.trim() === '') return BigInt(0);
    try {
      return ethers.parseUnits(value.trim(), decimals);
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
    setShowDropdown(false); // Close dropdown when user starts typing
  };

  const handleTokenSelect = (selectedToken: TokenOption) => {
    setTokenAddress(selectedToken.address);
    setError('');
    setAllowance(BigInt(0));
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
    // For new tokens, we can't determine max balance easily
    // This is a placeholder - in a real app you'd query user's token balance
    setAmount('1000');
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
      !isCheckingApproval
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {existingTokens.length > 0 ? 'Deposit Token' : 'Add New Token'}
          </h3>
          <button className="modal-close" onClick={onClose} disabled={isLoading}>
            ×
          </button>
        </div>
        
        <div className="modal-body">
          <p className="form-help" style={{ marginBottom: '20px' }}>
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
                    style={{ 
                      transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
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
          </div>

          {/* Amount Input - Only enabled when token is valid */}
          <div className="form-group">
            <label className="form-label" htmlFor="amount">
              Amount {tokenInfo?.symbol ? `(${tokenInfo.symbol})` : ''}
            </label>
            <div className="input-group">
              <input
                id="amount"
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder={tokenInfo?.isValid ? `Enter ${tokenInfo.symbol} amount` : 'Select a token first'}
                className="form-input"
                disabled={!tokenInfo?.isValid || isLoading}
              />
              <div className="input-group-append">
                <button 
                  type="button" 
                  className="btn-xs primary"
                  onClick={handleSetMaxAmount}
                  disabled={!tokenInfo?.isValid || isLoading}
                >
                  MAX
                </button>
              </div>
            </div>
            {tokenInfo?.isValid && (
              <div className="form-help">
                Minimum deposit: 100M wei (0.0000001 {tokenInfo.symbol})
                {allowance > BigInt(0) && (
                  <div style={{ marginTop: '4px', color: '#10b981' }}>
                    ✅ Current allowance: {ethers.formatUnits(allowance, tokenInfo.decimals)} {tokenInfo.symbol}
                  </div>
                )}
                {isCheckingApproval && (
                  <div style={{ marginTop: '4px', color: '#6b7280' }}>
                    🔄 Checking approval status...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="form-error" style={{ marginTop: '12px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="btn-md secondary" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          
          {needsApproval() ? (
            <button 
              className="btn-md primary" 
              onClick={handleApprove}
              disabled={!isFormValid() || isLoading || !onApprove}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  Processing...
                </>
              ) : (
                `Approve ${tokenInfo?.symbol || 'Token'}`
              )}
            </button>
          ) : (
            <button 
              className="btn-md primary" 
              onClick={handleConfirm}
              disabled={!isFormValid() || isLoading}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  Processing...
                </>
              ) : (
                `Deposit ${tokenInfo?.symbol || 'Token'}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewTokenDepositModal;