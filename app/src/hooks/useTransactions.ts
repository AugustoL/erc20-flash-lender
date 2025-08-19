import { useCallback } from 'react';
import { useFlashLender } from './useFlashLender';
import { useNotifications } from '../context/NotificationContext';
import { useWalletUtils } from './useWalletUtils';
import type { ActionType } from '../components/common/modal';

/**
 * Shared transaction handlers hook
 * Consolidates transaction logic across components
 */
export const useTransactions = () => {
  const { provider, getSigner, isConnected, address } = useWalletUtils();
  const { addNotification } = useNotifications();
  
  const {
    pools,
    refresh,
    clearCache,
    deposit: hookDeposit,
    withdraw: hookWithdraw,
    withdrawFees: hookWithdrawFees,
    approve: hookApprove,
    voteForLPFee: hookVoteForLPFee
  } = useFlashLender({
    provider,
    userAddress: address || undefined,
    autoRefresh: false,
    refreshInterval: 30000
  });

  const executeTransaction = useCallback(async (
    action: ActionType,
    tokenAddress: string,
    amount?: string,
    feePercentage?: number,
    withdrawType?: 'all' | 'fees',
    tokenSymbol?: string
  ) => {
    if (!isConnected || !address) {
      addNotification('Please connect your wallet first.', 'warning');
      throw new Error('Wallet not connected');
    }

    const signer = await getSigner();
    const selectedPool = pools.find(pool => pool.address === tokenAddress);
    
    try {
      switch (action) {
        case 'approve':
          if (!amount) throw new Error('Amount is required for approval');
          await hookApprove(tokenAddress, amount, signer);
          addNotification(`Successfully approved ${amount} ${tokenSymbol || selectedPool?.symbol} for spending!`, 'success');
          break;
          
        case 'deposit':
          if (!amount) throw new Error('Amount is required for deposit');
          await hookDeposit(tokenAddress, amount, signer);
          addNotification(`Successfully deposited ${amount} ${tokenSymbol || selectedPool?.symbol}!`, 'success');
          break;
          
        case 'withdraw':
          if (withdrawType === 'fees') {
            await hookWithdrawFees(tokenAddress, signer);
            addNotification(`Successfully withdrew fees from ${tokenSymbol || selectedPool?.symbol}!`, 'success');
          } else {
            await hookWithdraw(tokenAddress, signer);
            addNotification(`Successfully withdrew ${tokenSymbol || selectedPool?.symbol}!`, 'success');
          }
          break;
          
        case 'vote':
          if (feePercentage === undefined) throw new Error('Fee percentage is required for voting');
          await hookVoteForLPFee(tokenAddress, feePercentage, signer);
          addNotification(`Vote submitted for ${feePercentage}% fee!`, 'success');
          break;
          
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
      // Clear cache and wait for blockchain state to propagate
      clearCache();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh data after successful transaction
      await refresh();
      
    } catch (error) {
      console.error('Transaction failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addNotification(`Transaction failed: ${errorMessage}`, 'error');
      throw error;
    }
  }, [isConnected, address, getSigner, pools, hookApprove, hookDeposit, hookWithdraw, hookWithdrawFees, hookVoteForLPFee, addNotification, clearCache, refresh]);

  const executeNewTokenTransaction = useCallback(async (
    action: 'deposit' | 'approve',
    tokenAddress: string,
    amount: string,
    tokenInfo: { symbol: string; name: string; decimals: number }
  ) => {
    if (!isConnected || !address) {
      addNotification('Please connect your wallet first.', 'warning');
      throw new Error('Wallet not connected');
    }

    const signer = await getSigner();
    
    try {
      if (action === 'deposit') {
        await hookDeposit(tokenAddress, amount, signer);
        addNotification(`Successfully deposited ${amount} ${tokenInfo.symbol}!`, 'success');
      } else if (action === 'approve') {
        await hookApprove(tokenAddress, amount, signer);
        addNotification(`Successfully approved token for spending!`, 'success');
        return; // Don't refresh for approval - user still needs to deposit
      }
      
      // Clear cache and wait for blockchain state to propagate
      clearCache();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh data after successful transaction
      await refresh();
      
    } catch (error) {
      console.error('Transaction failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addNotification(`${action === 'deposit' ? 'Deposit' : 'Approval'} failed: ${errorMessage}`, 'error');
      throw error;
    }
  }, [isConnected, address, getSigner, hookDeposit, hookApprove, addNotification, clearCache, refresh]);

  return {
    executeTransaction,
    executeNewTokenTransaction,
    pools
  };
};