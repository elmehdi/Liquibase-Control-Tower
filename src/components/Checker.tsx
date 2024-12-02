import React, { useState } from 'react';
import { LogBox } from './LogBox';
import { StructureChecker } from '../utils/checker';
import { getSuggestion } from '../utils/suggestions';
import { LogEntry, CheckResult } from '../types';
import { PlayIcon, WrenchIcon, XMarkIcon, ArrowPathIcon, PlusCircleIcon } from '@heroicons/react/24/solid';

interface CheckerProps {
  workingDirectory: string;
}

export const Checker: React.FC<CheckerProps> = ({ workingDirectory }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [hasActions, setHasActions] = useState(false);

  const handleCheck = async () => {
    if (!workingDirectory) return;
    window.workingDirectory = workingDirectory;
    
    setIsChecking(true);
    setLogs([]);
    setShowActions(false);
    setHasActions(false);

    const checker = new StructureChecker(workingDirectory);
    const newLogs: LogEntry[] = [];

    await checker.check((result: CheckResult) => {
      const prefix = result.type === 'error' ? '❌' : 
                    result.type === 'success' ? '✅' : 
                    result.type === 'warning' ? '⚠️' : 'ℹ️';
                    
      const logMessage = `${prefix} [${result.type.toUpperCase()}] [${result.category}]: ${result.message}`;
      
      const suggestion = result.type === 'error' ? getSuggestion(result.message) : null;
      if (suggestion) {
        setHasActions(true);
      }

      const logEntry = {
        message: logMessage,
        type: result.type,
        suggestion,
        id: Date.now() + Math.random()
      };

      newLogs.push(logEntry);
      setLogs(prev => [...prev, logEntry]);
    });

    setIsChecking(false);
  };

  const handleAction = async (logId: number, actionHandler: () => Promise<void>) => {
    try {
      await actionHandler();
      setLogs(prev => prev.map(log => 
        log.id === logId ? { ...log, suggestion: null } : log
      ));
      
      setHasActions(prev => {
        const remainingSuggestions = logs.some(log => 
          log.id !== logId && log.suggestion !== null
        );
        if (!remainingSuggestions) {
          setShowActions(false);
        }
        return remainingSuggestions;
      });
    } catch (error) {
      console.error('Action failed:', error);
    }
  };

  return (
    <div className="container mx-auto px-4">
      <div className="flex h-[calc(100vh-200px)]">
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 
                      transition-all duration-300 ${showActions ? 'w-2/3' : 'w-full'}`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800">Structure Check</h2>
            <div className="flex gap-4">
              {hasActions && logs.some(log => log.suggestion) && (
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-md
                           hover:bg-red-200 focus:outline-none focus:ring-2
                           focus:ring-red-500 focus:ring-offset-2
                           flex items-center gap-2"
                >
                  {showActions ? (
                    <>
                      <span>Hide Actions</span>
                      <XMarkIcon className="h-5 w-5" />
                    </>
                  ) : (
                    <>
                      <span>Show Actions</span>
                      <WrenchIcon className="h-5 w-5" />
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleCheck}
                disabled={isChecking}
                className="px-4 py-2 bg-blue-600 text-white rounded-md
                         hover:bg-blue-700 focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:ring-offset-2
                         disabled:bg-blue-300 disabled:cursor-not-allowed
                         flex items-center gap-2"
              >
                {isChecking ? (
                  <>
                    <span>Checking...</span>
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  </>
                ) : (
                  <>
                    <span>Start Check</span>
                    <PlayIcon className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </div>
          <LogBox logs={logs.map(log => log.message)} />
        </div>
        
        {showActions && (
          <div className="w-1/3 ml-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Suggested Actions</h3>
              <div className="space-y-4">
                {logs
                  .filter(log => log.suggestion)
                  .map((log) => (
                    <div key={log.id} className="p-4 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-600 mb-2">{log.message}</p>
                      <div className="flex gap-2">
                        {log.suggestion?.actions.map((action, actionIndex) => (
                          <button
                            key={actionIndex}
                            onClick={() => handleAction(log.id, action.handler)}
                            className="px-3 py-1 bg-blue-100 text-blue-700 rounded
                                     hover:bg-blue-200 focus:outline-none focus:ring-2
                                     focus:ring-blue-500 focus:ring-offset-1
                                     flex items-center gap-2"
                          >
                            <span>{action.label}</span>
                            <PlusCircleIcon className="h-5 w-5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};