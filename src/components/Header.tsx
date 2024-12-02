import React from 'react';
import { Home } from 'lucide-react';

interface HeaderProps {
  onHomeClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onHomeClick }) => {
  return (
    <header className="bg-white shadow">
      <div className="container mx-auto px-4">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onHomeClick}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 
                       rounded-full transition-colors"
              title="Return to Mode Selection"
            >
              <Home size={24} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">SIO2 LIQUIBASE HUB</h1>
          </div>
        </div>
      </div>
    </header>
  );
};