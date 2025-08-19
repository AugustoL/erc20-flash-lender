// @ts-nocheck
import { ethers } from 'ethers';
import { Contract } from 'ethers';
import { getERC20FlashLenderAddress } from '../config';
import ERC20FlashLenderABI from '../contracts/ERC20FlashLender.json';
import { createTokenBalance } from '../context/TokensContext';
import { MulticallService } from './MulticallService';
import {
  TokenPool,
  UserPosition,
  ProposalData,
  UserAction,
  FlashLoanAction,
  VoteAction,
  FeeProposalAction,
  FeeExecutionAction,
  TokenBalance
} from '../types';

export class FlashLenderDataService {
  private provider: ethers.Provider;
  private contract: Contract;
  private multicallService: MulticallService;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout = 10000; // 10 seconds cache
  private contractAddress: string;
  private onTokenDiscovered?: (token: TokenBalance) => void;
  
  constructor(chainId?: number, onTokenDiscovered?: (token: TokenBalance) => void) {
    // Create provider from current environment
    this.provider = this.createProvider();
    
    // Store the token callback
    this.onTokenDiscovered = onTokenDiscovered;
    
    // Get contract address for the current chain
    const currentChainId = chainId || 31337; // Default to localhost
    const contractAddress = getERC20FlashLenderAddress(currentChainId);
    
    if (!contractAddress) {
      throw new Error(`No contract address found for chain ${currentChainId}`);
    }
    
    this.contractAddress = contractAddress;
    this.contract = new Contract(contractAddress, ERC20FlashLenderABI.abi, this.provider);
    this.multicallService = new MulticallService(this.provider);
  }
  
  /**
   * Get the provider instance
   */
  get providerInstance(): ethers.Provider {
    return this.provider;
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
    this.multicallService = new MulticallService(this.provider);
    this.clearCache(); // Clear cache when changing chains
  }

  // ==================== BATCHED DATA FETCHING ====================
  
  /**
   * Get all token pools with their data, optionally enriched with user-specific data
   */
  async getAllTokenPools(userAddress?: string): Promise<TokenPool[]> {
    const cacheKey = userAddress ? `pools_all_${userAddress}` : 'pools_all';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Fetch deposited tokens directly from contract
      const tokenAddresses = await this.contract.getDepositedTokens();
      
      if (tokenAddresses.length === 0) {
        return [];
      }

      const pools: TokenPool[] = [];
      
      // Use multicall for all pool data
      try {
        
        // Prepare all multicall calls
        const multicallCalls = [];
        for (const tokenAddress of tokenAddresses) {
          // Add 4 calls per token: totalLiquidity, totalShares, getEffectiveLPFee, collectedManagementFees
          multicallCalls.push(
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'totalLiquidity', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'totalLiquidity'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'totalShares', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'totalShares'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'getEffectiveLPFee', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'getEffectiveLPFee'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'collectedManagementFees', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'collectedManagementFees'
            }
          );
        }

        // Execute multicall
        const response = await this.multicallService.multicall(multicallCalls);
        
        // Process results - 4 results per token
        for (let i = 0; i < tokenAddresses.length; i++) {
          const tokenAddress = tokenAddresses[i];
          const baseIndex = i * 4;
          
          try {
            const totalLiquidity = response.decoded[baseIndex]?.[0] || BigInt(0);
            const totalShares = response.decoded[baseIndex + 1]?.[0] || BigInt(0);
            const lpFee = response.decoded[baseIndex + 2]?.[0] || 25; // default 25 bps
            const managementFee = response.decoded[baseIndex + 3]?.[0] || BigInt(0);

            const poolData: TokenPool = {
              address: tokenAddress,
              totalLiquidity,
              totalShares,
              lpFee: Number(lpFee),
              managementFee
            };
            
            pools.push(poolData);

            // Get user's balance and allowance for this token and add to context
            if (userAddress && this.onTokenDiscovered) {
              const [userBalance, userAllowance] = await this.getUserTokenData(tokenAddress, userAddress);

              // Get token metadata for complete TokenBalance object
              const tokenMetadata = await this.getTokenMetadata(tokenAddress);

              // Create complete TokenBalance object
              const tokenBalance = createTokenBalance(
                tokenAddress,
                tokenMetadata.symbol,
                tokenMetadata.name,
                tokenMetadata.decimals,
                userBalance,
                userAllowance,
                undefined // logoUrl can be added later
              );
              
              // Add to context via callback
              this.onTokenDiscovered(tokenBalance);
            }
          } catch (error) {
            console.error(`Failed to process multicall results for token ${tokenAddress}:`, error);
            // Add empty pool data as fallback
            pools.push({
              address: tokenAddress,
              totalLiquidity: BigInt(0),
              totalShares: BigInt(0),
              lpFee: 25,
              managementFee: BigInt(0)
            });
          }
        }
      } catch (error) {
        console.warn('Multicall failed for getAllTokenPools, falling back to individual calls:', error);
        
        // Fallback to original Promise.all approach
        for (const tokenAddress of tokenAddresses) {
          try {
            const [totalLiquidity, totalShares, lpFee, managementFee] = await Promise.all([
              this.contract.totalLiquidity(tokenAddress),
              this.contract.totalShares(tokenAddress),
              this.contract.getEffectiveLPFee(tokenAddress),
              this.contract.collectedManagementFees(tokenAddress)
            ]);
            
            const poolData: TokenPool = {
              address: tokenAddress,
              totalLiquidity,
              totalShares,
              lpFee: Number(lpFee),
              managementFee
            };
            
            pools.push(poolData);

            // Get user's balance and allowance for this token and add to context
            if (userAddress && this.onTokenDiscovered) {
              const [userBalance, userAllowance] = await this.getUserTokenData(tokenAddress, userAddress);

              // Get token metadata for complete TokenBalance object
              const tokenMetadata = await this.getTokenMetadata(tokenAddress);

              // Create complete TokenBalance object
              const tokenBalance = createTokenBalance(
                tokenAddress,
                tokenMetadata.symbol,
                tokenMetadata.name,
                tokenMetadata.decimals,
                userBalance,
                userAllowance,
                undefined // logoUrl can be added later
              );
              
              // Add to context via callback
              this.onTokenDiscovered(tokenBalance);
            }
          } catch (error) {
            console.error(`Failed to fetch data for token ${tokenAddress}:`, error);
          }
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
  async getUserPositions(userAddress: string): Promise<UserPosition[]> {
    const cacheKey = `user_${userAddress}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Fetch user's deposited tokens directly from contract
      const tokenAddresses = await this.contract.getUserDepositedTokens(userAddress);
      
      if (tokenAddresses.length === 0) {
        return [];
      }

      const positions: UserPosition[] = [];
      
      // Use multicall for all user position data
      try {
        
        // Prepare all multicall calls (8 calls per token)
        const multicallCalls = [];
        for (const tokenAddress of tokenAddresses) {
          multicallCalls.push(
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'totalLiquidity', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'totalLiquidity'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'totalShares', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'totalShares'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'getEffectiveLPFee', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'getEffectiveLPFee'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'collectedManagementFees', [tokenAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'collectedManagementFees'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'deposits', [tokenAddress, userAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'deposits'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'shares', [tokenAddress, userAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'shares'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'getWithdrawableAmount', [tokenAddress, userAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'getWithdrawableAmount'
            },
            {
              target: this.contractAddress,
              callData: MulticallService.encodeCall(this.contract.interface, 'lpFeeAmountSelected', [tokenAddress, userAddress]),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'lpFeeAmountSelected'
            }
          );
        }

        // Execute multicall
        const response = await this.multicallService.multicall(multicallCalls);
        
        // Process results - 8 results per token
        for (let i = 0; i < tokenAddresses.length; i++) {
          const tokenAddress = tokenAddresses[i];
          const baseIndex = i * 8;
          
          try {
            const totalLiquidity = response.decoded[baseIndex]?.[0] || BigInt(0);
            const totalShares = response.decoded[baseIndex + 1]?.[0] || BigInt(0);
            const lpFee = response.decoded[baseIndex + 2]?.[0] || 25;
            const managementFee = response.decoded[baseIndex + 3]?.[0] || BigInt(0);
            const deposits = response.decoded[baseIndex + 4]?.[0] || BigInt(0);
            const shares = response.decoded[baseIndex + 5]?.[0] || BigInt(0);
            const withdrawable = response.decoded[baseIndex + 6] || [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
            const voteSelection = response.decoded[baseIndex + 7]?.[0] || BigInt(0);

            // Get user's balance and allowance for this token
            const [userBalance, userAllowance] = await this.getUserTokenData(tokenAddress, userAddress);

            positions.push({
              address: tokenAddress,
              totalLiquidity,
              totalShares,
              lpFee,
              managementFee,
              deposits,
              shares,
              withdrawable: {
                netAmount: withdrawable[0] || BigInt(0),
                grossAmount: withdrawable[1] || BigInt(0),
                principal: withdrawable[2] || BigInt(0),
                fees: withdrawable[3] || BigInt(0),
                exitFee: withdrawable[4] || BigInt(0)
              },
              voteSelection: Number(voteSelection),
              userBalance,
              userAllowance
            });
          } catch (error) {
            console.error(`Failed to process multicall results for token ${tokenAddress}:`, error);
            // Add empty entry
            positions.push({
              address: tokenAddress,
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
      } catch (error) {
        console.warn('Multicall failed for getUserPositions, falling back to individual calls:', error);
        
        // Fallback to original Promise.all approach
        for (const tokenAddress of tokenAddresses) {
          try {
            const [totalLiquidity, totalShares, lpFee, managementFee,deposits, shares, withdrawable, voteSelection] = await Promise.all([
              this.contract.totalLiquidity(tokenAddress),
              this.contract.totalShares(tokenAddress),
              this.contract.getEffectiveLPFee(tokenAddress),
              this.contract.collectedManagementFees(tokenAddress),
              this.contract.deposits(tokenAddress, userAddress),
              this.contract.shares(tokenAddress, userAddress),
              this.contract.getWithdrawableAmount(tokenAddress, userAddress),
              this.contract.lpFeeAmountSelected(tokenAddress, userAddress)
            ]);
            
            // Get user's balance and allowance for this token
            const [userBalance, userAllowance] = await this.getUserTokenData(tokenAddress, userAddress);

            positions.push({
              address: tokenAddress,
              totalLiquidity,
              totalShares,
              lpFee,
              managementFee,
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
            console.warn(`Failed to fetch user data for token ${tokenAddress}:`, error);
            // Add empty entry
            positions.push({
              address: tokenAddress,
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
  async getGovernanceData() {
    // Fee options is an array of 1 to 100
    const feeOptions = Array.from({length: 100}, (_, i) => i + 1);
    
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
          
          // Phase 1: Use multicall for vote data collection
          const voteData = [];
          
          try {
            // Prepare all multicall data for all 100 fees at once
            const multicallCalls = feeOptions.map(fee => ({
              target: this.contractAddress,
              callData: MulticallService.encodeCall(
                this.contract.interface,
                'lpFeeSharesTotalVotes',
                [token, fee]
              ),
              allowFailure: true,
              contractInterface: this.contract.interface,
              methodName: 'lpFeeSharesTotalVotes'
            }));

            
            // Execute multicall
            const response = await this.multicallService.multicall(multicallCalls);
            
            // Process decoded results directly
            for (let i = 0; i < feeOptions.length; i++) {
              const fee = feeOptions[i];
              const decodedResult = response.decoded[i];
              
              if (decodedResult && decodedResult[0] !== undefined) {
                const votes = decodedResult[0];
                voteData.push({ fee, votes });
              } else {
                voteData.push({ fee, votes: BigInt(0) });
              }
            }
          } catch (error) {
            console.warn(`Multicall failed for token ${token}, using fallback:`, error);
            // Fallback to original Promise.all approach
            const batchSize = 20;
            
            for (let batchIndex = 0; batchIndex < 10; batchIndex++) {
              const batchStart = batchIndex * batchSize;
              const batchEnd = batchStart + batchSize;
              const batch = feeOptions.slice(batchStart, batchEnd);
              
              try {
                const batchResults = await Promise.all(
                  batch.map(async (fee) => {
                    try {
                      const votes = await this.contract.lpFeeSharesTotalVotes(token, fee);
                      return { fee, votes };
                    } catch (error) {
                      console.warn(`Failed to fetch votes for ${token} fee ${fee}:`, error);
                      return { fee, votes: BigInt(0) };
                    }
                  })
                );
                
                voteData.push(...batchResults);
                
                // Small delay between batches to avoid overwhelming RPC
                if (batchIndex < 9) {
                  await new Promise(resolve => setTimeout(resolve, 10));
                }
              } catch (error) {
                console.warn(`Failed to fetch batch ${batchIndex} for token ${token}:`, error);
                batch.forEach(fee => voteData.push({ fee, votes: BigInt(0) }));
              }
            }
          }
          
          // Phase 2: Sort fees by vote count (highest to lowest)
          voteData.sort((a, b) => {
            const diff = b.votes - a.votes;
            return diff > 0 ? 1 : diff < 0 ? -1 : 0;
          });
          
          // Phase 3: Get execution block only for the fee with highest support
          const proposals = [];
          const topFee = voteData.find(vote => vote.votes > BigInt(0));
          
          if (topFee) {
            try {
              const executionBlock = await this.contract.proposedFeeChanges(token, topFee.fee);
              
              if (executionBlock > BigInt(0)) {
                proposals.push({
                  token,
                  feeAmount: topFee.fee,
                  executionBlock,
                  currentBlock: BigInt(currentBlock),
                  canExecute: BigInt(currentBlock) >= executionBlock
                });
              }
            } catch (error) {
              console.warn(`Failed to fetch execution block for ${token} fee ${topFee.fee}:`, error);
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
      // Use multicall for balance and allowance
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      
      const multicallCalls = [
        {
          target: tokenAddress,
          callData: MulticallService.encodeCall(tokenInterface, 'balanceOf', [userAddress]),
          allowFailure: true,
          contractInterface: tokenInterface,
          methodName: 'balanceOf'
        },
        {
          target: tokenAddress,
          callData: MulticallService.encodeCall(tokenInterface, 'allowance', [userAddress, this.contractAddress]),
          allowFailure: true,
          contractInterface: tokenInterface,
          methodName: 'allowance'
        }
      ];

      const response = await this.multicallService.multicall(multicallCalls);
      
      const balance = response.decoded[0]?.[0] || BigInt(0);
      const allowance = response.decoded[1]?.[0] || BigInt(0);
      
      return [balance, allowance];
    } catch (error) {
      console.warn(`Failed to fetch user token data for ${tokenAddress}:`, error);
      return [BigInt(0), BigInt(0)];
    }
  }

  /**
   * Get token metadata (symbol, name, decimals) for a single token
   */
  private async getTokenMetadata(tokenAddress: string): Promise<{ symbol: string; name: string; decimals: number }> {
    const ERC20_ABI = [
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function name() view returns (string)'
    ];
    
    try {
      // Use multicall for token metadata
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      
      const multicallCalls = [
        {
          target: tokenAddress,
          callData: MulticallService.encodeCall(tokenInterface, 'symbol', []),
          allowFailure: true,
          contractInterface: tokenInterface,
          methodName: 'symbol'
        },
        {
          target: tokenAddress,
          callData: MulticallService.encodeCall(tokenInterface, 'decimals', []),
          allowFailure: true,
          contractInterface: tokenInterface,
          methodName: 'decimals'
        },
        {
          target: tokenAddress,
          callData: MulticallService.encodeCall(tokenInterface, 'name', []),
          allowFailure: true,
          contractInterface: tokenInterface,
          methodName: 'name'
        }
      ];

      const response = await this.multicallService.multicall(multicallCalls);
      
      const symbol = response.decoded[0]?.[0] || 'UNKNOWN';
      const decimals = response.decoded[1]?.[0] || 18;
      const name = response.decoded[2]?.[0] || 'Unknown Token';
      
      return { symbol, name, decimals };
    } catch (error) {
      console.warn(`Failed to fetch metadata for token ${tokenAddress}:`, error);
      return { symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 18 };
    }
  }
  
  /**
   * Enrich pool data with token metadata
   */
  private async enrichWithTokenMetadata(pools: TokenPool[]) {
    if (pools.length === 0) return;
    
    const ERC20_ABI = [
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function name() view returns (string)'
    ];
    
    try {
      
      // Use multicall for all token metadata
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      const multicallCalls = [];
      
      // Create 3 calls per token (symbol, decimals, name)
      for (const pool of pools) {
        multicallCalls.push(
          {
            target: pool.address,
            callData: MulticallService.encodeCall(tokenInterface, 'symbol', []),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'symbol'
          },
          {
            target: pool.address,
            callData: MulticallService.encodeCall(tokenInterface, 'decimals', []),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'decimals'
          },
          {
            target: pool.address,
            callData: MulticallService.encodeCall(tokenInterface, 'name', []),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'name'
          }
        );
      }

      const response = await this.multicallService.multicall(multicallCalls);
      
      // Process results - 3 results per token
      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const baseIndex = i * 3;
        
        try {
          pool.symbol = response.decoded[baseIndex]?.[0] || 'UNKNOWN';
          pool.decimals = response.decoded[baseIndex + 1]?.[0] || 18;
          pool.name = response.decoded[baseIndex + 2]?.[0] || 'Unknown Token';
        } catch (error) {
          console.warn(`Failed to process metadata for token ${pool.address}:`, error);
          pool.symbol = 'UNKNOWN';
          pool.decimals = 18;
          pool.name = 'Unknown Token';
        }
      }
    } catch (error) {
      console.warn('Multicall failed for enrichWithTokenMetadata, falling back to individual calls:', error);
      
      // Fallback to original approach
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
