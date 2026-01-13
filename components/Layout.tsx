import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-ios-bg text-gray-900 pb-20 sm:pb-0">
      <div className="max-w-4xl mx-auto min-h-screen bg-ios-bg sm:border-x sm:border-ios-separator shadow-xl relative">
        {children}
      </div>
    </div>
  );
};
