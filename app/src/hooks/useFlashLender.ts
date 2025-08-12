import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { FlashLenderDataService } from '../services/FlashLenderDataService';
import { useSettings } from '../context/SettingsContext';
import { getERC20FlashLenderAddress } from '../config';
import ERC20FlashLenderABI from '../contracts/ERC20FlashLender.json';
import {
  UseFlashLenderConfig,
  PoolData,
  UserPosition,
  FlashLoanQuote
} from '../types';

export function useFlashLender({
  provider,
  userAddress,
  autoRefresh = false,
  refreshInterval = 30000,
  cacheTimeout = 60000
}: UseFlashLenderConfig) {
  // Get chain ID from wagmi
  const { chainId } = useAccount();
  
  // Use current chain ID (defaults to localhost if no chain)
  const currentChainId = chainId || 31337;
  
  // Get settings for APY calculation
  const { settings } = useSettings();
  
  // State
  const [pools, setPools] = useState<PoolData[]>([]);
  const [userPositions, setUserPositions] = useState<UserPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Initialize service (with error handling)
  const service = useMemo(() => {
    try {
      const svc = new FlashLenderDataService(currentChainId);
      svc.setCacheTimeout(cacheTimeout);
      return svc;
    } catch (error) {
      console.error('Failed to initialize FlashLenderDataService:', error);
      setError(error as Error);
      return null;
    }
  }, [currentChainId, cacheTimeout]);

  // Format utilities - These are stable and don't need dependencies
  const formatTokenAmount = useCallback((amount: bigint, decimals: number = 18): string => {
    return ethers.formatUnits(amount, decimals);
  }, []);

  const formatWithSymbol = useCallback((amount: string, symbol?: string): string => {
    const num = parseFloat(amount);
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
    return symbol ? `${formatted} ${symbol}` : formatted;
  }, []);

  // Fetch pool data
  const fetchPools = useCallback(async () => {
    if (!service) {
      console.warn('Service not available - contract address not found');
      return;
    }
    
    try {
      const poolsData = await service.getAllTokenPools(userAddress);
      console.log('Raw pool data from service:', poolsData);
      
      // Transform to formatted data
      const formatted: PoolData[] = poolsData.map(pool => {
        const formattedLiq = formatWithSymbol(
          formatTokenAmount(pool.totalLiquidity, pool.decimals || 18),
          pool.symbol
        );

        const poolFormatted: PoolData = {
          address: pool.address,
          totalLiquidity: pool.totalLiquidity.toString(),
          totalShares: pool.totalShares.toString(),
          lpFee: pool.lpFee,
          managementFee: pool.managementFee.toString(),
          symbol: pool.symbol,
          decimals: pool.decimals,
          name: pool.name,
          apy: pool.apy, // Include APY from service calculation
          formattedLiquidity: formattedLiq
        };

        // Add user-specific formatted data if available
        if (pool.userBalance !== undefined && pool.userAllowance !== undefined) {
          const decimals = pool.decimals || 18;
          poolFormatted.userBalance = pool.userBalance.toString();
          poolFormatted.userAllowance = pool.userAllowance.toString();
          poolFormatted.formattedUserBalance = formatWithSymbol(
            formatTokenAmount(pool.userBalance, decimals),
            pool.symbol
          );
          // Check if user needs approval for any potential deposit
          poolFormatted.needsApproval = pool.userAllowance === BigInt(0);
        }
                
        return poolFormatted;
      });
      
      console.log('Formatted pool data with APY:', formatted);
      setPools(formatted);
    } catch (err) {
      console.error('Error fetching pools:', err);
      setError(err as Error);
    }
  }, [service, formatTokenAmount, formatWithSymbol, userAddress]);

  // Helper function to transform user positions data
  const transformUserPositions = useCallback((positions: any[], poolsData: PoolData[]) => {
    return positions.map(pos => {
      // Find matching pool for share percentage calculation
      const pool = poolsData.find(p => p.address === pos.token);
      const sharePercentage = pool && pool.totalShares !== '0'
        ? (Number(pos.shares) * 100) / Number(pool.totalShares)
        : 0;
      
      const decimals = pool?.decimals || 18;
      
      const transformedPosition: UserPosition = {
        token: pos.token,
        deposits: pos.deposits.toString(),
        shares: pos.shares.toString(),
        withdrawable: {
          netAmount: pos.withdrawable.netAmount.toString(),
          grossAmount: pos.withdrawable.grossAmount.toString(),
          principal: pos.withdrawable.principal.toString(),
          fees: pos.withdrawable.fees.toString(),
          exitFee: pos.withdrawable.exitFee.toString()
        },
        voteSelection: pos.voteSelection,
        sharePercentage,
        formattedDeposits: formatWithSymbol(
          formatTokenAmount(pos.deposits, decimals),
          pool?.symbol
        ),
        formattedWithdrawable: formatWithSymbol(
          formatTokenAmount(pos.withdrawable.netAmount, decimals),
          pool?.symbol
        )
      };

      // Add user token data if available
      if (pos.userBalance !== undefined && pos.userAllowance !== undefined) {
        transformedPosition.userBalance = pos.userBalance.toString();
        transformedPosition.userAllowance = pos.userAllowance.toString();
        transformedPosition.formattedUserBalance = formatWithSymbol(
          formatTokenAmount(pos.userBalance, decimals),
          pool?.symbol
        );
        transformedPosition.needsApproval = pos.userAllowance === BigInt(0);
      }

      return transformedPosition;
    });
  }, [formatTokenAmount, formatWithSymbol]);

  // Fetch user positions - standalone version for use in fetchData
  const fetchUserPositionsWithPools = useCallback(async (poolsData: PoolData[]) => {
    if (!userAddress || !service) return;
    
    try {
      const positions = await service.getUserPositions(userAddress);
      const formatted = transformUserPositions(positions, poolsData);
      setUserPositions(formatted);
    } catch (err) {
      console.error('Error fetching user positions:', err);
      setError(err as Error);
    }
  }, [userAddress, service, transformUserPositions]);

  // Fetch user positions - version that uses current pools state
  const fetchUserPositions = useCallback(async () => {
    if (!userAddress || !service) return;
    
    try {
      const positions = await service.getUserPositions(userAddress);
      const formatted = transformUserPositions(positions, pools);
      setUserPositions(formatted);
    } catch (err) {
      console.error('Error fetching user positions:', err);
      setError(err as Error);
    }
  }, [userAddress, service, transformUserPositions, pools]);

  // Main fetch function
  const fetchData = useCallback(async () => {
    if (!service) {
      console.warn('Service not available - contract address not found');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch pools first with user data if connected, using settings for APY calculation
      const poolsData = await service.getAllTokenPools(userAddress, settings.apyCalculationBlocks);
      
      // Transform to formatted data
      const formatted: PoolData[] = poolsData.map(pool => {
        console.log(`Raw pool data from service:`, pool);
        console.log(`Main fetchData - Formatting pool ${pool.symbol}: liquidity=${pool.totalLiquidity.toString()}, decimals=${pool.decimals}, apy=${pool.apy}`);
        
        const formattedLiq = formatWithSymbol(
          formatTokenAmount(pool.totalLiquidity, pool.decimals || 18),
          pool.symbol
        );
        
        console.log(`Main fetchData - Formatted liquidity for ${pool.symbol}: ${formattedLiq}`);
        
        const poolFormatted: PoolData = {
          address: pool.address,
          totalLiquidity: pool.totalLiquidity.toString(),
          totalShares: pool.totalShares.toString(),
          lpFee: pool.lpFee,
          managementFee: pool.managementFee.toString(),
          symbol: pool.symbol,
          decimals: pool.decimals,
          name: pool.name,
          formattedLiquidity: formattedLiq,
          apy: pool.apy
        };

        console.log(`Formatted pool data with APY:`, poolFormatted);
        
        // Add user-specific formatted data if available
        if (pool.userBalance !== undefined && pool.userAllowance !== undefined) {
          const decimals = pool.decimals || 18;
          poolFormatted.userBalance = pool.userBalance.toString();
          poolFormatted.userAllowance = pool.userAllowance.toString();
          poolFormatted.formattedUserBalance = formatWithSymbol(
            formatTokenAmount(pool.userBalance, decimals),
            pool.symbol
          );
          // Check if user needs approval for any potential deposit
          poolFormatted.needsApproval = pool.userAllowance === BigInt(0);
        }
        
        return poolFormatted;
      });
      
      // Update pools state
      setPools(formatted);
      
      // Fetch user positions with the fresh pools data to avoid dependency issues
      if (userAddress) {
        await fetchUserPositionsWithPools(formatted);
      }
      
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [service, formatTokenAmount, formatWithSymbol, userAddress, fetchUserPositionsWithPools, settings.apyCalculationBlocks]);

  // Action functions (these would need signer)
  const approve = useCallback(async (
    tokenAddress: string,
    amount: string,
    signer: ethers.Signer
  ) => {
    const pool = pools.find(p => p.address === tokenAddress);
    
    // Handle infinite approval (MAX_UINT256)
    let amountBigInt: bigint;
    if (amount === ethers.MaxUint256.toString()) {
      amountBigInt = ethers.MaxUint256;
    } else {
      amountBigInt = ethers.parseUnits(amount, pool?.decimals || 18);
    }
    
    if (!service) {
      throw new Error('Service not initialized');
    }
    
    // Get contract address from service
    const contractAddress = getERC20FlashLenderAddress(currentChainId);
    if (!contractAddress) {
      throw new Error(`Contract address not found for chain ${currentChainId}`);
    }
    
    // Create token contract with signer
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function approve(address spender, uint256 amount) returns (bool)'],
      signer
    );
    
    const approveTx = await tokenContract.approve?.(contractAddress, amountBigInt);
    if (!approveTx) {
      throw new Error('Approve function not available on token contract');
    }
    await approveTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [pools, service, currentChainId]);

  const deposit = useCallback(async (
    tokenAddress: string,
    amount: string,
    signer: ethers.Signer
  ) => {
    const pool = pools.find(p => p.address === tokenAddress);
    const amountBigInt = ethers.parseUnits(amount, pool?.decimals || 18);
    
    // Check if approval is needed
    const userAddress = await signer.getAddress();
    const currentAllowance = pool?.userAllowance ? BigInt(pool.userAllowance) : BigInt(0);
    
    if (currentAllowance < amountBigInt) {
      // Auto-approve the required amount
      await approve(tokenAddress, amount, signer);
    }
    
    // Then deposit
    const contractWithSigner = (service as any).contract.connect(signer);
    const depositTx = await contractWithSigner.deposit(tokenAddress, amountBigInt);
    await depositTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service, pools, approve]);

  const withdraw = useCallback(async (
    tokenAddress: string,
    signer: ethers.Signer
  ) => {
    const contractWithSigner = (service as any).contract.connect(signer);
    const withdrawTx = await contractWithSigner.withdraw(tokenAddress);
    await withdrawTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service]);

  const withdrawFees = useCallback(async (
    tokenAddress: string,
    signer: ethers.Signer
  ) => {
    const contractWithSigner = (service as any).contract.connect(signer);
    const withdrawTx = await contractWithSigner.withdrawFees(tokenAddress);
    await withdrawTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service]);

  const voteForLPFee = useCallback(async (
    tokenAddress: string,
    feePercentage: number,
    signer: ethers.Signer
  ) => {
    const contractWithSigner = (service as any).contract.connect(signer);
    // Convert percentage to basis points (e.g., 1.5% = 150 basis points)
    const feeAmountBps = Math.round(feePercentage * 100);
    const voteTx = await contractWithSigner.voteForLPFee(tokenAddress, feeAmountBps);
    await voteTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service]);

  const proposeLPFeeChange = useCallback(async (
    tokenAddress: string,
    newFeeBps: number,
    signer: ethers.Signer
  ) => {
    console.log(`Proposing LP fee change for ${tokenAddress} to ${newFeeBps} bps`);
    const contractWithSigner = (service as any).contract.connect(signer);
    const proposeTx = await contractWithSigner.proposeLPFeeChange(tokenAddress, newFeeBps);
    await proposeTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service]);

  const executeLPFeeChange = useCallback(async (
    tokenAddress: string,
    newFeeBps: number,
    signer: ethers.Signer
  ) => {
    console.log(`Executing LP fee change for ${tokenAddress} to ${newFeeBps} bps`);
    const contractWithSigner = (service as any).contract.connect(signer);
    const executeTx = await contractWithSigner.executeLPFeeChange(tokenAddress, newFeeBps);
    await executeTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service]);

  // Utility function to check if approval is needed
  const checkApprovalNeeded = useCallback((tokenAddress: string, amount: string): boolean => {
    const pool = pools.find(p => p.address === tokenAddress);
    if (!pool || !pool.userAllowance) return true;
    
    const amountBigInt = ethers.parseUnits(amount, pool.decimals || 18);
    const currentAllowance = BigInt(pool.userAllowance);
    
    return currentAllowance < amountBigInt;
  }, [pools]);

  // Utility function to get user's balance for a token
  const getUserBalance = useCallback((tokenAddress: string): string => {
    const pool = pools.find(p => p.address === tokenAddress);
    return pool?.userBalance || '0';
  }, [pools]);

  // Utility function to get user's allowance for a token
  const getUserAllowance = useCallback((tokenAddress: string): string => {
    const pool = pools.find(p => p.address === tokenAddress);
    return pool?.userAllowance || '0';
  }, [pools]);

  // Utility function to determine if user should see approve button
  const shouldShowApproveButton = useCallback((tokenAddress: string, amount?: string): boolean => {
    const pool = pools.find(p => p.address === tokenAddress);
    if (!pool || !pool.userBalance || !pool.userAllowance) return false;
    
    const userBalance = BigInt(pool.userBalance);
    const userAllowance = BigInt(pool.userAllowance);
    
    // User has tokens available but insufficient allowance
    if (amount) {
      const amountBigInt = ethers.parseUnits(amount, pool.decimals || 18);
      return userBalance >= amountBigInt && userAllowance < amountBigInt;
    }
    
    // General case: user has tokens but no/insufficient allowance
    return userBalance > BigInt(0) && userAllowance < userBalance;
  }, [pools]);

  // Utility function to determine if user should see deposit button
  const shouldShowDepositButton = useCallback((tokenAddress: string, amount?: string): boolean => {
    const pool = pools.find(p => p.address === tokenAddress);
    if (!pool || !pool.userBalance || !pool.userAllowance) return false;
    
    const userBalance = BigInt(pool.userBalance);
    const userAllowance = BigInt(pool.userAllowance);
    
    // User has tokens available and sufficient allowance
    if (amount) {
      const amountBigInt = ethers.parseUnits(amount, pool.decimals || 18);
      return userBalance >= amountBigInt && userAllowance >= amountBigInt;
    }
    
    // General case: user has tokens and allowance to deposit
    return userBalance > BigInt(0) && userAllowance > BigInt(0);
  }, [pools]);

  // Utility function to get button state for a token (for UI convenience)
  const getButtonState = useCallback((tokenAddress: string, amount?: string): 'approve' | 'deposit' | 'insufficient' | 'none' => {
    const pool = pools.find(p => p.address === tokenAddress);
    if (!pool || !pool.userBalance || !pool.userAllowance) return 'none';
    
    const userBalance = BigInt(pool.userBalance);
    const userAllowance = BigInt(pool.userAllowance);
    
    if (userBalance === BigInt(0)) return 'insufficient';
    
    if (amount) {
      const amountBigInt = ethers.parseUnits(amount, pool.decimals || 18);
      
      if (userBalance < amountBigInt) return 'insufficient';
      if (userAllowance < amountBigInt) return 'approve';
      return 'deposit';
    }
    
    // General case without specific amount
    if (userAllowance === BigInt(0) || userAllowance < userBalance) return 'approve';
    return 'deposit';
  }, [pools]);

  // Set up event listeners only if we have a user address (indicating wallet connection)
  // DISABLED: Components handle refresh manually with proper cache clearing and timing
  useEffect(() => {
    if (!userAddress) return; // Skip event listeners if no wallet connected
    
    // Event listeners disabled to prevent double refresh - components handle refresh manually
    /*
    const callbacks = {
      onDeposit: () => {
        console.log('Deposit event detected, refreshing...');
        fetchData();
      },
      onWithdraw: () => {
        console.log('Withdraw event detected, refreshing...');
        fetchData();
      },
      onFlashLoan: () => {
        console.log('Flash loan event detected, refreshing...');
        fetchData();
      },
      onFeeChange: () => {
        console.log('Fee change event detected, refreshing...');
        fetchData();
      }
    };
    
    try {
      service.setupEventListeners(callbacks);
    } catch (error) {
      console.warn('Failed to set up event listeners:', error);
      // Don't throw error, just continue without event listeners
    }
    
    // Cleanup function will be needed to remove listeners
    return () => {
      // You'd need to implement removeAllListeners in the service
      // service.removeAllListeners();
    };
    */
  }, [service, fetchData, userAddress]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchData();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  return {
    // Data
    pools,
    userPositions,
    isLoading,
    error,
    lastUpdate,
    
    // Actions
    approve,
    deposit,
    withdraw,
    withdrawFees,
    voteForLPFee,
    proposeLPFeeChange,
    executeLPFeeChange,
    
    // Utilities
    refresh: fetchData,
    clearCache: () => service?.clearCache(),
    checkApprovalNeeded,
    getUserBalance,
    getUserAllowance,
    shouldShowApproveButton,
    shouldShowDepositButton,
    getButtonState
  };
}
