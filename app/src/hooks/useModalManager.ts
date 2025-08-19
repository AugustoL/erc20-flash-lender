import { useState } from 'react';
import type { ActionType } from '../components/common/modal';

/**
 * Shared modal management hook
 * Consolidates modal state management across components
 */
export const useModalManager = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewTokenModalOpen, setIsNewTokenModalOpen] = useState(false);
  const [isDiscoverModalOpen, setIsDiscoverModalOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType>('deposit');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  // Main modal handlers
  const openModal = (action: ActionType, tokenAddress?: string) => {
    setCurrentAction(action);
    if (tokenAddress) {
      setSelectedToken(tokenAddress);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsTransactionLoading(false);
  };

  // New token modal handlers
  const openNewTokenModal = (tokenAddress?: string) => {
    if (tokenAddress) {
      setSelectedToken(tokenAddress);
    }
    setIsNewTokenModalOpen(true);
  };

  const closeNewTokenModal = () => {
    setIsNewTokenModalOpen(false);
    setIsTransactionLoading(false);
  };

  // Discover tokens modal handlers
  const openDiscoverModal = () => {
    setIsDiscoverModalOpen(true);
  };

  const closeDiscoverModal = () => {
    setIsDiscoverModalOpen(false);
  };

  // Transaction loading state
  const setTransactionLoading = (loading: boolean) => {
    setIsTransactionLoading(loading);
  };

  return {
    // State
    isModalOpen,
    isNewTokenModalOpen,
    isDiscoverModalOpen,
    currentAction,
    selectedToken,
    isTransactionLoading,
    
    // Actions
    openModal,
    closeModal,
    openNewTokenModal,
    closeNewTokenModal,
    openDiscoverModal,
    closeDiscoverModal,
    setTransactionLoading,
    setSelectedToken
  };
};