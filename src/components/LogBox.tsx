import React from 'react';
import { Terminal } from 'lucide-react';

interface LogBoxProps {
  logs: string[];
}

const LOG_COLORS = {
  '[ERROR]': 'text-red-500',
  '[SUCCESS]': 'text-green-500',
  '[WARNING]': 'text-amber-500',
  '[INFO]': 'text-cyan-500',
  '[SYSTEM]': 'text-blue-500'
};

export const LogBox: React.FC<LogBoxProps> = ({ logs }) => {
  const logEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-800 flex items-center gap-2">
          <Terminal size={20} />
          Logs
        </h3>
      </div>
      <div className="p-4 max-h-[600px] overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-center">No logs yet</p>
        ) : (
          <div className="space-y-1 font-mono text-sm">
            {logs.map((log, index) => {
              // Determine the color based on the log type
              const colorClass = Object.entries(LOG_COLORS).find(([key]) => 
                log.includes(key)
              )?.[1] || 'text-gray-700';

              return (
                <div
                  key={index}
                  className={`${colorClass} whitespace-pre-wrap`}
                >
                  {log}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}; 