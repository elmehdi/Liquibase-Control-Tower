import React from 'react';
import { ProjectConfig } from '../types';
import { StructureChecker } from '../utils/checker';
import { LogBox } from './LogBox';

interface MainViewProps {
  workingDirectory: string;
  config: ProjectConfig;
}

export const MainView: React.FC<MainViewProps> = ({ workingDirectory, config }) => {
  const [logs, setLogs] = React.useState<string[]>([]);
  const [checking, setChecking] = React.useState(false);

  const handleCheck = async () => {
    setChecking(true);
    setLogs([]);

    const checker = new StructureChecker(workingDirectory);
    await checker.check((result) => {
      setLogs(prev => [...prev, `${result.type === 'error' ? '❌' : result.type === 'success' ? '✅' : result.type === 'warning' ? '⚠️' : ''} [${result.type.toUpperCase()}] [${result.category}]: ${result.message}`]);
    });

    setChecking(false);
  };

  React.useEffect(() => {
    handleCheck();
  }, []);

  return (
    <div className="container mx-auto px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Project Details</h2>
              <p className="text-sm text-gray-500">Author: {config.author}</p>
              <p className="text-sm text-gray-500">Version: {config.version}</p>
            </div>
            <button
              onClick={handleCheck}
              disabled={checking}
              className="px-4 py-2 bg-blue-600 text-white rounded-md 
                       hover:bg-blue-700 focus:outline-none focus:ring-2 
                       focus:ring-blue-500 focus:ring-offset-2
                       disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {checking ? 'Checking...' : 'Check Structure'}
            </button>
          </div>
        </div>

        <LogBox logs={logs} />
      </div>
    </div>
  );
}; 