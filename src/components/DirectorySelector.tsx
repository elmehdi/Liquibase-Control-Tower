import React from 'react';
import { FolderOpen, Database, Settings, GitBranch, FileCode, Server } from 'lucide-react';
import { motion } from 'framer-motion';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

interface DirectorySelectorProps {
  onSelect: (directory: string) => void;
}

// 3D Icon component
const FloatingIcon: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  position: { x: number; y: number };
  delay?: number;
}> = ({ icon, tooltip, position, delay = 0 }) => {
  return (
    <Tippy content={tooltip}>
      <motion.div
        className="absolute text-blue-600/80"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ 
          scale: 1, 
          opacity: 1,
          y: [position.y - 5, position.y + 5, position.y - 5],
          rotateZ: [-5, 5, -5]
        }}
        transition={{
          delay,
          y: {
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          },
          rotateZ: {
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }
        }}
        style={{
          left: position.x,
          top: position.y,
          transformStyle: 'preserve-3d',
          perspective: '1000px'
        }}
      >
        {icon}
      </motion.div>
    </Tippy>
  );
};

export const DirectorySelector: React.FC<DirectorySelectorProps> = ({ onSelect }) => {
  const [inputPath, setInputPath] = React.useState('');
  const [error, setError] = React.useState('');
  const [isValidating, setIsValidating] = React.useState(false);

  const validateDirectory = async (path: string) => {
    setIsValidating(true);
    setError('');
    try {
      const response = await fetch('http://localhost:3000/api/validate-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });

      const data = await response.json();
      if (data.valid) {
        onSelect(path);
      } else {
        setError(data.error || 'Invalid directory');
      }
    } catch (error) {
      console.error('Validation error:', error);
      setError('Failed to validate directory. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/browse-directory', {
        method: 'POST'
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else if (data.path) {
        console.log('Received path:', data.path);
        const cleanPath = data.path.replace(/^OK/, '').trim();
        setInputPath(cleanPath);
        await validateDirectory(cleanPath);
      }
    } catch (error) {
      console.error('Browse error:', error);
      setError('Failed to open folder dialog. Please try entering the path manually.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPath.trim()) {
      setError('Please enter a directory path');
      return;
    }
    await validateDirectory(inputPath);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 to-blue-50 p-4">
      {/* Floating 3D Icons */}
      <FloatingIcon
        icon={<Database size={32} className="drop-shadow-lg" />}
        tooltip="Database Management"
        position={{ x: -180, y: -40 }}
      />
      <FloatingIcon
        icon={<Settings size={32} className="drop-shadow-lg" />}
        tooltip="Settings & Configuration"
        position={{ x: 180, y: -80 }}
        delay={0.2}
      />
      <FloatingIcon
        icon={<Settings size={32} className="drop-shadow-lg" />}
        tooltip="Advanced Configuration"
        position={{ x: -150, y: 80 }}
        delay={0.4}
      />
      <FloatingIcon
        icon={<FileCode size={32} className="drop-shadow-lg" />}
        tooltip="Change Scripts"
        position={{ x: 150, y: 40 }}
        delay={0.6}
      />
      <FloatingIcon
        icon={<Server size={32} className="drop-shadow-lg" />}
        tooltip="Database Migrations"
        position={{ x: 0, y: -100 }}
        delay={0.8}
      />

      <div className="w-full max-w-4xl text-center mb-8">
        <motion.h1 
          className="text-4xl font-bold text-gray-900 mb-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Liquibase Change Tracker
        </motion.h1>
        <motion.p 
          className="text-lg text-gray-600"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Manage and track your database changes with confidence
        </motion.p>
      </div>
      
      <motion.div 
        className="w-full max-w-md"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="bg-white shadow-xl rounded-lg px-8 pt-6 pb-8 mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent pointer-events-none" />
          
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Select Working Directory</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6 relative">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="directory">
                Directory Path
              </label>
              <div className="flex gap-2">
                <input
                  className={`shadow-sm appearance-none border rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           transition-all duration-200 ${
                    error ? 'border-red-500 ring-red-200' : 'border-gray-200'
                  }`}
                  id="directory"
                  type="text"
                  placeholder="Enter directory path"
                  value={inputPath}
                  onChange={(e) => {
                    setInputPath(e.target.value);
                    setError('');
                  }}
                  disabled={isValidating}
                />
                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={isValidating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                           transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-sm hover:shadow-md"
                >
                  <FolderOpen size={20} />
                </button>
              </div>
              {error && (
                <motion.p 
                  className="mt-2 text-red-500 text-sm"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {error}
                </motion.p>
              )}
            </div>

            <button
              type="submit"
              disabled={isValidating || !inputPath.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 
                       rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                       transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-sm hover:shadow-md"
            >
              {isValidating ? 'Validating...' : 'Continue'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};