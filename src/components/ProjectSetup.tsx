import React from 'react';
import { ProjectConfig } from '../types';

interface ProjectSetupProps {
  workingDirectory: string;
  onComplete: (config: ProjectConfig) => void;
}

export const ProjectSetup: React.FC<ProjectSetupProps> = ({ workingDirectory, onComplete }) => {
  const [author, setAuthor] = React.useState('');
  const [version, setVersion] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [needsVersion, setNeedsVersion] = React.useState(false);

  React.useEffect(() => {
    checkTagVersion();
  }, []);

  const checkTagVersion = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/get-version', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workingDirectory })
      });

      const data = await response.json();
      if (data.error) {
        setNeedsVersion(true);
      } else {
        setVersion(data.version);
      }
    } catch (error) {
      setNeedsVersion(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      onComplete({
        author,
        version: version || '',
        categories: [
          { name: 'tables', files: [] },
          { name: 'views', files: [] },
          { name: 'materialized_views', files: [] },
          { name: 'procedures', files: [] },
          { name: 'sequences', files: [] },
        ],
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Project Setup</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="author" className="block text-sm font-medium text-gray-700 mb-1">
                Author Name
              </label>
              <input
                type="text"
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md 
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {needsVersion && (
              <div>
                <label htmlFor="version" className="block text-sm font-medium text-gray-700 mb-1">
                  Version Number
                </label>
                <input
                  type="text"
                  id="version"
                  value={version || ''}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g., 49"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md 
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !author || (needsVersion && !version)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md
                       hover:bg-blue-700 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:ring-offset-2
                       disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};