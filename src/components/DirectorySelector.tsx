import React from 'react';
import { FolderOpen } from 'lucide-react';

interface DirectorySelectorProps {
  onSelect: (directory: string) => void;
}

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
        // Log for debugging
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-4xl text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Liquibase Change Tracker</h1>
        <p className="text-lg text-gray-600">Manage and track your database changes with confidence</p>
      </div>
      
      <div className="w-full max-w-md">
        <div className="bg-white shadow-lg rounded-lg px-8 pt-6 pb-8 mb-4">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Select Working Directory</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="directory">
                Directory Path
              </label>
              <div className="flex gap-2">
                <input
                  className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
                    error ? 'border-red-500' : ''
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
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
                  disabled={isValidating}
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <div className="flex items-center justify-end">
              <button
                className={`bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                  isValidating ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                type="submit"
                disabled={isValidating}
              >
                {isValidating ? 'Validating...' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
        
        <p className="text-center text-gray-500 text-sm">
          Select the directory containing your Liquibase changelog files
        </p>
      </div>
    </div>
  );
};