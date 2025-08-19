import { ethers, Contract } from 'ethers';

interface MulticallCall {
  target: string;
  callData: string;
  allowFailure?: boolean;
  // Optional decoding parameters
  contractInterface?: ethers.Interface;
  methodName?: string;
}

interface MulticallResult {
  success: boolean;
  returnData: string;
}

interface MulticallResponse {
  encoded: (string | null)[];
  decoded: (any | null)[];
}

export class MulticallService {
  private provider: ethers.Provider;
  private contract: Contract;
  private maxBatchSize: number;
  
  // Multicall3 ABI - only the aggregate3 function we need
  private static readonly MULTICALL3_ABI = [
    {
      inputs: [
        {
          components: [
            { name: 'target', type: 'address' },
            { name: 'allowFailure', type: 'bool' },
            { name: 'callData', type: 'bytes' }
          ],
          name: 'calls',
          type: 'tuple[]'
        }
      ],
      name: 'aggregate3',
      outputs: [
        {
          components: [
            { name: 'success', type: 'bool' },
            { name: 'returnData', type: 'bytes' }
          ],
          name: 'returnData',
          type: 'tuple[]'
        }
      ],
      stateMutability: 'payable',
      type: 'function'
    }
  ];

  // Standard Multicall3 address (same across most chains)
  private static readonly MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
  
  // Maximum batch size for multicall operations
  private static readonly MAX_BATCH_SIZE = 50;

  constructor(provider: ethers.Provider, multicallAddress?: string, maxBatchSize?: number) {
    this.provider = provider;
    this.maxBatchSize = maxBatchSize || MulticallService.MAX_BATCH_SIZE;
    this.contract = new Contract(
      multicallAddress || MulticallService.MULTICALL3_ADDRESS,
      MulticallService.MULTICALL3_ABI,
      provider
    );
  }

  async multicall(calls: MulticallCall[]): Promise<MulticallResponse> {
    if (calls.length === 0) {
      return { encoded: [], decoded: [] };
    }

    // If calls exceed max batch size, split into batches
    if (calls.length > this.maxBatchSize) {
      return this.multicallBatched(calls);
    }

    try {
      // Single batch multicall
      return this.executeSingleBatch(calls);
    } catch (error) {
      console.warn('Multicall failed entirely, falling back to individual calls:', error);
      return this.fallbackToIndividualCalls(calls);
    }
  }

  private async multicallBatched(calls: MulticallCall[]): Promise<MulticallResponse> {
    const batches: MulticallCall[][] = [];
    
    // Split calls into batches
    for (let i = 0; i < calls.length; i += this.maxBatchSize) {
      batches.push(calls.slice(i, i + this.maxBatchSize));
    }


    const allEncodedResults: (string | null)[] = [];
    const allDecodedResults: (any | null)[] = [];

    // Execute batches sequentially to avoid overwhelming the RPC
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      if (!batch) {
        console.warn(`Batch ${batchIndex} is undefined, skipping`);
        continue;
      }
      
      try {
        const batchResponse = await this.executeSingleBatch(batch);
        allEncodedResults.push(...batchResponse.encoded);
        allDecodedResults.push(...batchResponse.decoded);

        // Small delay between batches to avoid overwhelming RPC
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error) {
        console.warn(`Batch ${batchIndex} failed, falling back to individual calls for this batch:`, error);
        
        // Fallback for this batch only
        const fallbackResponse = await this.fallbackToIndividualCalls(batch);
        allEncodedResults.push(...fallbackResponse.encoded);
        allDecodedResults.push(...fallbackResponse.decoded);
      }
    }

    return { encoded: allEncodedResults, decoded: allDecodedResults };
  }

  private async executeSingleBatch(calls: MulticallCall[]): Promise<MulticallResponse> {
    const multicallCalls = calls.map(call => ({
      target: call.target,
      allowFailure: call.allowFailure || false,
      callData: call.callData
    }));

    // Use staticCall for read-only operations instead of sendTransaction
    const results: MulticallResult[] = await (this.contract as any).aggregate3.staticCall(multicallCalls);
    
    const encodedResults: (string | null)[] = [];
    const decodedResults: (any | null)[] = [];
    let hasFailures = false;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const call = calls[i];
      
      if (result && result.success && result.returnData !== '0x') {
        // Store encoded result
        encodedResults.push(result.returnData);
        
        // Decode if decoding info is provided
        if (call && call.contractInterface && call.methodName) {
          try {
            const decoded = MulticallService.decodeResult(
              call.contractInterface,
              call.methodName,
              result.returnData
            );
            decodedResults.push(decoded);
          } catch (error) {
            console.warn(`Failed to decode result for call ${i}:`, error);
            decodedResults.push(null);
          }
        } else {
          // No decoding info provided, store encoded data as decoded
          decodedResults.push(result.returnData);
        }
      } else {
        encodedResults.push(null);
        decodedResults.push(null);
        hasFailures = true;
      }
    }

    // If multicall succeeded but some individual calls failed, fall back to Promise.all
    if (hasFailures) {
      console.warn('Some multicall results failed, falling back to individual calls');
      return this.fallbackToIndividualCalls(calls);
    }

    return { encoded: encodedResults, decoded: decodedResults };
  }

  private async fallbackToIndividualCalls(calls: MulticallCall[]): Promise<MulticallResponse> {
    const promises = calls.map(async (call) => {
      try {
        const result = await this.provider.call({
          to: call.target,
          data: call.callData
        });
        return result;
      } catch (error) {
        console.warn(`Individual call failed for ${call.target}:`, error);
        return null;
      }
    });

    const encodedResults = await Promise.all(promises);
    const decodedResults: (any | null)[] = [];

    // Process each result for decoding
    for (let i = 0; i < encodedResults.length; i++) {
      const encodedResult = encodedResults[i];
      const call = calls[i];
      
      if (encodedResult && call && call.contractInterface && call.methodName) {
        try {
          const decoded = MulticallService.decodeResult(
            call.contractInterface,
            call.methodName,
            encodedResult
          );
          decodedResults.push(decoded);
        } catch (error) {
          console.warn(`Failed to decode fallback result for call ${i}:`, error);
          decodedResults.push(null);
        }
      } else {
        // No decoding info provided, store encoded data as decoded
        decodedResults.push(encodedResult);
      }
    }

    return { encoded: encodedResults, decoded: decodedResults };
  }

  // Helper method to create call data for contract method calls
  static encodeCall(contractInterface: ethers.Interface, methodName: string, params: any[]): string {
    return contractInterface.encodeFunctionData(methodName, params);
  }

  // Helper method to decode return data
  static decodeResult(contractInterface: ethers.Interface, methodName: string, returnData: string): any {
    if (!returnData || returnData === '0x') {
      return null;
    }
    try {
      return contractInterface.decodeFunctionResult(methodName, returnData);
    } catch (error) {
      console.warn(`Failed to decode result for ${methodName}:`, error);
      return null;
    }
  }
}