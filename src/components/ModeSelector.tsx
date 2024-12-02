import React from 'react';
import { FilePlus2, CheckCircle2, Download } from 'lucide-react';

interface ModeSelectionProps {
  onSelect: (mode: string) => void;
}

interface ModeCard {
  mode: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
}

export const ModeSelector: React.FC<ModeSelectionProps> = ({ onSelect }) => {
  const modes: ModeCard[] = [
    {
      mode: 'build',
      title: 'Build',
      description: 'Generate Liquibase changelog files and SQL templates',
      icon: <FilePlus2 size={24} />,
      available: true,
    },
    {
      mode: 'check',
      title: 'Check',
      description: 'Validate your changelog structure and SQL files',
      icon: <CheckCircle2 size={24} />,
      available: true,
    },
    {
      mode: 'install',
      title: 'Install DEV2',
      description: 'Coming soon...',
      icon: <Download size={24} />,
      available: false,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Select Mode</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modes.map((mode) => (
            <button
              key={mode.mode}
              onClick={() => mode.available && onSelect(mode.mode)}
              className={`p-6 rounded-lg border transition-colors ${
                mode.available
                  ? 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                  : 'border-gray-200 opacity-50 cursor-not-allowed'
              }`}
              disabled={!mode.available}
            >
              <div className="flex flex-col items-center text-center">
                {mode.icon}
                <h3 className="mt-4 font-semibold">{mode.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{mode.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 