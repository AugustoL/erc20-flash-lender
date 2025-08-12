import { useEffect, useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { useFlashLender } from '../../hooks/useFlashLender';
import ERC20FlashLenderABI from '../../contracts/ERC20FlashLender.json';
import ActionModal, { ActionType } from '../common/ActionModal';
import DashboardTableRow from '../common/DashboardTableRow';
import NewTokenDepositModal from '../common/NewTokenDepositModal';
import { useNotifications } from '../../context/NotificationContext';
import { useDashboardRows, useAvailableBalance, useAvailableFees, useStableProvider } from '../../hooks/useDashboardData';

export default function Dashboard() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewTokenModalOpen, setIsNewTokenModalOpen] = useState(false);
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

  const openNewTokenModal = useCallback(() => {
    setIsNewTokenModalOpen(true);
  }, []);

  const closeNewTokenModal = useCallback(() => {
    setIsNewTokenModalOpen(false);
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

  const handleNewTokenDeposit = async (
    tokenAddress: string, 
    amount: string, 
    tokenInfo: { symbol: string; name: string; decimals: number }
  ) => {
    if (!isConnected || !address) {
      addNotification('Please connect your wallet first.', 'warning');
      return;
    }

    setIsTransactionLoading(true);
    
    try {
      const signer = await getSigner();
      
      // Use the existing deposit function
      await hookDeposit(tokenAddress, amount, signer);
      addNotification(`Successfully deposited ${amount} ${tokenInfo.symbol}!`, 'success');
      
      closeNewTokenModal();
      
      // Clear cache and wait a moment for blockchain state to propagate
      clearCache();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      // Refresh data after successful transaction
      await refresh();
    } catch (error) {
      console.error('New token deposit failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addNotification(`Deposit failed: ${errorMessage}`, 'error');
      setIsTransactionLoading(false);
    }
  };

  const handleNewTokenApproval = async (tokenAddress: string, amount: string) => {
    if (!isConnected || !address) {
      addNotification('Please connect your wallet first.', 'warning');
      return;
    }

    setIsTransactionLoading(true);
    
    try {
      const signer = await getSigner();
      
      // Use the existing approve function
      await hookApprove(tokenAddress, amount, signer);
      addNotification(`Successfully approved token for spending!`, 'success');
      
      // Note: We don't close the modal here so user can proceed to deposit
      setIsTransactionLoading(false);
    } catch (error) {
      console.error('Token approval failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addNotification(`Approval failed: ${errorMessage}`, 'error');
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
          <h3>Token Pools</h3>
          <button 
            className="btn-md primary" 
            onClick={openNewTokenModal}
            disabled={!isConnected}
          >
            <span>+</span>
            Deposit Token
          </button>
        </div>
        <div className="table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="center">TVL</th>
                <th className="center">APY</th>
                <th className="center">LP Fee</th>
                <th className="center">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="dashboard-empty-table-cell">
                    {!isConnected 
                      ? "Connect your wallet to view available pools"
                      : "No token pools found. The contract may not have any configured tokens yet."
                    }
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <DashboardTableRow
                    key={row.address}
                    row={row}
                    isConnected={isConnected}
                    address={address}
                  />
                ))
              )}
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

      {/* New Token Deposit Modal */}
      <NewTokenDepositModal
        isOpen={isNewTokenModalOpen}
        onClose={closeNewTokenModal}
        onConfirm={handleNewTokenDeposit}
        onApprove={handleNewTokenApproval}
        isLoading={isTransactionLoading}
        provider={provider}
        userAddress={address}
        existingTokens={pools.map(pool => ({
          address: pool.address,
          symbol: pool.symbol || 'Unknown',
          name: pool.name || 'Unknown Token',
          decimals: pool.decimals || 18
        }))}
      />
    </div>
  );
}
