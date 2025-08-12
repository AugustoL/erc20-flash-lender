import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { useFlashLender } from '../../hooks/useFlashLender';
import { FlashLenderDataService } from '../../services/FlashLenderDataService';
import ActionModal, { ActionType } from '../common/ActionModal';
import ActivityList from '../common/ActivityList';
import { useNotifications } from '../../context/NotificationContext';
import {
  PoolData,
  UserPosition,
  UserAction,
  PoolStatistics,
  FeeVote
} from '../../types';

export default function Pool() {
  const { tokenAddress } = useParams<{ tokenAddress: string }>();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [poolActions, setPoolActions] = useState<UserAction[]>([]);
  const [poolStatistics, setPoolStatistics] = useState<PoolStatistics | null>(null);
  const [feeGovernance, setFeeGovernance] = useState<FeeVote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const [isLoadingFeeChange, setIsLoadingFeeChange] = useState(false);
  const [isLoadingProposal, setIsLoadingProposal] = useState(false);
  const [proposalStatus, setProposalStatus] = useState<{ exists: boolean; canExecute: boolean; blocksRemaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'user' | 'pool' | 'stats'>('user');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType>('deposit');
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<string>('0');

  // Notifications
  const { addNotification } = useNotifications();

  // Create ethers provider from wagmi public client
  const provider = React.useMemo(() => {
    const rpcUrl = publicClient?.transport?.url || 'http://localhost:8545';
    return new ethers.JsonRpcProvider(rpcUrl);
  }, [publicClient?.transport?.url]);

  // Get the current chain ID
  const currentChainId = chainId || 31337; // Default to localhost if no chain

  // Create service instance
  const service = React.useMemo(() => {
    try {
      return new FlashLenderDataService(currentChainId);
    } catch (error) {
      console.error('Failed to initialize FlashLenderDataService:', error);
      return null;
    }
  }, [currentChainId]);

  const {
    pools,
    userPositions,
    isLoading: isHookLoading,
    refresh,
    clearCache,
    deposit: hookDeposit,
    withdraw: hookWithdraw,
    withdrawFees: hookWithdrawFees,
    voteForLPFee: hookVoteForLPFee,
    proposeLPFeeChange: hookProposeLPFeeChange,
    executeLPFeeChange: hookExecuteLPFeeChange,
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

  // Fetch user's wallet balance for the current token
  const fetchWalletBalance = useCallback(async () => {
    if (!tokenAddress || !address || !provider) {
      setWalletBalance('0');
      return;
    }

    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address owner) view returns (uint256)'],
        provider
      );
      
      const balance = await tokenContract.balanceOf?.(address);
      setWalletBalance(balance.toString());
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      setWalletBalance('0');
    }
  }, [tokenAddress, address, provider]);

  // Extract specific pool and user data
  useEffect(() => {
    console.log('Pool component - tokenAddress:', tokenAddress);
    console.log('Pool component - pools:', pools);
    console.log('Pool component - userPositions:', userPositions);
    console.log('Pool component - isHookLoading:', isHookLoading);
    
    if (!tokenAddress) {
      setError('No token address provided');
      setIsLoading(false);
      return;
    }

    // If the hook is still loading, keep our local loading state true
    if (isHookLoading) {
      setIsLoading(true);
      setError(null);
      return;
    }

    // Clear cache to ensure fresh data with APY calculation
    clearCache();

    // Find pool data for this specific token
    if (pools && pools.length > 0) {
      const pool = pools.find(p => p.address.toLowerCase() === tokenAddress.toLowerCase());
      if (pool) {
        console.log('Found pool:', pool);
        setPoolData(pool);
        setError(null);
      } else {
        console.log('Pool not found for token:', tokenAddress);
        setError('Pool not found for this token address');
      }
    } else if (!isHookLoading) {
      // Only show error if hook is not loading and no pools found
      console.log('No pools available and hook finished loading');
      setError('No pools available');
    }

    // Find user position for this specific token
    if (isConnected) {
      if (userPositions && userPositions.length > 0) {
        const position = userPositions.find(p => p.token.toLowerCase() === tokenAddress.toLowerCase());
        console.log('Found user position:', position);
        setUserPosition(position || null);
      } else {
        // Clear user position if no positions are found for connected user
        console.log('No user positions found, clearing user position');
        setUserPosition(null);
      }
    } else {
      // Clear user position if user is not connected
      setUserPosition(null);
    }

    setIsLoading(false);
  }, [tokenAddress, pools, userPositions, isConnected, isHookLoading, clearCache]);

  // Load user actions and pool activity
  useEffect(() => {
    if (!tokenAddress || !service) return;

    const loadActions = async () => {
      setIsLoadingActions(true);
      try {
        // Get more blocks for better activity history (last 5000 blocks or last week)
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 5000);

        console.log('Loading actions from block:', fromBlock, 'to', currentBlock);
        console.log('Token address:', tokenAddress);
        console.log('User address:', address);

        const [userActionsData, poolActionsData, statsData, governanceData] = await Promise.all([
          // User-specific actions
          address ? service.getUserActions(tokenAddress, address, fromBlock) : Promise.resolve([]),
          // All pool activity (limited to recent)
          service.getUserActions(tokenAddress, undefined, fromBlock),
          // Pool statistics
          service.getPoolStatistics(tokenAddress, fromBlock),
          // Fee governance data
          service.getGovernanceData([1, 25, 50, 100])
        ]);

        console.log('User actions loaded:', userActionsData);
        console.log('Pool actions loaded:', poolActionsData.length);
        console.log('Pool statistics:', statsData);
        console.log('Governance data:', governanceData);

        setUserActions(userActionsData);
        setPoolActions(poolActionsData.slice(0, 20)); // Limit to 20 most recent
        setPoolStatistics(statsData);

        // Process governance data for this specific token
        const tokenGovernance = governanceData.get(tokenAddress);
        if (tokenGovernance) {
          const currentFee = tokenGovernance.currentFee;
          const voteData = tokenGovernance.voteData;
          
          // Calculate total votes for percentage calculation
          const totalVotes = voteData.reduce((sum: bigint, vote: any) => sum + vote.votes, BigInt(0));
          
          // Transform and sort by vote count
          const feeVotes: FeeVote[] = voteData
            .map((vote: any) => ({
              fee: vote.fee,
              votes: vote.votes,
              percentage: totalVotes > 0 ? Number((vote.votes * BigInt(100)) / totalVotes) : 0,
              isActive: vote.fee === currentFee
            }))
            .filter((vote: FeeVote) => vote.votes > 0) // Only show fees with votes
            .sort((a: FeeVote, b: FeeVote) => Number(b.votes - a.votes)); // Sort by votes descending
          
          setFeeGovernance(feeVotes);
        } else {
          setFeeGovernance([]);
        }
      } catch (error) {
        console.error('Error loading actions:', error);
      } finally {
        setIsLoadingActions(false);
      }
    };

    loadActions();
  }, [tokenAddress, address, service, provider]);

  // Check proposal status when user position changes
  useEffect(() => {
    if (!tokenAddress || !userPosition?.voteSelection || !provider) {
      setProposalStatus(null);
      return;
    }

    const checkStatus = async () => {
      try {
        const status = await checkProposalStatus(tokenAddress, userPosition.voteSelection);
        const currentBlock = await provider.getBlockNumber();
        const blocksRemaining = status.exists ? Math.max(0, status.executionBlock - currentBlock) : 0;
        
        setProposalStatus({
          exists: status.exists,
          canExecute: status.canExecute,
          blocksRemaining
        });
      } catch (error) {
        console.error('Error checking proposal status:', error);
        setProposalStatus(null);
      }
    };

    checkStatus();
  }, [tokenAddress, userPosition, provider]);

  // Fetch wallet balance when token or user changes
  useEffect(() => {
    fetchWalletBalance();
  }, [fetchWalletBalance]);

  // Format amount helper
  const formatAmount = useCallback((amount: string, decimals: number = 18, symbol: string = '') => {
    try {
      const formatted = Number(ethers.formatUnits(amount, decimals)).toLocaleString(undefined, { 
        maximumFractionDigits: 4 
      });
      return `${formatted} ${symbol}`;
    } catch {
      return 'N/A';
    }
  }, []);

  // Token icon helpers
  const getTokenIconUrl = useCallback((tokenAddress: string): string => {
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${ethers.getAddress(tokenAddress)}/logo.png`;
  }, []);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
    // Show the fallback avatar
    const fallback = img.nextElementSibling as HTMLElement;
    if (fallback) {
      fallback.style.display = 'block';
    }
  }, []);

  // Get appropriate button text based on proposal status
  const getChangeFeeButtonText = () => {
    if (isLoadingProposal) return 'Creating Proposal...';
    if (isLoadingFeeChange) return 'Executing Change...';
    
    if (!proposalStatus) return 'Propose Fee Change';
    
    if (proposalStatus.canExecute) return 'Execute Fee Change';
    if (proposalStatus.exists) return `Execute in ${proposalStatus.blocksRemaining} blocks`;
    
    return 'Propose Fee Change';
  };

  if (isLoading) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head">
            <h3>Loading Pool Information...</h3>
          </div>
          <div className="center-content">
            <div>Fetching pool data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head">
            <h3>Pool Information</h3>
          </div>
          <div className="center-content">
            <div className="error-text">
              {error}
            </div>
            <Link to="/" className="btn primary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!poolData) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head">
            <h3>Pool Not Found</h3>
          </div>
          <div className="center-content">
            <div className="margin-bottom">
              No pool found for token address: {tokenAddress}
            </div>
            <Link to="/" className="btn primary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasUserPosition = userPosition && userPosition.shares && BigInt(userPosition.shares) > BigInt(0);

  // Check if user's selected fee is the highest voted and not active
  const shouldShowChangeFeeButton = () => {
    if (!hasUserPosition || !userPosition?.voteSelection || feeGovernance.length === 0) {
      return false;
    }

    // Get the highest voted fee (first in sorted array)
    const highestVotedFee = feeGovernance[0];
    
    // Check if user's selection matches highest voted fee and it's not currently active
    return userPosition.voteSelection === highestVotedFee?.fee && !highestVotedFee?.isActive;
  };

  // Check if a proposal already exists and its status
  const checkProposalStatus = async (tokenAddress: string, feeBps: number): Promise<{ exists: boolean; executionBlock: number; canExecute: boolean }> => {
    if (!service) {
      return { exists: false, executionBlock: 0, canExecute: false };
    }
    
    try {
      return await service.getProposalStatus(tokenAddress, feeBps);
    } catch (error) {
      console.error('Error checking proposal status:', error);
      return { exists: false, executionBlock: 0, canExecute: false };
    }
  };

  const handleChangeFee = async () => {
    if (!isConnected || !address || !tokenAddress || !userPosition?.voteSelection) {
      console.error('Missing required data for fee change');
      addNotification('Please ensure your wallet is connected and you have voted for a fee.', 'warning');
      return;
    }

    try {
      setIsLoadingFeeChange(true);
      const signer = await getSigner();
      
      // Check if proposal already exists
      const proposalStatus = await checkProposalStatus(tokenAddress, userPosition.voteSelection);
      
      if (proposalStatus.canExecute) {
        // Proposal exists and can be executed
        console.log(`Executing existing proposal for fee change to: ${userPosition.voteSelection} basis points`);
        if (signer) {
          await hookExecuteLPFeeChange(tokenAddress, userPosition.voteSelection, signer);
        } else {
          throw new Error('Wallet not connected');
        }
        addNotification(`Successfully changed fee to ${(userPosition.voteSelection / 100).toFixed(2)}%!`, 'success');
      } else if (proposalStatus.exists) {
        // Proposal exists but can't be executed yet
        const currentBlock = await provider.getBlockNumber();
        const blocksRemaining = proposalStatus.executionBlock - currentBlock;
        addNotification(`Proposal already exists but cannot be executed yet. Please wait ${blocksRemaining} more blocks.`, 'warning');
        return;
      } else {
        // No proposal exists, need to create one first
        console.log(`Creating proposal for fee change to: ${userPosition.voteSelection} basis points`);
        setIsLoadingProposal(true);
        if (signer) {
          await hookProposeLPFeeChange(tokenAddress, userPosition.voteSelection, signer);
        } else {
          throw new Error('Wallet not connected');
        }
        addNotification(`Proposal created! You can execute the fee change after 10 blocks (approximately 2 minutes).`, 'success');
        setIsLoadingProposal(false);
        return;
      }
      
      // Clear cache and wait a moment for blockchain state to propagate
      clearCache();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      // Refresh data after successful execution
      await refresh();
      // Also refresh wallet balance to ensure UI is up to date
      await fetchWalletBalance();
    } catch (error) {
      console.error('Error with fee change process:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addNotification(`Failed to process fee change: ${errorMessage}`, 'error');
    } finally {
      setIsLoadingFeeChange(false);
      setIsLoadingProposal(false);
    }
  };

  // Utility function to create ethers signer from wallet client - FORCE MetaMask
  const getSigner = async (): Promise<ethers.Signer | null> => {
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

  // Modal handlers
  const openModal = (action: ActionType) => {
    console.log('🔘 openModal called with action:', action);
    console.log('🔘 Current modal state - isModalOpen:', isModalOpen);
    console.log('🔘 Is connected:', isConnected);
    console.log('🔘 Available balance:', getAvailableBalance());
    setCurrentAction(action);
    setIsModalOpen(true);
    console.log('🔘 Modal should now be open');
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsTransactionLoading(false);
  };

  const handleModalConfirm = async (amount: string, feePercentage?: number, withdrawType?: 'all' | 'fees') => {
    if (!isConnected || !address || !tokenAddress) {
      addNotification('Please connect your wallet first.', 'warning');
      return;
    }

    setIsTransactionLoading(true);
    
    try {
      const signer = await getSigner();
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      if (currentAction === 'vote') {
        // Handle voting
        if (feePercentage === undefined) {
          throw new Error('Fee percentage is required for voting');
        }
        await hookVoteForLPFee(tokenAddress, feePercentage, signer);
        addNotification(`Vote submitted for ${feePercentage}% fee!`, 'success');
      } else if (currentAction === 'deposit') {
        // Handle deposit transaction
        await hookDeposit(tokenAddress, amount, signer);
        addNotification(`Successfully deposited ${amount} ${poolData?.symbol}!`, 'success');
      } else if (currentAction === 'approve') {
        // Handle approve transaction
        await hookApprove(tokenAddress, amount, signer);
        addNotification(`Successfully approved ${amount} ${poolData?.symbol} for spending!`, 'success');
      } else if (currentAction === 'withdraw') {
        // Handle withdraw transaction based on type
        if (withdrawType === 'fees') {
          await hookWithdrawFees(tokenAddress, signer);
          addNotification(`Successfully withdrew fees from ${poolData?.symbol}!`, 'success');
        } else {
          // Default to full withdrawal
          await hookWithdraw(tokenAddress, signer);
          addNotification(`Successfully withdrew ${poolData?.symbol}!`, 'success');
        }
      }
      
      closeModal();
      
      // Clear cache and wait a moment for blockchain state to propagate
      clearCache();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      // Refresh data after successful transaction
      await refresh();
      // Also refresh wallet balance to ensure UI is up to date
      await fetchWalletBalance();
    } catch (error) {
      console.error('Transaction failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addNotification(`Transaction failed: ${errorMessage}`, 'error');
      setIsTransactionLoading(false);
    }
  };

  const getAvailableFees = () => {
    if (!poolData || !userPosition?.withdrawable?.fees) {
      return '0';
    }
    
    try {
      const feesAmount = userPosition.withdrawable.fees;
      
      if (feesAmount && feesAmount !== '0') {
        const formatted = ethers.formatUnits(feesAmount, poolData.decimals || 18);
        return formatted;
      } else {
        return '0';
      }
    } catch (error) {
      console.log('Error formatting fees:', error);
      return '0';
    }
  };

  const getAvailableBalance = () => {
    if (!poolData) {
      return '0';
    }
    
    switch (currentAction) {
      case 'deposit':
        // Convert from wei to formatted number for the modal
        if (walletBalance && walletBalance !== '0') {
          try {
            const formatted = ethers.formatUnits(walletBalance, poolData.decimals || 18);
            return formatted;
          } catch (error) {
            console.log('Error formatting deposit balance:', error);
            return '0';
          }
        } else {
          return '0';
        }
      case 'withdraw':
        const withdrawAmount = userPosition?.withdrawable?.netAmount || '0';
        // Convert from wei to formatted number for the modal
        if (withdrawAmount && withdrawAmount !== '0') {
          try {
            const formatted = ethers.formatUnits(withdrawAmount, poolData.decimals || 18);
            return formatted;
          } catch (error) {
            console.log('Error formatting withdraw balance:', error);
            return '0';
          }
        } else {
          return '0';
        }
      case 'vote':
        return '0'; // Not used for vote action
      default:
        return '0';
    }
  };

  return (
    <div className="dash-container">
      {/* Main Content: Pool Details (Left) and User Position/Actions (Right) */}
      <div className="pool-container">
        
        {/* Left Side: Pool Details */}
        <div>
          {/* Pool Statistics */}
          <div className="card surface">
            <div className="card-head">
              <div className="pool-header">
              <div className="pool-header-info">
                <div className="token-avatar">
                  <img 
                    src={getTokenIconUrl(poolData.address)}
                    alt={`${poolData.symbol} logo`}
                    className="token-icon"
                    onError={handleImageError}
                  />
                  <div className="avatar pool-avatar-fallback" />
                </div>
                <div>
                  <h3 className="pool-title">{poolData.symbol || 'Unknown'} Pool</h3>
                  <div className="pool-subtitle">
                    {poolData.name || 'No name available'}
                  </div>
                  <div className="pool-address">
                    {poolData.address}
                  </div>
                </div>
              </div>
            </div>
            </div>
            <div className="padding-standard">
              <div className="pool-stats-grid">
                <div className="stat-card">
                  <div className="stat-label">
                    Total Value Locked
                  </div>
                  <div className="stat-value">
                    {poolData.formattedLiquidity || poolData.totalLiquidity} {poolData.symbol || 'Tokens'}
                  </div>
                </div>
                
                <div className="stat-card">
                  <div className="stat-label">
                    Total Shares
                  </div>
                  <div className="stat-value">
                    {poolData.totalShares && poolData.decimals 
                      ? Number(ethers.formatUnits(poolData.totalShares, poolData.decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : 'N/A'
                    }
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">
                    LP Fee
                  </div>
                  <div className="stat-value">
                    {((poolData.lpFee || 0) / 100).toFixed(2)}%
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">
                    APY
                  </div>
                  <div className="stat-value">
                    {(() => {
                      console.log('APY display - poolData.apy:', poolData.apy);
                      return poolData.apy !== undefined ? `${poolData.apy.toFixed(2)}%` : 'N/A';
                    })()}
                  </div>
                </div>
              </div>
            </div>
            {poolStatistics && (
            <div className="padding-standard-y">
              <div className="pool-stats-grid-3">
                <div className="stat-card">
                  <div className="stat-label-sm">
                    Total Flash Loans
                  </div>
                  <div className="stat-value-purple">
                    {poolStatistics.totalFlashLoans}
                  </div>
                </div>
                
                <div className="stat-card">
                  <div className="stat-label-sm">
                    Unique Users
                  </div>
                  <div className="stat-value-sm">
                    {poolStatistics.uniqueUsers}
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-label-sm">
                    Fees Collected
                  </div>
                  <div className="stat-value-green">
                    {formatAmount(poolStatistics.totalFeesCollected, poolData.decimals, poolData.symbol)}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Fee Governance Section */}
          <div className="card surface margin-top">
            <div className="card-head">
              <h3>Fee Governance</h3>
            </div>
            <div className="padding-standard">
              {feeGovernance.length > 0 ? (
                <div className="overflow-auto">
                  <table className="governance-table">
                    <thead>
                      <tr>
                        <th>Fee %</th>
                        <th>Percentage</th>
                        <th>Status</th>
                        {hasUserPosition && (
                          <th className="center">Vote</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {feeGovernance.map((vote) => (
                        <tr key={vote.fee} className={vote.isActive ? 'active' : ''}>
                          <td className="governance-fee-percentage">
                            <strong>{(vote.fee / 100).toFixed(2)}%</strong>
                          </td>
                          <td>
                            <div className="governance-percentage">
                              <div className="governance-progress-bar">
                                <div 
                                  className="governance-progress-fill"
                                  style={{'--percentage': `${vote.percentage}%`} as React.CSSProperties}
                                />
                              </div>
                              <span className="governance-percentage-text">
                                {vote.percentage.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            {vote.isActive ? (
                              <span className="status-badge active">
                                ✓ Active
                              </span>
                            ) : (
                              <span className="status-badge voted">
                                Voted
                              </span>
                            )}
                          </td>
                          {hasUserPosition && (
                            <td className="center">
                              <button
                                onClick={() => openModal('vote')}
                                disabled={!isConnected || vote.isActive}
                                className={`vote-button ${
                                  vote.isActive 
                                    ? 'disabled' 
                                    : userPosition?.voteSelection === vote.fee
                                      ? 'user-voted'
                                      : 'available'
                                }`}
                              >
                                {userPosition?.voteSelection === vote.fee ? 'Voted' : 'Vote'}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="center-content large">
                  <div className="no-governance-icon">
                    🗳️
                  </div>
                  <div className="governance-title">
                    No governance data
                  </div>
                  <div className="governance-subtitle">
                    No fee votes have been recorded for this pool yet.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity Tabs */}
          <div className="card surface margin-top">
            <div className="card-head">
              <div className="tabs-container">
                <button 
                  onClick={() => setActiveTab('user')}
                  className={`tab-button ${activeTab === 'user' ? 'active' : 'inactive'}`}
                >
                  Your Activity
                </button>
                <button 
                  onClick={() => setActiveTab('pool')}
                  className={`tab-button ${activeTab === 'pool' ? 'active' : 'inactive'}`}
                >
                  Pool Activity
                </button>
              </div>
            </div>
            <div className="padding-standard">
              {isLoadingActions ? (
                <div className="center-content">
                  <div>Loading activity...</div>
                </div>
              ) : (
                <>
                  {activeTab === 'user' && poolData && (
                    <ActivityList 
                      actions={userActions}
                      poolData={poolData}
                      isConnected={isConnected}
                      showUser={false}
                    />
                  )}

                  {activeTab === 'pool' && poolData && (
                    <ActivityList 
                      actions={poolActions}
                      poolData={poolData}
                      isConnected={true}
                      showUser={true}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: User Position and Actions */}
        <div>
          {/* User Position Section */}
          {isConnected ? (
            <div className="card surface">
              <div className="card-head">
                <h3>Your Position</h3>
              </div>
              <div className="padding-standard">
                {hasUserPosition ? (
                  <div className="user-position-grid">
                    <div className="stat-card">
                      <div className="stat-label">
                        Your Deposits
                      </div>
                      <div className="stat-value-sm">
                        {userPosition.deposits && poolData.decimals
                          ? `${Number(ethers.formatUnits(userPosition.deposits, poolData.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${poolData.symbol || 'Tokens'}`
                          : 'N/A'
                        }
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">
                        Your Shares
                      </div>
                      <div className="stat-value-sm">
                        {userPosition.sharePercentage !== undefined
                          ? `${userPosition.sharePercentage.toFixed(4)}%`
                          : 'N/A'
                        }
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">
                        Withdrawable Amount
                      </div>
                      <div className="stat-value-green">
                        {userPosition.withdrawable?.netAmount && poolData.decimals
                          ? `${Number(ethers.formatUnits(userPosition.withdrawable.netAmount, poolData.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${poolData.symbol || 'Tokens'}`
                          : 'N/A'
                        }
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">
                        Earned on Fees
                      </div>
                      <div className="stat-value-accent">
                        {userPosition.withdrawable?.fees && poolData.decimals
                          ? `${Number(ethers.formatUnits(userPosition.withdrawable.fees, poolData.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${poolData.symbol || 'Tokens'}`
                          : '0'
                        }
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">
                        Fee Selected
                      </div>
                      <div className="stat-value-sm">
                        {userPosition.voteSelection ? `${(userPosition.voteSelection / 100).toFixed(2)}%` : 'No vote'}
                      </div>
                      {userPosition.voteSelection && proposalStatus && (
                        <div className="pool-proposal-status-note">
                          {proposalStatus.canExecute 
                            ? '✅ Ready to execute' 
                            : proposalStatus.exists 
                            ? `⏳ ${proposalStatus.blocksRemaining} blocks remaining`
                            : '📝 Needs proposal'}
                        </div>
                      )}
                    </div>
                    {shouldShowChangeFeeButton() && (
                      <div className="row-actions center">
                        <button 
                          className="btn-lg primary" 
                          onClick={handleChangeFee} 
                          disabled={!isConnected || isLoadingFeeChange || isLoadingProposal}
                        >
                          {getChangeFeeButtonText()}
                        </button>
                      </div>
                    )}
                    <div className="row-actions center">
                      {isConnected && address && tokenAddress ? (
                        (() => {
                          const buttonState = getButtonState(tokenAddress);
                          const showApprove = shouldShowApproveButton(tokenAddress);
                          const showDeposit = shouldShowDepositButton(tokenAddress);
                          
                          if (buttonState === 'none') {
                            return (
                              <button 
                                className="btn-md outline" 
                                disabled
                              >
                                No Balance Data
                              </button>
                            );
                          }
                          
                          // Show approve and/or deposit buttons based on state (users with no balance won't see buttons)
                          if (!showApprove && !showDeposit) {
                            return null; // No buttons to show
                          }
                          
                          return (
                            <>
                              {showApprove && (
                                <button 
                                  className={`btn-md primary ${showDeposit ? 'pool-approve-button-with-margin' : 'pool-approve-button-no-margin'}`}
                                  onClick={() => openModal('approve')}
                                >
                                  Approve
                                </button>
                              )}
                              {showDeposit && (
                                <button 
                                  className="btn-md success" 
                                  onClick={() => openModal('deposit')}
                                >
                                  Deposit
                                </button>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <button 
                          className="btn-md success" 
                          onClick={() => openModal('deposit')}
                          disabled={!isConnected}
                        >
                          Deposit
                        </button>
                      )}
                      {hasUserPosition && (
                        <>
                          <button 
                            className="btn-md success" 
                            onClick={() => openModal('withdraw')}
                            disabled={!isConnected}
                          >
                            Withdraw 
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="center-content">
                    <div className="margin-bottom text-secondary">
                      You don't have any deposits in this pool yet.
                    </div>
                    <div className="text-small margin-bottom-lg">
                      Start earning fees by providing liquidity to this pool.
                    </div>
                    <div className="row-actions center">
                      {isConnected && address && tokenAddress ? (
                        (() => {
                          const buttonState = getButtonState(tokenAddress);
                          const showApprove = shouldShowApproveButton(tokenAddress);
                          const showDeposit = shouldShowDepositButton(tokenAddress);
                          
                          if (buttonState === 'none') {
                            return (
                              <button 
                                className="btn-lg outline" 
                                disabled
                              >
                                No Balance Data
                              </button>
                            );
                          }
                          
                          // Show approve and/or deposit buttons based on state (users with no balance won't see buttons)
                          if (!showApprove && !showDeposit) {
                            return null; // No buttons to show
                          }
                          
                          return (
                            <>
                              {showApprove && (
                                <button 
                                  className={`btn-lg primary ${showDeposit ? 'pool-approve-button-with-margin' : 'pool-approve-button-no-margin'}`}
                                  onClick={() => openModal('approve')}
                                >
                                  Approve
                                </button>
                              )}
                              {showDeposit && (
                                <button 
                                  className="btn-lg success" 
                                  onClick={() => openModal('deposit')}
                                >
                                  Deposit
                                </button>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <button 
                          className="btn-lg success" 
                          onClick={() => openModal('deposit')} 
                          disabled={!isConnected}
                        >
                          Deposit
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card surface">
              <div className="card-head">
                <h3>Connect Wallet</h3>
              </div>
              <div className="padding-standard center-content">
                <div className="margin-bottom text-secondary">
                  Connect your wallet to view your position and interact with this pool.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Modal */}
      <ActionModal
        isOpen={isModalOpen}
        onClose={closeModal}
        action={currentAction}
        tokenSymbol={poolData?.symbol}
        tokenDecimals={poolData?.decimals}
        availableBalance={getAvailableBalance()}
        availableFees={getAvailableFees()}
        currentVoteFee={userPosition?.voteSelection ? userPosition.voteSelection / 100 : 0}
        onConfirm={handleModalConfirm}
        isLoading={isTransactionLoading}
      />
    </div>
  );
}
