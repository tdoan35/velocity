import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { navigationMetrics } from '../../utils/performance/navigationMetrics';

interface NavigationTrackerProps {
  children: React.ReactNode;
}

export function NavigationTracker({ children }: NavigationTrackerProps) {
  const location = useLocation();

  useEffect(() => {
    // Track page navigation
    const pathname = location.pathname;
    let pageName = 'unknown';
    
    // Determine page name for tracking
    if (pathname.includes('/editor')) {
      pageName = 'editor';
    } else if (pathname.match(/\/project\/[^/]+\/?$/)) {
      pageName = 'design';
    } else if (pathname.includes('/dashboard')) {
      pageName = 'dashboard';
    } else if (pathname === '/') {
      pageName = 'home';
    }

    // Start tracking navigation
    const previousPage = sessionStorage.getItem('velocity-current-page');
    if (previousPage && previousPage !== pageName) {
      navigationMetrics.startNavigation(previousPage, pageName);
    }
    
    sessionStorage.setItem('velocity-current-page', pageName);
    
    // End navigation tracking after a short delay to allow for component mounting
    const timer = setTimeout(() => {
      navigationMetrics.endNavigation();
    }, 50);

    return () => clearTimeout(timer);
  }, [location]);

  useEffect(() => {
    // Track component remounts
    navigationMetrics.recordComponentRemount();
  }, []);

  return <>{children}</>;
}