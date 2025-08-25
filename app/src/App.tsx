import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useCallback } from 'react';

// Detect if we're running on GitHub Pages and get the correct basename
function getBasename(): string {
  const { hostname, pathname } = window.location;
  
  // Check if we're on GitHub Pages
  if (hostname.includes('github.io')) {
    // Extract repo name from pathname (first segment after domain)
    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      return `/${pathSegments[0]}`;
    }
  }
  
  // For local development or custom domains, no basename needed
  return '';
}
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import NotificationDisplay from './components/common/NotificationDisplay';
import ErrorBoundary from './components/common/ErrorBoundary';
import './styles/styles.css';
import './styles/rainbowkit.css';
import { useAppReady, useOnAppReady } from './hooks/useAppReady';
import { useWagmiConnection } from './hooks/useWagmiConnection';
import Loading from './components/common/Loading';
import {
  LazyConnectWallet,
  LazyTokens,
  LazyWallet,
  LazyActivity,
  LazyPool,
  LazySettings,
  LazyHelp,
  LazyAbout,
  LazyApi
} from './components/LazyComponents';
import { NotificationProvider } from './context/NotificationContext';
import { SettingsProvider, useTheme } from './context/SettingsContext';
import { TokenProvider } from './context/TokensContext';
import boltGreen from './assets/bolt_green.png';
import boltWhite from './assets/bolt_green_border.png';
import { darkTheme, lightTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';

// Separate component that uses the theme context
function AppContent() {
  const onAppReadyCallback = useCallback(async () => {
  }, []);

  useOnAppReady(onAppReadyCallback);

  const { fullyReady } = useAppReady();
  const { showConnectWallet, showLoading } = useWagmiConnection();
  const { isDarkMode } = useTheme(); // Now this is inside ThemeProvider

  return (
    <RainbowKitProvider theme={isDarkMode ? darkTheme() : lightTheme()}>
      <Router basename={getBasename()}>
        <div className="App">
          {/* Side decoration bolts for wide screens */}
          <div className="side-decoration left">
            {!isDarkMode ? ( <img src={boltGreen} /> ) : ( <img src={boltWhite} /> )}
          </div>
          <div className="side-decoration right">
            {!isDarkMode ? ( <img src={boltGreen} /> ) : ( <img src={boltWhite} /> )}
          </div>
          {(!fullyReady || showLoading) ? (
              <Loading />
            ) : showConnectWallet ? (
              <LazyConnectWallet />
            ) : (
            <div className="app-content">
              <Navbar />
              <NotificationDisplay />
              <Routes>
                <Route path="/" element={<LazyTokens />} />
                <Route path="/wallet/:userAddress" element={<LazyWallet />} />
                <Route path="/activity/:userAddress" element={<LazyActivity />} />
                <Route path="/pool/:tokenAddress" element={<LazyPool />} />
                <Route path="/settings" element={<LazySettings />} />
                <Route path="/help" element={<LazyHelp />} />
                <Route path="/about" element={<LazyAbout />} />
                <Route path="/api" element={<LazyApi />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <Footer />
            </div>
          )}
        </div>
      </Router>
    </RainbowKitProvider>
  );
}

// Main App component that provides the theme context
function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <SettingsProvider>
          <TokenProvider>
            <AppContent />
          </TokenProvider>
        </SettingsProvider>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;