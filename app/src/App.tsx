import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useCallback } from 'react';
import Navbar from './components/common/Navbar';
import NotificationDisplay from './components/common/NotificationDisplay';
import ErrorBoundary from './components/common/ErrorBoundary';
import './styles/styles.css';
import './styles/rainbowkit.css';
import { useAppReady, useOnAppReady } from './hooks/useAppReady';
import { useWagmiConnection } from './hooks/useWagmiConnection';
import Loading from './components/common/Loading';
import {
  LazyConnectWallet,
  LazyDashboard,
  LazyWallet,
  LazyActivity,
  LazyPool,
  LazySettings,
  LazyHelp,
  LazyAbout
} from './components/LazyComponents';
import { NotificationProvider } from './context/NotificationContext';
import { SettingsProvider, useTheme } from './context/SettingsContext';
import boltGreen from './assets/bolt_green.png';
import boltWhite from './assets/bolt_green_border.png';
import { darkTheme, lightTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';

// Separate component that uses the theme context
function AppContent() {
  const onAppReadyCallback = useCallback(async () => {
    console.log('🎉 App is fully loaded and ready!');
  }, []);

  useOnAppReady(onAppReadyCallback);

  const { fullyReady } = useAppReady();
  const { showConnectWallet, showLoading } = useWagmiConnection();
  const { isDarkMode } = useTheme(); // Now this is inside ThemeProvider

  return (
    <RainbowKitProvider theme={isDarkMode ? darkTheme() : lightTheme()}>
      <Router>
        {(!fullyReady || showLoading) ? (
          <Loading />
        ) : showConnectWallet ? (
          <LazyConnectWallet />
        ) : (
          <div className="App">
            {/* Side decoration bolts for wide screens */}
            <div className="side-decoration left">
              {!isDarkMode ? ( <img src={boltGreen} /> ) : ( <img src={boltWhite} /> )}
            </div>
            <div className="side-decoration right">
              {!isDarkMode ? ( <img src={boltGreen} /> ) : ( <img src={boltWhite} /> )}
            </div>
            
            <div className="app-content">
              <Navbar />
              <NotificationDisplay />
              <Routes>
                <Route path="/" element={<LazyDashboard />} />
                <Route path="/wallet/:userAddress" element={<LazyWallet />} />
                <Route path="/activity/:userAddress" element={<LazyActivity />} />
                <Route path="/pool/:tokenAddress" element={<LazyPool />} />
                <Route path="/settings" element={<LazySettings />} />
                <Route path="/help" element={<LazyHelp />} />
                <Route path="/about" element={<LazyAbout />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </div>
        )}
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
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </SettingsProvider>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;