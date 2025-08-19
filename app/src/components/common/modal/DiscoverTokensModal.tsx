import React, { useState, useEffect } from 'react';
import { usePublicClient, useAccount } from 'wagmi';
import BaseModal from './BaseModal';
import ModalLoading from './ModalLoading';
import { StandardActions } from './ModalActions';
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
  const { address: userAddress } = useAccount();
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
      const spenderAddress = getERC20FlashLenderAddress(31337) || ''; // Default to localhost chain
      
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

          <StandardActions
            onCancel={onClose}
            onConfirm={handleDiscover}
            cancelText="Cancel"
            confirmText="Discover Tokens"
            isLoading={isSearching}
            isConfirmDisabled={!isDiscoverEnabled}
          />
        </>
      ) : (
        <ModalLoading
          title="Discovering Tokens..."
          message={`Scanning blockchain from block ${selectedBlockNumber.toLocaleString()}`}
        />
      )}
    </BaseModal>
  );
}
