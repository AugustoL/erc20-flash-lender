import { lazy, Suspense } from 'react';
import Loading from './common/Loading';

// Lazy load page components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Wallet = lazy(() => import('./pages/Wallet'));
const Activity = lazy(() => import('./pages/Activity'));
const Pool = lazy(() => import('./pages/Pool'));
const Settings = lazy(() => import('./pages/Settings'));
const Help = lazy(() => import('./pages/Help'));
const About = lazy(() => import('./pages/About'));
const ConnectWallet = lazy(() => import('./pages/ConnectWallet'));

// Higher-order component to wrap lazy components with Suspense
export const withSuspense = (Component: React.ComponentType<any>) => {
  return function SuspenseWrapper(props: any) {
    return (
      <Suspense fallback={<Loading />}>
        <Component {...props} />
      </Suspense>
    );
  };
};

// Export lazy components wrapped with Suspense
export const LazyDashboard = withSuspense(Dashboard);
export const LazyWallet = withSuspense(Wallet);
export const LazyActivity = withSuspense(Activity);
export const LazyPool = withSuspense(Pool);
export const LazySettings = withSuspense(Settings);
export const LazyHelp = withSuspense(Help);
export const LazyAbout = withSuspense(About);
export const LazyConnectWallet = withSuspense(ConnectWallet);

// Default exports for backward compatibility
export {
  Dashboard,
  Wallet,
  Activity,
  Pool,
  Settings,
  Help,
  About,
  ConnectWallet
};