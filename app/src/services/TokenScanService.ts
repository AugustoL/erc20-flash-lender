import { ethers, Contract, Filter } from 'ethers';
import { useTokens } from '../context/TokensContext';
import { createTokenBalance } from '../context/TokensContext';
import { MulticallService } from './MulticallService';

// ERC20 event signatures
const ERC20_TRANSFER_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export class TokenScanService {
  private provider: ethers.Provider;
  private multicallService: MulticallService;

  constructor(provider: ethers.Provider) {
    this.provider = provider;
    this.multicallService = new MulticallService(provider);
  }

  /**
   * Scan for ERC20 events involving a user's address from a specific block
   */
  async scanForTokens(userAddress: string, fromBlock: number): Promise<string[]> {
    try {
      const toBlock = await this.provider.getBlockNumber();
      const paddedUserAddress = ethers.zeroPadValue(userAddress, 32);
      const MAX_BLOCK_RANGE = 10000;
      
      const tokenAddresses = new Set<string>();
      
      // Calculate the total range and split into batches if needed
      const totalBlocks = toBlock - fromBlock + 1;
      
      if (totalBlocks <= MAX_BLOCK_RANGE) {
        // Single batch - process normally
        const [outgoingLogs, incomingLogs] = await this.scanBlockRange(
          paddedUserAddress, 
          fromBlock, 
          toBlock
        );
        
        for (const log of [...outgoingLogs, ...incomingLogs]) {
          tokenAddresses.add(log.address.toLowerCase());
        }
      } else {
        // Multiple batches - split the range
        const batches = Math.ceil(totalBlocks / MAX_BLOCK_RANGE);
        console.log(`Scanning ${totalBlocks} blocks in ${batches} batches of max ${MAX_BLOCK_RANGE} blocks each`);
        
        for (let i = 0; i < batches; i++) {
          const batchFromBlock = fromBlock + (i * MAX_BLOCK_RANGE);
          const batchToBlock = Math.min(batchFromBlock + MAX_BLOCK_RANGE - 1, toBlock);
          
          console.log(`Scanning batch ${i + 1}/${batches}: blocks ${batchFromBlock} to ${batchToBlock}`);
          
          try {
            const [outgoingLogs, incomingLogs] = await this.scanBlockRange(
              paddedUserAddress,
              batchFromBlock,
              batchToBlock
            );
            
            for (const log of [...outgoingLogs, ...incomingLogs]) {
              tokenAddresses.add(log.address.toLowerCase());
            }
            
            // Small delay between batches to avoid rate limiting
            if (i < batches - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (error) {
            console.warn(`Error scanning batch ${i + 1}/${batches} (blocks ${batchFromBlock}-${batchToBlock}):`, error);
            // Continue with next batch instead of failing entirely
          }
        }
      }

      console.log(`Found ${tokenAddresses.size} unique token addresses across ${totalBlocks} blocks`);
      return Array.from(tokenAddresses);
    } catch (error) {
      console.error('Error scanning for tokens:', error);
      return [];
    }
  }

  /**
   * Scan a specific block range for ERC20 transfer events
   */
  private async scanBlockRange(
    paddedUserAddress: string, 
    fromBlock: number, 
    toBlock: number
  ): Promise<[any[], any[]]> {
    // Create two separate filters - one for when user sends, one for when user receives
    const outgoingTransferFilter = {
      topics: [
        ERC20_TRANSFER_SIGNATURE,
        paddedUserAddress, // user is sender (from)
        null // any receiver (to)
      ],
      fromBlock,
      toBlock
    };

    const incomingTransferFilter = {
      topics: [
        ERC20_TRANSFER_SIGNATURE,
        null, // any sender (from)
        paddedUserAddress // user is receiver (to)
      ],
      fromBlock,
      toBlock
    };

    // Get logs from both filters
    return await Promise.all([
      this.provider.getLogs(outgoingTransferFilter),
      this.provider.getLogs(incomingTransferFilter)
    ]);
  }

  /**
   * Check token balance for a user
   */
  async getTokenBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
    const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];
    
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      return contract && contract.balanceOf ? await contract.balanceOf(userAddress) : BigInt(0);
    } catch (error) {
      console.warn(`Failed to get balance for token ${tokenAddress}:`, error);
      return BigInt(0);
    }
  }

  /**
   * Get token allowance for a user and spender
   */
  async getTokenAllowance(tokenAddress: string, userAddress: string, spenderAddress: string): Promise<bigint> {
    const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)'];
    
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      return contract && contract.allowance ? await contract.allowance(userAddress, spenderAddress) : BigInt(0);
    } catch (error) {
      console.warn(`Failed to get allowance for token ${tokenAddress}:`, error);
      return BigInt(0);
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
   * Scan for tokens and add new ones with positive balance to TokensContext
   */
  async scanAndAddTokens(
    userAddress: string, 
    fromBlock: number, 
    spenderAddress: string,
    addTokenCallback: (token: any) => void,
    hasTokenCallback: (address: string) => boolean
  ): Promise<void> {
    try {
      
      // Scan for token addresses
      const tokenAddresses = await this.scanForTokens(userAddress, fromBlock);
      
      if (tokenAddresses.length === 0) {
        return;
      }


      // Use multicall to batch all token data calls
      // For each token: balance + symbol + decimals + name + allowance = 5 calls per token
      const multicallCalls = [];
      const ERC20_ABI = [
        'function balanceOf(address owner) view returns (uint256)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function name() view returns (string)',
        'function allowance(address owner, address spender) view returns (uint256)'
      ];
      
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      
      for (const tokenAddress of tokenAddresses) {
        multicallCalls.push(
          // Balance
          {
            target: tokenAddress,
            callData: MulticallService.encodeCall(tokenInterface, 'balanceOf', [userAddress]),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'balanceOf'
          },
          // Symbol
          {
            target: tokenAddress,
            callData: MulticallService.encodeCall(tokenInterface, 'symbol', []),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'symbol'
          },
          // Decimals
          {
            target: tokenAddress,
            callData: MulticallService.encodeCall(tokenInterface, 'decimals', []),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'decimals'
          },
          // Name
          {
            target: tokenAddress,
            callData: MulticallService.encodeCall(tokenInterface, 'name', []),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'name'
          },
          // Allowance
          {
            target: tokenAddress,
            callData: MulticallService.encodeCall(tokenInterface, 'allowance', [userAddress, spenderAddress]),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'allowance'
          }
        );
      }

      const response = await this.multicallService.multicall(multicallCalls);

      // Process results - 5 results per token
      for (let i = 0; i < tokenAddresses.length; i++) {
        const tokenAddress = tokenAddresses[i];
        if (!tokenAddress) continue;
        
        const baseIndex = i * 5;
        
        try {
          const balance = response.decoded[baseIndex]?.[0] || BigInt(0);
          const symbol = response.decoded[baseIndex + 1]?.[0] || 'UNKNOWN';
          const decimals = response.decoded[baseIndex + 2]?.[0] || 18;
          const name = response.decoded[baseIndex + 3]?.[0] || 'Unknown Token';
          const allowance = response.decoded[baseIndex + 4]?.[0] || BigInt(0);


          // Only add tokens with positive balance
          if (balance > BigInt(0)) {
            
            // Create TokenBalance object
            const tokenBalance = createTokenBalance(
              tokenAddress,
              typeof symbol === 'string' ? symbol : 'UNKNOWN',
              typeof name === 'string' ? name : 'Unknown Token',
              typeof decimals === 'number' ? decimals : 18,
              balance,
              allowance
            );
            
            // Add to context
            addTokenCallback(tokenBalance);
          }
        } catch (error) {
          console.warn(`Failed to process multicall results for token ${tokenAddress}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in scanAndAddTokens:', error);
      
      // Fallback to original sequential approach
      const tokenAddresses = await this.scanForTokens(userAddress, fromBlock);
      
      for (const tokenAddress of tokenAddresses) {
        try {
          const balance = await this.getTokenBalance(tokenAddress, userAddress);
          
          if (balance > BigInt(0)) {
            const [metadata, allowance] = await Promise.all([
              this.getTokenMetadata(tokenAddress),
              this.getTokenAllowance(tokenAddress, userAddress, spenderAddress)
            ]);
            
            
            const tokenBalance = createTokenBalance(
              tokenAddress,
              metadata.symbol,
              metadata.name,
              metadata.decimals,
              balance,
              allowance
            );
            
            addTokenCallback(tokenBalance);
          }
        } catch (error) {
          console.warn(`Failed to process token ${tokenAddress} in fallback:`, error);
        }
      }
    }
  }
}