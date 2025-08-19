/**
 * Modal Components System
 * 
 * This folder contains all modal-related components for the application.
 * The system is designed with reusability and consistency in mind.
 * 
 * Architecture:
 * - BaseModal: Core modal wrapper with overlay, title, close button
 * - ModalActions: Reusable action button layouts
 * - ModalLoading: Standard loading animation component
 * - Specific Modals: ActionModal, NewTokenDepositModal, DiscoverTokensModal
 * 
 * Usage Examples:
 * 
 * 1. Using BaseModal for custom modals:
 * ```tsx
 * import { BaseModal, StandardActions } from '../common/modal';
 * 
 * <BaseModal isOpen={isOpen} onClose={onClose} title="Custom Modal">
 *   <p>Custom content here</p>
 *   <StandardActions onCancel={onClose} onConfirm={handleConfirm} />
 * </BaseModal>
 * ```
 * 
 * 2. Using specific modals:
 * ```tsx
 * import { ActionModal, DiscoverTokensModal } from '../common/modal';
 * ```
 * 
 * Features:
 * - Consistent styling across all modals
 * - Reusable action buttons and loading states
 * - Accessibility support (ESC key, focus management)
 * - Dark mode support through CSS variables
 * - Responsive design
 */

// Base modal components
export { default as BaseModal } from './BaseModal';
export type { BaseModalProps } from './BaseModal';

export { default as ModalActions, StandardActions } from './ModalActions';
export type { ModalActionsProps, StandardActionsProps } from './ModalActions';

export { default as ModalLoading } from './ModalLoading';
export type { ModalLoadingProps } from './ModalLoading';

// Specific modal implementations
export { default as ActionModal } from './ActionModal';
export { default as NewTokenDepositModal } from './NewTokenDepositModal';
export { default as DiscoverTokensModal } from './DiscoverTokensModal';

// Re-export types from ActionModal for backward compatibility
export type { ActionType, WithdrawType } from './ActionModal';
