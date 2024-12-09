import React, { useState } from 'react';
import { LogBox } from './LogBox';

interface InstallerProps {
  workingDirectory: string;
}

type LiquibaseCommand = 'validate' | 'update' | 'status' | 'rollback' | 'tag';

interface CommandOption {
  command: LiquibaseCommand;
  label: string;
  description: string;
  icon?: React.ReactNode;
}

export const Installer: React.FC<InstallerProps> = ({ workingDirectory }) => {
  const [selectedCommand, setSelectedCommand] = useState<LiquibaseCommand | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const commandOptions: CommandOption[] = [
    {
      command: 'validate',
      label: 'Validate Changelogs',
      description: 'Checks if changelog files are correctly formatted and can be executed'
    },
    {
      command: 'status',
      label: 'Check Status',
      description: 'Shows which changesets need to be applied to the database'
    },
    {
      command: 'update',
      label: 'Update Database',
      description: 'Applies pending changesets to the database'
    },
    {
      command: 'rollback',
      label: 'Rollback Changes',
      description: 'Reverts database changes to a specific tag or number of changes'
    },
    {
      command: 'tag',
      label: 'Create Tag',
      description: 'Creates a new tag in the database for rollback purposes'
    }
  ];

  const executeCommand = async (command: LiquibaseCommand) => {
    setIsExecuting(true);
    setLogs(prev => [...prev, `Executing liquibase ${command}...`]);

    try {
      const response = await fetch('http://localhost:3000/api/liquibase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          workingDirectory,
          options: {
            ...(command === 'rollback' && { count: 1 }),
            ...(command === 'tag' && { tag: 'v1.0' })
          }
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        setLogs(prev => [
          ...prev,
          `❌ Error: ${data.error}`,
          `Command: ${data.command}`,
          ...(data.logs || []).map((log: string) => `  ${log}`)
        ]);
      } else {
        setLogs(prev => [
          ...prev,
          `✅ Command executed successfully:`,
          `Command: ${data.command}`,
          ...(data.logs || []).map((log: string) => `  ${log}`)
        ]);
      }
    } catch (error) {
      setLogs(prev => [...prev, `❌ Failed to execute command: ${error}`]);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="container mx-auto px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Liquibase Command Execution
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {commandOptions.map((option) => (
              <button
                key={option.command}
                onClick={() => executeCommand(option.command)}
                disabled={isExecuting}
                className="p-4 border rounded-lg hover:bg-gray-50 
                         text-left transition-colors duration-200
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <h3 className="font-medium text-gray-800">{option.label}</h3>
                <p className="text-sm text-gray-500">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        <LogBox logs={logs} />
      </div>
    </div>
  );
}; 