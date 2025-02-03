import React, { useState } from 'react';
import { LogBox } from './LogBox';
import { 
  PlayCircle, 
  RotateCcw, 
  Tag, 
  CheckCircle2, 
  AlertCircle,
  Database,
  History,
  RefreshCw,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InstallerProps {
  workingDirectory: string;
}

type LiquibaseCommand = 'validate' | 'update' | 'status' | 'rollback' | 'tag' | 'rollbackCount' | 'updateCount' | 'updateSQL';
type CommandCategory = 'status' | 'deployment' | 'rollback';

interface CommandOption {
  command: LiquibaseCommand;
  category: CommandCategory;
  label: string;
  description: string;
  icon: React.ReactNode;
  requiresInput?: boolean;
  inputType?: 'number' | 'text';
  inputLabel?: string;
  inputPlaceholder?: string;
  buttonColor?: string;
}

export const Installer: React.FC<InstallerProps> = ({ workingDirectory }) => {
  const [selectedCommand, setSelectedCommand] = useState<LiquibaseCommand | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandInput, setCommandInput] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<CommandCategory>('status');

  const commandOptions: CommandOption[] = [
    {
      command: 'status',
      category: 'status',
      label: 'Check Status',
      description: 'Show pending changesets and current database state',
      icon: <AlertCircle size={20} />,
      buttonColor: 'bg-blue-600 hover:bg-blue-700'
    },
    {
      command: 'validate',
      category: 'status',
      label: 'Validate Changelogs',
      description: 'Check if changelog files are correctly formatted',
      icon: <CheckCircle2 size={20} />,
      buttonColor: 'bg-blue-600 hover:bg-blue-700'
    },
    {
      command: 'updateSQL',
      category: 'deployment',
      label: 'Preview Update SQL',
      description: 'Generate SQL for pending changes without executing them',
      icon: <FileText size={20} />,
      buttonColor: 'bg-purple-600 hover:bg-purple-700'
    },
    {
      command: 'update',
      category: 'deployment',
      label: 'Update Database',
      description: 'Apply all pending changesets',
      icon: <PlayCircle size={20} />,
      buttonColor: 'bg-green-600 hover:bg-green-700'
    },
    {
      command: 'updateCount',
      category: 'deployment',
      label: 'Update Count',
      description: 'Apply specific number of pending changesets',
      icon: <Database size={20} />,
      requiresInput: true,
      inputType: 'number',
      inputLabel: 'Number of changesets',
      inputPlaceholder: 'Enter number of changesets',
      buttonColor: 'bg-green-600 hover:bg-green-700'
    },
    {
      command: 'rollback',
      category: 'rollback',
      label: 'Rollback to Tag',
      description: 'Revert database changes to a specific tag',
      icon: <RotateCcw size={20} />,
      requiresInput: true,
      inputType: 'text',
      inputLabel: 'Tag name',
      inputPlaceholder: 'Enter tag name',
      buttonColor: 'bg-amber-600 hover:bg-amber-700'
    },
    {
      command: 'rollbackCount',
      category: 'rollback',
      label: 'Rollback Count',
      description: 'Revert specific number of changesets',
      icon: <History size={20} />,
      requiresInput: true,
      inputType: 'number',
      inputLabel: 'Number of changesets',
      inputPlaceholder: 'Enter number of changesets',
      buttonColor: 'bg-amber-600 hover:bg-amber-700'
    },
    {
      command: 'tag',
      category: 'deployment',
      label: 'Create Tag',
      description: 'Create a new tag in the database for rollback purposes',
      icon: <Tag size={20} />,
      requiresInput: true,
      inputType: 'text',
      inputLabel: 'Tag name',
      inputPlaceholder: 'Enter tag name (e.g., v1.0.0)',
      buttonColor: 'bg-green-600 hover:bg-green-700'
    }
  ];

  const categoryLabels: Record<CommandCategory, { label: string; icon: React.ReactNode; color: string }> = {
    status: { 
      label: 'Status & Validation', 
      icon: <AlertCircle size={16} />,
      color: 'text-blue-600 border-blue-600'
    },
    deployment: { 
      label: 'Deployment', 
      icon: <PlayCircle size={16} />,
      color: 'text-green-600 border-green-600'
    },
    rollback: { 
      label: 'Rollback', 
      icon: <RotateCcw size={16} />,
      color: 'text-amber-600 border-amber-600'
    }
  };

  const executeCommand = async (command: LiquibaseCommand) => {
    setIsExecuting(true);
    setLogs(prev => [...prev, `Executing liquibase ${command}...`]);
    console.log('Executing command with working directory:', workingDirectory);

    try {
      const options: any = {};
      if (commandInput) {
        if (command === 'tag') {
          options.tag = commandInput;
        } else if (command === 'rollback') {
          options.tag = commandInput;
        } else if (command === 'rollbackCount' || command === 'updateCount') {
          options.count = parseInt(commandInput);
        }
      }

      console.log('Sending request with:', { command, workingDirectory, options });
      const response = await fetch('http://localhost:3000/api/liquibase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          workingDirectory,
          options
        }),
      });

      const data = await response.json();
      console.log('Received response:', data);

      if (!data.success) {
        console.error('Command failed:', data.error, data.details);
        setLogs(prev => [
          ...prev,
          `❌ Error executing ${command}:`,
          data.error,
          ...(data.logs || [])
        ]);
      } else {
        setLogs(prev => [
          ...prev,
          `✅ Command executed successfully:`,
          `Command: ${data.command}`,
          ...data.logs
        ]);
      }
    } catch (error) {
      setLogs(prev => [...prev, `❌ Failed to execute command: ${error.message}`]);
    } finally {
      setIsExecuting(false);
      setCommandInput('');
    }
  };

  const filteredCommands = commandOptions.filter(cmd => cmd.category === activeCategory);

  const handleCommandClick = (option: CommandOption) => {
    if (option.requiresInput) {
      setSelectedCommand(selectedCommand === option.command ? null : option.command);
    } else {
      executeCommand(option.command);
    }
  };

  return (
    <div className="w-full px-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="bg-white rounded-lg shadow-sm p-6 backdrop-blur-sm bg-white/80">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between mb-6"
          >
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Database size={24} className="text-blue-500" />
              Liquibase Command Panel
            </h2>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <RefreshCw size={16} className="inline" />
              Working Directory: {workingDirectory}
            </div>
          </motion.div>

          {/* Category Tabs */}
          <div className="flex space-x-4 mb-6 border-b relative">
            {Object.entries(categoryLabels).map(([key, value]) => (
              <motion.button
                key={key}
                onClick={() => setActiveCategory(key as CommandCategory)}
                className={`flex items-center gap-2 px-4 py-2 -mb-px
                           transition-all duration-300 ease-in-out
                           ${activeCategory === key 
                             ? `border-b-2 ${value.color} font-medium` 
                             : 'text-gray-500 border-b-2 border-transparent'}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {value.icon}
                {value.label}
              </motion.button>
            ))}
          </div>
          
          <motion.div 
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6"
          >
            <AnimatePresence mode="wait">
              {filteredCommands.map((option) => (
                <motion.div
                  key={option.command}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col"
                >
                  <motion.button
                    onClick={() => handleCommandClick(option)}
                    disabled={isExecuting}
                    className={`p-4 border rounded-lg
                             text-left transition-all duration-300
                             disabled:opacity-50 disabled:cursor-not-allowed
                             hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
                             h-full backdrop-blur-sm
                             ${(selectedCommand === option.command) 
                               ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-200' 
                               : 'border-gray-200 hover:border-gray-300 bg-white/80'}`}
                    whileHover={{ y: -2 }}
                    whileTap={{ y: 0 }}
                  >
                    <div className="flex items-center gap-2">
                      <motion.div
                        animate={isExecuting && selectedCommand === option.command ? 
                          { rotate: [0, 360] } : {}}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        {option.icon}
                      </motion.div>
                      <h3 className="font-medium text-gray-800">{option.label}</h3>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{option.description}</p>
                    {isExecuting && option.command === selectedCommand && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 text-sm text-blue-600 flex items-center gap-2"
                      >
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="w-2 h-2 bg-blue-600 rounded-full"
                        />
                        Executing...
                      </motion.div>
                    )}
                  </motion.button>
                  
                  <AnimatePresence>
                    {selectedCommand === option.command && option.requiresInput && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 p-4 border border-gray-200 rounded-lg bg-gray-50/80 backdrop-blur-sm"
                      >
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {option.inputLabel}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type={option.inputType}
                            value={commandInput}
                            onChange={(e) => setCommandInput(e.target.value)}
                            placeholder={option.inputPlaceholder}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md 
                                     focus:outline-none focus:ring-2 focus:ring-blue-500
                                     bg-white/80 backdrop-blur-sm transition-all duration-300"
                          />
                          <motion.button
                            onClick={() => executeCommand(option.command)}
                            disabled={!commandInput || isExecuting}
                            className={`px-4 py-2 text-white rounded-md
                                     transition-all duration-300
                                     disabled:opacity-50 disabled:cursor-not-allowed
                                     ${option.buttonColor || 'bg-blue-600 hover:bg-blue-700'}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {isExecuting ? 'Executing...' : 'Execute'}
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        <LogBox logs={logs} />
      </motion.div>
    </div>
  );
};