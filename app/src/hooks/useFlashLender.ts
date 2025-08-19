import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { FlashLenderDataService } from '../services/FlashLenderDataService';
import { useSettings } from '../context/SettingsContext';
import { useTokens } from '../context';
import { getERC20FlashLenderAddress } from '../config';
import {
  UseFlashLenderConfig,
  PoolData,
  UserPositionData,
} from '../types';

export function useFlashLender({
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
  
  // Get token context
  const { addToken } = useTokens();
  
  // State
  const [pools, setPools] = useState<PoolData[]>([]);
  const [userPositions, setUserPositions] = useState<UserPositionData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Initialize service (with error handling)
  const service = useMemo(() => {
    try {
      const svc = new FlashLenderDataService(currentChainId, addToken);
      svc.setCacheTimeout(cacheTimeout);
      return svc;
    } catch (error) {
      console.error('Failed to initialize FlashLenderDataService:', error);
      setError(error as Error);
      return null;
    }
  }, [currentChainId, cacheTimeout, addToken]);

  // Format utilities - These are stable and don't need dependencies
  const formatTokenAmount = useCallback((amount: bigint, decimals: number = 18): string => {
    return ethers.formatUnits(amount, decimals);
  }, []);

  const formatWithSymbol = useCallback((amount: string, symbol?: string): string => {
    const num = parseFloat(amount);
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    return symbol ? `${formatted} ${symbol}` : formatted;
  }, []);

  // Helper function to transform user positions data
  const transformUserPositions = useCallback((positions: any[], poolsData: PoolData[]) => {
    return positions.map(pos => {
      // Find matching pool for share percentage calculation
      const pool = poolsData.find(p => p.address === pos.address);
      const sharePercentage = pool && pool.totalShares !== BigInt(0)
        ? (Number(pos.shares) * 100) / Number(pool.totalShares)
        : 0;
      
      const decimals = pool?.decimals || 18;
      
      const transformedPosition: UserPositionData = {
        address: pos.address,
        symbol: pool?.symbol || 'Unknown',
        name: pool?.name || 'No name available',
        decimals: pool?.decimals || 18,
        logoUrl: pool?.logoUrl,
        totalLiquidity: pool?.totalLiquidity || BigInt(0),
        totalShares: pool?.totalShares || BigInt(0),
        lpFee: pool?.lpFee || 0,
        managementFee: pool?.managementFee || BigInt(0),
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
        ),
        userAllowance: pos.userAllowance.toString(),
        userBalance: pos.userBalance.toString()
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
      // Fetch pools first with user data if connected
      const poolsData = await service.getAllTokenPools(userAddress);
      
      // Transform to formatted data with APY calculation
      const formatted: PoolData[] = await Promise.all(poolsData.map(async pool => {
        
        const formattedLiq = formatWithSymbol(
          formatTokenAmount(pool.totalLiquidity, pool.decimals || 18),
          pool.symbol
        );
        
        // Calculate APY at the PoolData level
        let apy: number | undefined;
        try {
          const currentBlock = await service.providerInstance.getBlockNumber();
          const fromBlock = Math.max(0, currentBlock - settings.apyCalculationBlocks);
          apy = await service.calculatePoolAPY(pool.address, fromBlock, currentBlock);
        } catch (error) {
          apy = 0; // Default to 0 if calculation fails
        }
        
        const poolFormatted: PoolData = {
          address: pool.address,
          totalLiquidity: pool.totalLiquidity,
          totalShares: pool.totalShares,
          lpFee: pool.lpFee,
          managementFee: pool.managementFee,
          symbol: pool.symbol,
          decimals: pool.decimals,
          name: pool.name,
          formattedLiquidity: formattedLiq,
          apy: apy
        };
        
        return poolFormatted;
      }));
      
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
    const contractWithSigner = (service as any).contract.connect(signer);
    const executeTx = await contractWithSigner.executeLPFeeChange(tokenAddress, newFeeBps);
    await executeTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service]);

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
    clearCache: () => service?.clearCache()
  };
}
