import React from 'react';
import { FolderOpen } from 'lucide-react';

interface DirectorySelectorProps {
  onSelect: (path: string) => void;
}

export const DirectorySelector: React.FC<DirectorySelectorProps> = ({ onSelect }) => {
  const [inputPath, setInputPath] = React.useState('C:\\Users\\efetouak\\OneDrive - Capgemini\\Desktop\\BzBz\\testo');
  const [error, setError] = React.useState('');

  const validateDirectory = async (path: string) => {
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
      setError('Failed to validate directory. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!inputPath.trim()) {
      setError('Please enter a directory path');
      return;
    }
    await validateDirectory(inputPath);
  };

  const handleBrowse = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/browse-directory', {
        method: 'POST',
      });
      
      const data = await response.json();
      if (data.path) {
        setInputPath(data.path);
        await validateDirectory(data.path);
      }
    } catch (error) {
      setError('Failed to open folder dialog. Please try entering the path manually.');
    }
  };

  return (
    <div className="container mx-auto px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
          Select Working Directory
        </h2>
        
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col">
              <label htmlFor="path" className="text-sm font-medium text-gray-700 mb-1">
                Directory Path
              </label>
              <div className="flex gap-2">
                <input
                  id="path"
                  type="text"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  placeholder="Enter directory path"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md 
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md 
                           hover:bg-gray-200 focus:outline-none focus:ring-2 
                           focus:ring-blue-500 focus:ring-offset-2
                           flex items-center justify-center border border-gray-300"
                >
                  <FolderOpen size={20} />
                </button>
              </div>
              {error && (
                <span className="text-red-500 text-sm mt-1">{error}</span>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md 
                       hover:bg-blue-700 focus:outline-none focus:ring-2 
                       focus:ring-blue-500 focus:ring-offset-2
                       flex items-center justify-center gap-2"
            >
              Select Directory
            </button>
          </form>
        </div>

        <p className="mt-4 text-sm text-gray-500 text-center">
          Select the root directory of your Liquibase project
        </p>
      </div>
    </div>
  );
};