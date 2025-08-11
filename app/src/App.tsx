import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/common/Navbar';
import NotificationDisplay from './components/common/NotificationDisplay';
import './styles/styles.css';
import './styles/rainbowkit.css';
import { useAppReady, useOnAppReady } from './hooks/useAppReady';
import { useWagmiConnection } from './hooks/useWagmiConnection';
import Loading from './components/common/Loading';
import ConnectWallet from './components/pages/ConnectWallet';
import Dashboard from './components/pages/Dashboard';
import Activity from './components/pages/Activity';
import Pool from './components/pages/Pool';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import boltGreen from './assets/bolt_green.png';
import boltWhite from './assets/bolt_green_border.png';

// Separate component that uses the theme context
function AppContent() {
  useOnAppReady(async () => {
    console.log('🎉 App is fully loaded and ready!');
  });

  const { fullyReady } = useAppReady();
  const { showConnectWallet, showLoading } = useWagmiConnection();
  const { isDarkMode } = useTheme(); // Now this is inside ThemeProvider

  return (
    <Router>
      {(!fullyReady || showLoading) ? (
        <Loading />
      ) : showConnectWallet ? (
        <ConnectWallet />
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
              <Route path="/" element={<Dashboard />} />
              <Route path="/activity/:userAddress" element={<Activity />} />
              <Route path="/pool/:tokenAddress" element={<Pool />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      )}
    </Router>
  );
}

// Main App component that provides the theme context
function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;