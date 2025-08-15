import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { useFlashLender } from '../../hooks/useFlashLender';
import ActionModal, { ActionType } from '../common/ActionModal';
import DashboardTableRow from '../common/DashboardTableRow';
import NewTokenDepositModal from '../common/NewTokenDepositModal';
import { useNotifications } from '../../context/NotificationContext';
import { useDashboardRows, useAvailableBalance, useAvailableFees, useStableProvider } from '../../hooks/useDashboardData';

export default function Wallet() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType>('deposit');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  // Notifications
  const { addNotification } = useNotifications();

  // Create stable ethers provider from wagmi public client
  const provider = useStableProvider(publicClient?.transport?.url);

  const {
    pools,
    userPositions,
    isLoading,
    error,
    refresh,
    clearCache,
    deposit: hookDeposit,
    withdraw: hookWithdraw,
    withdrawFees: hookWithdrawFees,
    approve: hookApprove,
    shouldShowApproveButton,
    shouldShowDepositButton,
    getButtonState
  } = useFlashLender({
    provider,
    userAddress: address || undefined,
    autoRefresh: false,
    refreshInterval: 30000
  });
  console.log('Dashboard - userPositions:', userPositions);
  console.log('Dashboard - pools:', pools);

  // Transform pools data into table rows format using optimized hook
  const rows = useDashboardRows(pools, userPositions);

  // Wallet and modal handlers
  const getSigner = async () => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected');
    }
    
    // Force MetaMask provider instead of using local RPC
    if (!window.ethereum) {
      throw new Error('MetaMask not installed');
    }
    
    try {
      console.log('🔐 Forcing MetaMask signer (not local RPC)');
      
      // Ensure we're using MetaMask's provider, not the local RPC
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      console.log('✅ MetaMask signer created:', await signer.getAddress());
      return signer;
    } catch (error) {
      console.error('❌ Error creating MetaMask signer:', error);
      throw new Error('Failed to get MetaMask signer');
    }
  };

  // Modal handlers with useCallback optimization
  const openModal = useCallback((action: ActionType, tokenAddress: string) => {
    setCurrentAction(action);
    setSelectedToken(tokenAddress);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setIsTransactionLoading(false);
  }, []);

  const handleModalConfirm = async (amount: string, _feePercentage?: number, withdrawType?: 'all' | 'fees') => {
    if (!isConnected || !address || !selectedToken) {
      addNotification('Please connect your wallet first.', 'warning');
      return;
    }

    setIsTransactionLoading(true);
    
    try {
      const signer = await getSigner();
      const selectedPool = pools.find(pool => pool.address === selectedToken);

      if (currentAction === 'deposit') {
        // Handle deposit transaction
        await hookDeposit(selectedToken, amount, signer);
        addNotification(`Successfully deposited ${amount} ${selectedPool?.symbol}!`, 'success');
      } else if (currentAction === 'approve') {
        // Handle approve transaction
        await hookApprove(selectedToken, amount, signer);
        addNotification(`Successfully approved ${amount} ${selectedPool?.symbol} for spending!`, 'success');
      } else if (currentAction === 'withdraw') {
        // Handle withdraw transaction based on type
        if (withdrawType === 'fees') {
          await hookWithdrawFees(selectedToken, signer);
          addNotification(`Successfully withdrew fees from ${selectedPool?.symbol}!`, 'success');
        } else {
          // Default to full withdrawal
          await hookWithdraw(selectedToken, signer);
          addNotification(`Successfully withdrew ${selectedPool?.symbol}!`, 'success');
        }
      }
      
      closeModal();
      
      // Clear cache and wait a moment for blockchain state to propagate
      clearCache();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      // Refresh data after successful transaction
      await refresh();
    } catch (error) {
      console.error('Transaction failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addNotification(`Transaction failed: ${errorMessage}`, 'error');
      setIsTransactionLoading(false);
    }
  };

  // Get available balance and fees using optimized hooks
  const availableBalance = useAvailableBalance(currentAction, selectedToken, pools, userPositions);
  const availableFees = useAvailableFees(selectedToken, pools, userPositions);

  // Show loading state
  if (isLoading) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head"><h3>Token Pools</h3></div>
          <div className="dashboard-loading-container">
            <div>Loading protocol data...</div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head"><h3>Token Pools</h3></div>
          <div className="dashboard-error-container">
            <div className="dashboard-error-message">
              Error loading data: {error.message}
            </div>
            <button onClick={refresh} className="btn primary">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head-with-button">
          <h3>WALLET TOKENS</h3>
          <button 
            className="btn-md primary" 
            disabled={!isConnected}
          >
            Discover Tokens
          </button>
        </div>
        <div className="table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="center">Type</th>
                <th className="center">Status</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Modal */}
      <ActionModal
        isOpen={isModalOpen}
        onClose={closeModal}
        action={currentAction}
        tokenSymbol={pools.find(p => p.address === selectedToken)?.symbol}
        tokenDecimals={pools.find(p => p.address === selectedToken)?.decimals}
        availableBalance={availableBalance}
        availableFees={availableFees}
        currentVoteFee={0} // Not used for deposit/withdraw
        onConfirm={handleModalConfirm}
        isLoading={isTransactionLoading}
      />
    </div>
  );
}
