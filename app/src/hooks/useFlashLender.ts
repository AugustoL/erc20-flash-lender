import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { FlashLenderDataService } from '../services/FlashLenderDataService';
import { useSettings } from '../context/SettingsContext';
import { useTokens } from '../context';
import { getERC20FlashLenderAddress, getContractAddress } from '../config';
import { MINIMUM_FRACTION_DIGITS, MAXIMUM_FRACTION_DIGITS } from '../utils/constants';
import { safeFormatUnits, safeParseUnits } from '../utils/helpers';
import {
  UseFlashLenderConfig,
  PoolData,
  UserPositionData,
  UserAction,
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
  
  // Don't default to localhost - wait for proper chain ID
  const currentChainId = chainId;
  
  // Get settings for APY calculation
  const { settings } = useSettings();
  
  // Get token context
  const { addToken } = useTokens();
  
  // State
  const [pools, setPools] = useState<PoolData[]>([]);
  const [userPositions, setUserPositions] = useState<UserPositionData[]>([]);
  // Action lists for a selected pool (moved from components)
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [poolActions, setPoolActions] = useState<UserAction[]>([]);
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Initialize service (with error handling)
  const service = useMemo(() => {
    // Don't initialize service if chainId is undefined
    if (!currentChainId) {
      return null;
    }
    
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
    return safeFormatUnits(amount, decimals);
  }, []);

  const formatWithSymbol = useCallback((amount: string, symbol?: string): string => {
    const num = parseFloat(amount);
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: MINIMUM_FRACTION_DIGITS,
      maximumFractionDigits: MAXIMUM_FRACTION_DIGITS
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
        poolBalance: pool?.poolBalance || BigInt(0),
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

  // Load recent actions (deposits/withdrawals/flashloans/votes) for a single token
  const loadActions = useCallback(async (tokenAddress: string) => {
    if (!tokenAddress || !service) return;
    setIsLoadingActions(true);
    try {
      const providerInstance = provider || (service as any).providerInstance;
      const currentBlock = await providerInstance.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 5000);

      const [userActionsData, poolData] = await Promise.all([
        userAddress ? service.getUserActions(tokenAddress, userAddress, fromBlock) : Promise.resolve([]),
        service.getPoolStatistics(tokenAddress, fromBlock)
      ]);

      setUserActions(userActionsData || []);
      setPoolActions((poolData && poolData.poolUsersActions) ? poolData.poolUsersActions.slice(0, 20) : []);
    } catch (err) {
      console.error('Error loading actions for token', tokenAddress, err);
    } finally {
      setIsLoadingActions(false);
    }
  }, [service, userAddress, provider]);

  // Main fetch function
  const fetchData = useCallback(async () => {
    if (!currentChainId) {
      // Chain ID not available yet - keep loading state
      setIsLoading(true);
      return;
    }
    
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
          formatTokenAmount(pool.poolBalance, pool.decimals || 18),
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
          poolBalance: pool.poolBalance,
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
    if (!currentChainId) {
      throw new Error('Chain ID not available');
    }
    
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
    signer: ethers.Signer,
    tokenDecimals?: number
  ) => {
    const pool = pools.find(p => p.address === tokenAddress);
    
    // Use provided decimals, then pool decimals, then fetch from token contract
    let decimals = tokenDecimals || pool?.decimals;
    
    if (!decimals) {
      // For new tokens, fetch decimals from the contract
      try {
        const tokenMetadata = await (service as any).getTokenMetadata(tokenAddress);
        decimals = tokenMetadata.decimals;
      } catch (error) {
        console.warn(`Failed to fetch decimals for ${tokenAddress}, using 18:`, error);
        decimals = 18;
      }
    }
    
    const amountBigInt = safeParseUnits(amount, decimals);
    const userAddress = await signer.getAddress();
    // Check if approval is needed
    const [, userAllowance] = await (service as any).getUserTokenData(tokenAddress, userAddress);

    if (userAllowance < amountBigInt) {
      // Auto-approve the required amount
      await approve(tokenAddress, amount, signer);
    }
    // Then deposit
    const contractWithSigner = (service as any).contract.connect(signer);
    const depositTx = await contractWithSigner.deposit(tokenAddress, amountBigInt);
    await depositTx.wait();
    
    // Note: Components should handle refresh with cache clearing and delay
  }, [service, pools, approve]);

  const testLoan = useCallback(async (
    tokenAddress: string,
    amount: string,
    useExecutorfactory: boolean = false,
    signer: ethers.Signer,
  ) => {
    if (!service) throw new Error('Service not initialized');
    if (!currentChainId) throw new Error('Chain ID not available');
    console.log('Starting test loan...');

    // Resolve addresses
    const flashLoanTester = getContractAddress('FlashLoanTester', currentChainId);
    if (!flashLoanTester) throw new Error(`flashLoanTester address not found for chain ${currentChainId}`);
    const lenderAddress = getERC20FlashLenderAddress(currentChainId);
    if (!lenderAddress) throw new Error(`FlashLender address not found for chain ${currentChainId}`);
    const factoryAddress = getContractAddress('ERC20FlashLoanExecutorFactory', currentChainId);
    if (!factoryAddress) throw new Error(`ExecutorFactory address not found for chain ${currentChainId}`);

    // Determine token decimals
    let decimals: number | undefined;
    try {
      const meta = await (service as any).getTokenMetadata(tokenAddress);
      decimals = meta.decimals;
    } catch {
      decimals = pools.find(p => p.address === tokenAddress)?.decimals || 18;
    }

    const amountBigInt = safeParseUnits(amount, decimals || 18);

    // Read current fee params from lender
    const lenderReader = new ethers.Contract(
      lenderAddress,
      [
        'function getEffectiveLPFee(address token) view returns (uint256)'
      ],
      (service as any).providerInstance
    );

    const [lpFeeBps] = await Promise.all([
      (lenderReader as any).getEffectiveLPFee(tokenAddress) as Promise<bigint>,
    ]);

    // Compute fees using on-chain formula
    const lpFeeAmount = (amountBigInt * BigInt(lpFeeBps)) / BigInt(10000);

    // Amount to fetch from user wallet via transferFrom (executor will be spender)
    const finalLoanAmount = amountBigInt + lpFeeAmount;

    // get balance of flash loan tester before loan
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address owner) view returns (uint256)'],
      (service as any).providerInstance
    );
    const balanceBefore: bigint = (await tokenContract.balanceOf?.(flashLoanTester)) ?? BigInt(0);
    console.log(`FlashLoanTester balance before loan: ${balanceBefore}`);
    console.log(`Balance needed: ${lpFeeAmount}`);

    if (useExecutorfactory) {

      // Build operations for executor: repay principal and pull fees+extra from user to lender
      const operationsInterface = new ethers.Interface([
        'function transfer(address to, uint256 value) returns (bool)',
        'function sendTokensToLender(address token, uint256 amount)',
      ]);
      const operations = [
        {
          target: tokenAddress,
          value: 0,
          data: operationsInterface.encodeFunctionData('transfer', [flashLoanTester, amountBigInt])
        },
        {
          target: flashLoanTester,
          value: 0,
          data: operationsInterface.encodeFunctionData('sendTokensToLender', [tokenAddress, finalLoanAmount])
        }
      ];

      console.log(operations);

      // Prepare factory
      const factoryAbi = [
        'function createAndExecuteFlashLoan(address token, uint256 amount, (address target, bytes data, uint256 value)[] operations) returns (address)',
      ];

      // Execute createAndExecute in a single tx now that approval is set
      const factoryWithSigner = new ethers.Contract(factoryAddress, factoryAbi, signer);

      const tx = await (factoryWithSigner as any).createAndExecuteFlashLoan(tokenAddress, amountBigInt, operations, {
        gasLimit: 6_000_000
      });

      console.log(tx);
      await tx.wait();
      console.log(tx);
    } else  {
      // Prepare tester
      const publicTesterAbi = [
        'function executeTestFlashLoan(address token, uint256 amount)',
      ];

      // Execute executeTestFlashLoan in a single tx
      const testerWithSigner = new ethers.Contract(flashLoanTester, publicTesterAbi, signer);

      const tx = await (testerWithSigner as any).executeTestFlashLoan(tokenAddress, amountBigInt, {
        gasLimit: 6_000_000
      });
      console.log(tx);
      await tx.wait();
      console.log(tx);
    }
  }, [service, currentChainId, pools]);  

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

  // Wire contract event listeners to automatically refresh on on-chain events
  useEffect(() => {
    if (!service) return;

    const callbacks = {
      onDeposit: (user: string, token: string) => {
        try {
          service.clearCache();
        } catch (e) {}
        fetchData().catch(err => console.warn('fetchData failed after Deposit event:', err));
      },
      onWithdraw: (user: string, token: string) => {
        try {
          service.clearCache();
        } catch (e) {}
        fetchData().catch(err => console.warn('fetchData failed after Withdraw event:', err));
      },
      onFlashLoan: (borrower: string, token: string) => {
        try {
          service.clearCache();
        } catch (e) {}
        fetchData().catch(err => console.warn('fetchData failed after FlashLoan event:', err));
      },
      onFeeChange: (token: string) => {
        try {
          service.clearCache();
        } catch (e) {}
        fetchData().catch(err => console.warn('fetchData failed after FeeChange event:', err));
      }
    };

    try {
      service.setupEventListeners(callbacks as any);
    } catch (err) {
      console.warn('Failed to setup event listeners:', err);
    }

    return () => {
      try {
        (service as any).removeEventListeners && (service as any).removeEventListeners();
      } catch (err) {
        // ignore
      }
    };
  }, [service, fetchData]);

  return {
    // Data
    pools,
    userPositions,
    userActions,
    poolActions,
    isLoading,
    isLoadingActions,
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
    testLoan,
    
    // Utilities
    refresh: fetchData,
    clearCache: () => service?.clearCache(),
    // Actions loader
    loadActions,
  };
}
