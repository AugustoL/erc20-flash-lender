import React, { useState, useEffect } from 'react';
import { usePublicClient, useAccount } from 'wagmi';
import BaseModal from './BaseModal';
import { TokenScanService } from '../../../services/TokenScanService';
import { useTokens } from '../../../context/TokensContext';
import { getERC20FlashLenderAddress } from '../../../config';
import '../../../styles/styles.css';

interface DiscoverTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider?: any;
}

export default function DiscoverTokensModal({
  isOpen,
  onClose,
  provider
}: DiscoverTokensModalProps) {
  const [selectedBlockNumber, setSelectedBlockNumber] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const publicClient = usePublicClient();
  const { address: userAddress, chainId } = useAccount();
  const { addToken, hasToken } = useTokens();

  // Get current block number when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSearching(false);
      getCurrentBlockNumber();
    }
  }, [isOpen]);

  // Get current block number
  const getCurrentBlockNumber = async () => {
    if (!provider && !publicClient) return;

    try {
      const current = provider 
        ? await provider.getBlockNumber()
        : await publicClient?.getBlockNumber();
      
      if (current) {
        const blockNum = Number(current);
        setCurrentBlock(blockNum);
        setSelectedBlockNumber(blockNum); // Start at current block
      }
    } catch (error) {
      console.error('Error getting current block number:', error);
    }
  };

  // Handle block number slider change
  const handleBlockChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const blockNumber = parseInt(event.target.value);
    setSelectedBlockNumber(blockNumber);
  };

  // Handle discover button click
  const handleDiscover = async () => {
    if (!selectedBlockNumber || !currentBlock || !userAddress) return;

    setIsSearching(true);

    try {
      // Create TokenScanService instance
      const scanProvider = provider || publicClient;
      if (!scanProvider) {
        console.error('No provider available for scanning');
        return;
      }

      const tokenScanService = new TokenScanService(scanProvider);
      
      // Get the flash lender contract address for allowance checking
      const currentChainId = chainId || 31337; // Default to localhost if no chain
      const spenderAddress = getERC20FlashLenderAddress(currentChainId) || '';
      
      // Scan for tokens and add new ones with positive balance
      await tokenScanService.scanAndAddTokens(
        userAddress,
        selectedBlockNumber,
        spenderAddress,
        addToken,
        hasToken
      );

    } catch (error) {
      console.error('Error scanning for tokens:', error);
    } finally {
      setIsSearching(false);
      onClose(); // Auto-close modal after search completes
    }
  };

  // Check if discover button should be enabled
  const isDiscoverEnabled = selectedBlockNumber && currentBlock && !isSearching;

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Discover Tokens"
      isLoading={isSearching}
      closeOnOverlayClick={!isSearching}
    >
      {!isSearching ? (
        <>
          <p className="form-help">
            Select a block number to search for token transfers from that point in blockchain history.
          </p>
          
          <div className="form-group">
            <label htmlFor="block-slider" className="form-label">
              Select Block Number to Search From:
            </label>
            <div style={{ marginBottom: '12px' }}>
              <input
                id="block-slider"
                type="range"
                min="1"
                max={currentBlock - 10}
                value={selectedBlockNumber}
                onChange={handleBlockChange}
                className="form-input"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginBottom: '8px' }}>
              <span>Block 0</span>
              <span>Block {currentBlock.toLocaleString()}</span>
            </div>
            <div className="form-help" style={{ fontWeight: '500', textAlign: 'center' }}>
              Selected Block: {selectedBlockNumber.toLocaleString()}
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-md outline"
              disabled={isSearching}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDiscover}
              className="btn-md primary"
              disabled={!isDiscoverEnabled || isSearching}
            >
              {isSearching ? 'Processing...' : 'Discover Tokens'}
            </button>
          </div>
        </>
      ) : (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '200px',
          flexDirection: 'column',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color, #e5e7eb)',
              borderTop: '4px solid var(--primary-color, #3b82f6)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px auto'
            }}></div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.125rem' }}>
              Discovering Tokens...
            </h4>
            <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary, #6b7280)' }}>
              Scanning blockchain from block {selectedBlockNumber.toLocaleString()}
            </p>
            <div style={{
              display: 'inline-flex',
              gap: '4px'
            }}>
              <span style={{ 
                animation: 'pulse 1.5s ease-in-out infinite',
                color: 'var(--primary-color, #3b82f6)',
                fontSize: '24px'
              }}>.</span>
              <span style={{ 
                animation: 'pulse 1.5s ease-in-out infinite 0.2s',
                color: 'var(--primary-color, #3b82f6)',
                fontSize: '24px'
              }}>.</span>
              <span style={{ 
                animation: 'pulse 1.5s ease-in-out infinite 0.4s',
                color: 'var(--primary-color, #3b82f6)',
                fontSize: '24px'
              }}>.</span>
            </div>
          </div>
          
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            
            @keyframes pulse {
              0%, 80%, 100% {
                opacity: 0.3;
                transform: scale(0.8);
              }
              40% {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}</style>
        </div>
      )}
    </BaseModal>
  );
}
