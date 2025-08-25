# Claude Configuration for ERC20 Flash Lender Project

## Project Overview
This is a decentralized finance (DeFi) application built with React, TypeScript, and Ethereum smart contracts. The app provides flash loan functionality for ERC20 tokens with user-friendly pool management.

## Architecture & Tech Stack
- **Frontend**: React 18 with TypeScript
- **Web3**: Wagmi + RainbowKit for wallet connections
- **Smart Contracts**: Hardhat development environment
- **Styling**: CSS modules with custom properties for theming
- **State Management**: React Context API for global state
- **Data Layer**: Custom service classes with caching

## Code Style & Conventions

### TypeScript
- Use strict TypeScript with proper type definitions
- Prefer interfaces over types for object shapes
- Use meaningful generic names (not just `T`, `U`)
- Always define return types for functions
- Use optional chaining (`?.`) for safe property access
- All types definitions go to the types folder

### React Components
- Use functional components with hooks
- Prefer `useCallback` and `useMemo` for performance optimization
- Follow the pattern: imports → interfaces → component → export
- Use descriptive prop names and always define prop interfaces
- Implement proper error boundaries

### File Organization
```
components/
├── common/           # Reusable UI components
│   └── modal/       # Modal system with BaseModal, ModalActions, etc.
├── pages/           # Route-level components
└── LazyComponents.tsx # Lazy-loaded component definitions

hooks/               # Custom React hooks
services/           # Business logic and API services
context/            # React Context providers
types/              # TypeScript type definitions
styles/             # CSS and styling files
```

### State Management Patterns
- Use React Context for global state (settings, notifications, theme)
- Custom hooks for complex state logic (`useFlashLender`, `useDashboardData`)
- Service classes for data fetching with built-in caching
- Separate raw blockchain data types (`TokenPool`) from UI-ready types (`TokenPoolData`)

### Web3 Integration
- Use Wagmi hooks for blockchain interactions
- Separate signer operations from read-only operations  
- Always handle network errors gracefully
- Cache blockchain data appropriately with invalidation strategies

### Modal System
- Use the unified modal system in `components/common/modal/`
- `BaseModal` for consistent styling and behavior
- `ModalActions` and `StandardActions` for button layouts
- `ModalLoading` for consistent loading states
- Each modal should be self-contained with proper error handling

## Coding Preferences

### Error Handling
- Always use try-catch blocks for async operations
- Provide meaningful error messages to users
- Log errors to console with context
- Gracefully degrade functionality when possible

### Performance
- Use React.memo for expensive components
- Implement proper dependency arrays in useEffect/useCallback
- Debounce user inputs and API calls
- Use lazy loading for route components

### Accessibility
- Include proper ARIA labels
- Support keyboard navigation
- Provide alt text for images
- Use semantic HTML elements

### Data Flow
```
Blockchain → Service Layer → Custom Hooks → React Components → UI
              ↓
         Raw Types (TokenPool) → Formatted Types (PoolData) → Display
```

## Domain Knowledge

### Flash Loans
- Users deposit tokens into pools to earn fees
- Borrowers can take flash loans (no collateral, same-transaction repayment)
- LP fees are dynamically voted on by liquidity providers
- APY calculations are based on recent flash loan activity

### Key Concepts
- **Pool**: A liquidity pool for a specific ERC20 token
- **Position**: A user's deposit/stake in a pool
- **Shares**: Represent proportional ownership of pool liquidity
- **LP Fee**: Fee charged to borrowers, earned by liquidity providers
- **APY**: Annual Percentage Yield calculated from recent activity

## Development Guidelines

### When Adding New Features
1. Define TypeScript interfaces first
2. Create service layer methods if needed
3. Build custom hooks for state management
4. Implement UI components with proper error handling
5. Add to the unified modal system if applicable

### Testing Approach
- Focus on user workflows and error scenarios
- Test wallet connection states
- Verify transaction flows with proper loading states
- Ensure responsive design across screen sizes

### Performance Monitoring
- Watch for unnecessary re-renders
- Monitor bundle size with lazy loading
- Cache expensive calculations
- Optimize blockchain calls, use multicall when possible

### Error Boundary Usage
- Wrap main app sections with ErrorBoundary
- Provide fallback UI for component errors
- Log errors for debugging

## Preferred Solutions

### For State Management
- Use Context + custom hooks pattern
- Avoid prop drilling with proper context structure
- Keep context focused (separate Settings, Notifications, etc.)

### For Styling
- Use CSS custom properties for theming
- Responsive design with CSS Grid/Flexbox
- Component-scoped CSS classes
- Dark/light mode support
- All styles go to the styles folder, dont use inline css.

### For Async Operations
- Always show loading states
- Provide user feedback for all actions
- Handle network failures gracefully
- Use optimistic updates where appropriate

---

## Instructions for Claude

When working on this project:
1. **Follow the established patterns** - Look at existing code before creating new patterns
2. **Maintain type safety** - Always provide proper TypeScript types
3. **Consider performance** - Use appropriate React optimizations
4. **Handle errors** - Every async operation should have error handling
5. **Keep it accessible** - Follow ARIA guidelines and semantic HTML
6. **Test thoroughly** - Consider edge cases and error scenarios
7. **Document changes** - Update types and interfaces when needed

Remember: This is a financial application handling real value, so prioritize security, user experience, and code reliability.
