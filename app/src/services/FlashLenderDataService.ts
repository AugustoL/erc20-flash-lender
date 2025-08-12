// @ts-nocheck
import { ethers } from 'ethers';
import { Contract } from 'ethers';
import { getERC20FlashLenderAddress } from '../config';
import ERC20FlashLenderABI from '../contracts/ERC20FlashLender.json';
import {
  TokenPoolData,
  UserPositionData,
  ProposalData,
  UserAction,
  FlashLoanAction,
  VoteAction,
  FeeProposalAction,
  FeeExecutionAction
} from '../types';

export class FlashLenderDataService {
  private provider: ethers.Provider;
  private contract: Contract;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout = 10000; // 10 seconds cache
  private contractAddress: string;
  
  constructor(chainId?: number) {
    // Create provider from current environment
    this.provider = this.createProvider();
    
    // Get contract address for the current chain
    const currentChainId = chainId || 31337; // Default to localhost
    const contractAddress = getERC20FlashLenderAddress(currentChainId);
    
    if (!contractAddress) {
      throw new Error(`No contract address found for chain ${currentChainId}`);
    }
    
    this.contractAddress = contractAddress;
    this.contract = new Contract(contractAddress, ERC20FlashLenderABI.abi, this.provider);
  }
  
  /**
   * Create an ethers provider from the current environment
   */
  private createProvider(): ethers.Provider {
    // Try to use window.ethereum if available (browser environment)
    if (typeof window !== 'undefined' && window.ethereum) {
      return new ethers.BrowserProvider(window.ethereum);
    }
    
    // For development, try different localhost URLs
    const rpcUrls = [
      'http://localhost:8545',
      'http://127.0.0.1:8545',
    ];
    
    // Try each URL and return the first working one
    for (const url of rpcUrls) {
      try {
        return new ethers.JsonRpcProvider(url);
      } catch (error) {
        console.warn(`Failed to connect to ${url}:`, error);
      }
    }
    
    // Fallback to default localhost
    return new ethers.JsonRpcProvider('http://localhost:8545');
  }
  
  /**
   * Update the service for a different chain
   */
  updateChain(chainId: number) {
    const contractAddress = getERC20FlashLenderAddress(chainId);
    if (!contractAddress) {
      throw new Error(`No contract address found for chain ${chainId}`);
    }
    
    this.contractAddress = contractAddress;
    this.contract = new Contract(contractAddress, ERC20FlashLenderABI.abi, this.provider);
    this.clearCache(); // Clear cache when changing chains
  }

  // ==================== BATCHED DATA FETCHING ====================
  
  /**
   * Get all token pools with their data, optionally enriched with user-specific data
   */
  async getAllTokenPools(userAddress?: string, apyCalculationBlocks: number = 1000): Promise<TokenPoolData[]> {
    const cacheKey = userAddress ? `pools_all_${userAddress}` : 'pools_all';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Fetch deposited tokens directly from contract
      const tokenAddresses = await this.contract.getDepositedTokens();
      
      if (tokenAddresses.length === 0) {
        return [];
      }

      const pools: TokenPoolData[] = [];
      
      // Make individual calls for each token (simpler and more reliable)
      for (const token of tokenAddresses) {
        try {
          const [totalLiquidity, totalShares, lpFee, managementFee] = await Promise.all([
            this.contract.totalLiquidity(token),
            this.contract.totalShares(token),
            this.contract.getEffectiveLPFee(token),
            this.contract.collectedManagementFees(token)
          ]);
          
          const poolData: TokenPoolData = {
            address: token,
            totalLiquidity,
            totalShares,
            lpFee: Number(lpFee),
            managementFee
          };

          // Calculate APY based on recent activity (configurable block range)
          try {
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - apyCalculationBlocks);
            const apy = await this.calculatePoolAPY(token, fromBlock, currentBlock);
            console.log(`APY calculated for token ${token} using ${apyCalculationBlocks} blocks:`, apy);
            poolData.apy = apy;
          } catch (error) {
            console.warn(`Failed to calculate APY for token ${token}:`, error);
            poolData.apy = 0; // Default to 0 if calculation fails
          }

          // Add user-specific data if userAddress provided
          if (userAddress) {
            const [userBalance, userAllowance] = await this.getUserTokenData(token, userAddress);
            poolData.userBalance = userBalance;
            poolData.userAllowance = userAllowance;
          }
          
          pools.push(poolData);
        } catch (error) {
          console.warn(`Failed to fetch data for token ${token}:`, error);
          // Add empty entry so we still show something
          const poolData: TokenPoolData = {
            address: token,
            totalLiquidity: BigInt(0),
            totalShares: BigInt(0),
            lpFee: 0,
            managementFee: BigInt(0)
          };

          if (userAddress) {
            poolData.userBalance = BigInt(0);
            poolData.userAllowance = BigInt(0);
          }

          pools.push(poolData);
        }
      }
      
      // Optionally fetch token metadata
      await this.enrichWithTokenMetadata(pools);
      
      this.setCache(cacheKey, pools);
      return pools;
    } catch (error) {
      console.error('Failed to fetch token pools:', error);
      return [];
    }
  }

  /**
   * Get all user positions - automatically fetches user's deposited tokens from contract
   */
  async getUserPositions(userAddress: string): Promise<UserPositionData[]> {
    const cacheKey = `user_${userAddress}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Fetch user's deposited tokens directly from contract
      const tokenAddresses = await this.contract.getUserDepositedTokens(userAddress);
      
      if (tokenAddresses.length === 0) {
        return [];
      }

      const positions: UserPositionData[] = [];
      
      // Make individual calls for each token
      for (const token of tokenAddresses) {
        try {
        const [deposits, shares, withdrawable, voteSelection] = await Promise.all([
          this.contract.deposits(token, userAddress),
          this.contract.shares(token, userAddress),
          this.contract.getWithdrawableAmount(token, userAddress),
          this.contract.lpFeeAmountSelected(token, userAddress)
        ]);
        
        // Get user's balance and allowance for this token
        const [userBalance, userAllowance] = await this.getUserTokenData(token, userAddress);
        
        positions.push({
          token,
          deposits,
          shares,
          withdrawable: {
            netAmount: withdrawable[0],
            grossAmount: withdrawable[1],
            principal: withdrawable[2],
            fees: withdrawable[3],
            exitFee: withdrawable[4]
          },
          voteSelection: Number(voteSelection),
          userBalance,
          userAllowance
        });
      } catch (error) {
        console.warn(`Failed to fetch user data for token ${token}:`, error);
        // Add empty entry
        positions.push({
          token,
          deposits: BigInt(0),
          shares: BigInt(0),
          withdrawable: {
            netAmount: BigInt(0),
            grossAmount: BigInt(0),
            principal: BigInt(0),
            fees: BigInt(0),
            exitFee: BigInt(0)
          },
          voteSelection: 0,
          userBalance: BigInt(0),
          userAllowance: BigInt(0)
        });
      }
    }
    
    this.setCache(cacheKey, positions);
    return positions;
  } catch (error) {
    console.error('Failed to fetch user positions:', error);
    return [];
  }
}

  /**
   * Get governance data (votes and proposals) - automatically fetches deposited tokens from contract
   */
  async getGovernanceData(feeOptions: number[] = [1, 25, 50, 100]) {
    try {
      // Fetch deposited tokens directly from contract
      const tokenAddresses = await this.contract.getDepositedTokens();
      
      if (tokenAddresses.length === 0) {
        return new Map();
      }

      // Get current block first
      const currentBlock = await this.provider.getBlockNumber();
      
      // Parse results into structured data
      const governanceData = new Map<string, any>();
      
      for (const token of tokenAddresses) {
        try {
          // Get current fee
          const currentFee = Number(await this.contract.getEffectiveLPFee(token));
          
          const voteData = [];
          const proposals = [];
          
          // Get vote counts and proposals for each fee option
          for (const fee of feeOptions) {
            try {
              const [votes, executionBlock] = await Promise.all([
                this.contract.lpFeeSharesTotalVotes(token, fee),
                this.contract.proposedFeeChanges(token, fee)
            ]);
            
            voteData.push({ fee, votes });
            
            if (executionBlock > BigInt(0)) {
              proposals.push({
                token,
                feeAmount: fee,
                executionBlock,
                currentBlock: BigInt(currentBlock),
                canExecute: BigInt(currentBlock) >= executionBlock
              });
            }
          } catch (error) {
            console.warn(`Failed to fetch governance data for ${token} fee ${fee}:`, error);
            voteData.push({ fee, votes: BigInt(0) });
          }
        }
        
        governanceData.set(token, {
          currentFee,
          voteData,
          proposals
        });
      } catch (error) {
        console.warn(`Failed to fetch governance data for token ${token}:`, error);
        governanceData.set(token, {
          currentFee: 25, // default
          voteData: feeOptions.map(fee => ({ fee, votes: BigInt(0) })),
          proposals: []
        });
      }
    }
    
    return governanceData;
  } catch (error) {
    console.error('Failed to fetch governance data:', error);
    return new Map();
  }
}

  // ==================== EVENT LISTENING ====================
  
  /**
   * Set up event listeners for real-time updates
   */
  setupEventListeners(callbacks: {
    onDeposit?: (user: string, token: string, amount: bigint, shares: bigint) => void;
    onWithdraw?: (user: string, token: string, principal: bigint, fees: bigint) => void;
    onFlashLoan?: (borrower: string, token: string, amount: bigint, fee: bigint) => void;
    onFeeChange?: (token: string, oldFee: number, newFee: number) => void;
  }) {
    // Deposit events
    if (callbacks.onDeposit) {
      this.contract.on('Deposit', (user, token, amount, shares) => {
        this.invalidateCache(`pools_`); // Invalidate pool cache
        this.invalidateCache(`user_${user}_`); // Invalidate user cache
        callbacks.onDeposit!(user, token, amount, shares);
      });
    }
    
    // Withdraw events
    if (callbacks.onWithdraw) {
      this.contract.on('Withdraw', (user, token, principal, fees) => {
        this.invalidateCache(`pools_`);
        this.invalidateCache(`user_${user}_`);
        callbacks.onWithdraw!(user, token, principal, fees);
      });
    }
    
    // Flash loan events
    if (callbacks.onFlashLoan) {
      this.contract.on('FlashLoan', (borrower, token, amount, fee) => {
        this.invalidateCache(`pools_`); // Pool liquidity changed
        callbacks.onFlashLoan!(borrower, token, amount, fee);
      });
    }
    
    // Fee change events
    if (callbacks.onFeeChange) {
      this.contract.on('LPFeeChangeExecuted', (token, oldFee, newFee) => {
        this.invalidateCache(`pools_`);
        callbacks.onFeeChange!(token, Number(oldFee), Number(newFee));
      });
    }
  }

  // ==================== HELPER METHODS ====================
  
  /**
   * Get user's balance and allowance for a specific token
   */
  private async getUserTokenData(tokenAddress: string, userAddress: string): Promise<[bigint, bigint]> {
    const ERC20_ABI = [
      'function balanceOf(address owner) view returns (uint256)',
      'function allowance(address owner, address spender) view returns (uint256)'
    ];
    
    try {
      const tokenContract = new Contract(tokenAddress, ERC20_ABI, this.provider);
      
      const [balance, allowance] = await Promise.all([
        tokenContract.balanceOf(userAddress),
        tokenContract.allowance(userAddress, this.contractAddress)
      ]);
      
      return [balance, allowance];
    } catch (error) {
      console.warn(`Failed to fetch user token data for ${tokenAddress}:`, error);
      return [BigInt(0), BigInt(0)];
    }
  }
  
  /**
   * Enrich pool data with token metadata
   */
  private async enrichWithTokenMetadata(pools: TokenPoolData[]) {
    const ERC20_ABI = [
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function name() view returns (string)'
    ];
    
    for (const pool of pools) {
      try {
        const tokenContract = new Contract(pool.address, ERC20_ABI, this.provider);
        
        const [symbol, decimals, name] = await Promise.all([
          tokenContract.symbol().catch(() => 'UNKNOWN'),
          tokenContract.decimals().catch(() => 18),
          tokenContract.name().catch(() => 'Unknown Token')
        ]);
        
        pool.symbol = symbol;
        pool.decimals = decimals;
        pool.name = name;
      } catch (error) {
        console.warn(`Failed to fetch metadata for token ${pool.address}:`, error);
        pool.symbol = 'UNKNOWN';
        pool.decimals = 18;
        pool.name = 'Unknown Token';
      }
    }
  }

  /**
   * Calculate APY for a token pool based on recent flash loan activity
   * Requires historical data or event logs
   */
  async calculatePoolAPY(
    token: string,
    fromBlock: number,
    toBlock: number
  ): Promise<number> {
    // Get flash loan events for fee calculation
    const filter = this.contract.filters.FlashLoan(null, token);
    const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
    
    // Sum up all fees collected
    let totalFees = BigInt(0);
    for (const event of events) {
      if ('args' in event && event.args) {
        totalFees += event.args[3]; // fee is the 4th argument
      }
    }
    
    // Get average liquidity (simplified - you might want to track this more precisely)
    const currentLiquidity = await this.contract.totalLiquidity(token);
    
    // Calculate blocks elapsed
    const blocksElapsed = toBlock - fromBlock;
    const blocksPerYear = 2628000; // Approximate for 12 second blocks
    
    // Calculate APY - need minimum activity to get meaningful results
    if (currentLiquidity > BigInt(0) && blocksElapsed > 0) {
      // Only calculate if we have meaningful time period and fees
      if (blocksElapsed < 100) {
        // Too few blocks for reliable APY calculation
        return 0;
      }
      
      const annualizedFees = (totalFees * BigInt(10000)) / BigInt(blocksElapsed);
      const apy = Number((annualizedFees * BigInt(blocksPerYear)) / currentLiquidity) / 100; // Convert to percentage
      
      // Cap APY at reasonable maximum to handle edge cases
      return Math.min(apy, 10000); // Max 10,000% APY
    }
    
    return 0;
  }

  /**
   * Get user actions (deposits, withdrawals, flash loans, votes) for a specific token
   */
  async getUserActions(token: string, user?: string, fromBlock: number = 0): Promise<UserAction[]> {
    try {
      const toBlock = await this.provider.getBlockNumber();
      const actions: UserAction[] = [];

      // Define event filters
      const depositFilter = this.contract.filters.Deposit(user || null, token);
      const withdrawFilter = this.contract.filters.Withdraw(user || null, token);
      const flashLoanFilter = this.contract.filters.FlashLoan(null, token);
      const voteFilter = this.contract.filters.LPFeeVoteCast(token, user || null);
      const proposalFilter = this.contract.filters.LPFeeChangeProposed(token);
      const executionFilter = this.contract.filters.LPFeeChangeExecuted(token);

      // Fetch events in parallel
      const [depositEvents, withdrawEvents, flashLoanEvents, voteEvents, proposalEvents, executionEvents] = await Promise.all([
        this.contract.queryFilter(depositFilter, fromBlock, toBlock),
        this.contract.queryFilter(withdrawFilter, fromBlock, toBlock),
        this.contract.queryFilter(flashLoanFilter, fromBlock, toBlock),
        this.contract.queryFilter(voteFilter, fromBlock, toBlock),
        this.contract.queryFilter(proposalFilter, fromBlock, toBlock),
        this.contract.queryFilter(executionFilter, fromBlock, toBlock)
      ]);

      console.log(`Found events for token ${token}:`, {
        deposits: depositEvents.length,
        withdraws: withdrawEvents.length,
        flashLoans: flashLoanEvents.length,
        votes: voteEvents.length,
        proposals: proposalEvents.length,
        executions: executionEvents.length,
        blockRange: `${fromBlock}-${toBlock}`,
        userFilter: user || 'all users'
      });

      // Process deposit events
      for (const event of depositEvents) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          actions.push({
            type: 'deposit',
            user: event.args.user,
            token: event.args.token,
            amount: event.args.amount.toString(),
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          });
        }
      }

      // Process withdraw events
      for (const event of withdrawEvents) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          actions.push({
            type: 'withdraw',
            user: event.args.user,
            token: event.args.token,
            amount: event.args.principal.toString(), // principal amount
            fee: event.args.fees?.toString(), // fees amount
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          });
        }
      }

      // Process flash loan events (filter by user if specified)
      for (const event of flashLoanEvents) {
        if ('args' in event && event.args && (!user || event.args.borrower === user || event.args.executor === user)) {
          const block = await this.provider.getBlock(event.blockNumber);
          actions.push({
            type: 'flashloan',
            user: event.args.borrower,
            token: event.args.token,
            amount: event.args.amount.toString(),
            fee: event.args.fee.toString(),
            borrower: event.args.borrower,
            executor: event.args.executor,
            feeAmount: event.args.fee.toString(),
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          } as FlashLoanAction);
        }
      }

      // Process vote events
      for (const event of voteEvents) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          actions.push({
            type: 'vote',
            user: event.args.voter, // voter, not user
            token: event.args.token,
            feeSelection: Number(event.args.feeAmount), // feeAmount, not feeSelection
            votingPower: event.args.voterShares.toString(), // voterShares, not votingPower
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          } as VoteAction);
        }
      }

      // Process fee proposal events
      for (const event of proposalEvents) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          actions.push({
            type: 'fee_proposal',
            user: 'system', // Proposals don't have a specific user, use system
            token: event.args.token,
            proposedFee: Number(event.args.newFeeBps),
            executionBlock: Number(event.args.executionBlock),
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          } as FeeProposalAction);
        }
      }

      // Process fee execution events
      for (const event of executionEvents) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          actions.push({
            type: 'fee_execution',
            user: 'system', // Executions don't have a specific user, use system
            token: event.args.token,
            oldFee: Number(event.args.oldFee),
            newFee: Number(event.args.newFee),
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          } as FeeExecutionAction);
        }
      }

      // Sort by block number and log index (most recent first)
      return actions.sort((a, b) => {
        if (b.blockNumber !== a.blockNumber) {
          return b.blockNumber - a.blockNumber;
        }
        return b.logIndex - a.logIndex;
      });

    } catch (error) {
      console.error('Error fetching user actions:', error);
      throw new Error(`Failed to fetch user actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all flash loan activity for a specific token
   */
  async getFlashLoanActivity(token: string, fromBlock: number = 0): Promise<FlashLoanAction[]> {
    try {
      const toBlock = await this.provider.getBlockNumber();
      const flashLoanFilter = this.contract.filters?.FlashLoan?.(null, token);
      if (!flashLoanFilter) {
        throw new Error('FlashLoan filter not available');
      }
      const events = await this.contract.queryFilter(flashLoanFilter, fromBlock, toBlock);
      
      const actions: FlashLoanAction[] = [];
      
      for (const event of events) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          actions.push({
            type: 'flashloan',
            user: event.args.borrower,
            token: event.args.token,
            amount: event.args.amount.toString(),
            fee: event.args.fee.toString(),
            borrower: event.args.borrower,
            executor: event.args.executor,
            feeAmount: event.args.fee.toString(),
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          });
        }
      }

      return actions.sort((a, b) => b.blockNumber - a.blockNumber);
    } catch (error) {
      console.error('Error fetching flash loan activity:', error);
      throw new Error(`Failed to fetch flash loan activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pool statistics including total volume, loan count, etc.
   */
  async getPoolStatistics(token: string, fromBlock: number = 0): Promise<{
    totalDeposits: string;
    totalWithdrawals: string;
    totalFlashLoans: string;
    totalFlashLoanVolume: string;
    totalFeesCollected: string;
    uniqueUsers: number;
    uniqueBorrowers: number;
  }> {
    try {
      const actions = await this.getUserActions(token, undefined, fromBlock);
      const flashLoans = await this.getFlashLoanActivity(token, fromBlock);
      
      let totalDeposits = BigInt(0);
      let totalWithdrawals = BigInt(0);
      let totalFlashLoanVolume = BigInt(0);
      let totalFeesCollected = BigInt(0);
      const uniqueUsers = new Set<string>();
      const uniqueBorrowers = new Set<string>();

      // Process regular actions
      for (const action of actions) {
        uniqueUsers.add(action.user);
        
        if (action.type === 'deposit' && action.amount) {
          totalDeposits += BigInt(action.amount);
        } else if (action.type === 'withdraw' && action.amount) {
          totalWithdrawals += BigInt(action.amount);
          if (action.fee) {
            totalFeesCollected += BigInt(action.fee);
          }
        }
      }

      // Process flash loans
      for (const flashLoan of flashLoans) {
        uniqueBorrowers.add(flashLoan.borrower);
        if (flashLoan.amount) {
          totalFlashLoanVolume += BigInt(flashLoan.amount);
        }
        if (flashLoan.fee) {
          totalFeesCollected += BigInt(flashLoan.fee);
        }
      }

      return {
        totalDeposits: totalDeposits.toString(),
        totalWithdrawals: totalWithdrawals.toString(),
        totalFlashLoans: flashLoans.length.toString(),
        totalFlashLoanVolume: totalFlashLoanVolume.toString(),
        totalFeesCollected: totalFeesCollected.toString(),
        uniqueUsers: uniqueUsers.size,
        uniqueBorrowers: uniqueBorrowers.size
      };
    } catch (error) {
      console.error('Error fetching pool statistics:', error);
      throw new Error(`Failed to fetch pool statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== CACHE MANAGEMENT ====================
  
  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }
  
  private setCache(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
  
  private invalidateCache(prefix: string) {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get proposal status for a specific token and fee amount
   */
  async getProposalStatus(token: string, feeBps: number): Promise<{ exists: boolean; executionBlock: number; canExecute: boolean }> {
    try {
      const executionBlock = await this.contract.proposedFeeChanges?.(token, feeBps);
      if (executionBlock === undefined) {
        throw new Error('proposedFeeChanges method not available');
      }
      const currentBlock = await this.provider.getBlockNumber();
      
      // Convert BigInt to number properly for ethers v6+
      const executionBlockNumber = typeof executionBlock === 'bigint' ? Number(executionBlock) : Number(executionBlock);
      
      return {
        exists: executionBlockNumber > 0,
        executionBlock: executionBlockNumber,
        canExecute: executionBlockNumber > 0 && currentBlock >= executionBlockNumber
      };
    } catch (error) {
      console.error('Error checking proposal status:', error);
      return { exists: false, executionBlock: 0, canExecute: false };
    }
  }

  /**
   * Get all proposal and execution events for a token
   */
  async getGovernanceActivity(token: string, fromBlock: number = 0): Promise<{ proposals: FeeProposalAction[]; executions: FeeExecutionAction[] }> {
    try {
      const toBlock = await this.provider.getBlockNumber();
      
      const proposalFilter = this.contract.filters?.LPFeeChangeProposed?.(token);
      const executionFilter = this.contract.filters?.LPFeeChangeExecuted?.(token);
      
      if (!proposalFilter || !executionFilter) {
        throw new Error('Event filters not available');
      }
      
      const [proposalEvents, executionEvents] = await Promise.all([
        this.contract.queryFilter(proposalFilter, fromBlock, toBlock),
        this.contract.queryFilter(executionFilter, fromBlock, toBlock)
      ]);

      const proposals: FeeProposalAction[] = [];
      const executions: FeeExecutionAction[] = [];

      // Process proposal events
      for (const event of proposalEvents) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          proposals.push({
            type: 'fee_proposal',
            user: 'system',
            token: event.args.token,
            proposedFee: Number(event.args.newFeeBps),
            executionBlock: Number(event.args.executionBlock),
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          });
        }
      }

      // Process execution events
      for (const event of executionEvents) {
        if ('args' in event && event.args) {
          const block = await this.provider.getBlock(event.blockNumber);
          executions.push({
            type: 'fee_execution',
            user: 'system',
            token: event.args.token,
            oldFee: Number(event.args.oldFee),
            newFee: Number(event.args.newFee),
            blockNumber: event.blockNumber,
            timestamp: block?.timestamp || 0,
            transactionHash: event.transactionHash,
            logIndex: event.index
          });
        }
      }

      return {
        proposals: proposals.sort((a, b) => b.blockNumber - a.blockNumber),
        executions: executions.sort((a, b) => b.blockNumber - a.blockNumber)
      };

    } catch (error) {
      console.error('Error fetching governance activity:', error);
      throw new Error(`Failed to fetch governance activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
  }
  
  /**
   * Update cache timeout
   */
  setCacheTimeout(ms: number) {
    this.cacheTimeout = ms;
  }
}
