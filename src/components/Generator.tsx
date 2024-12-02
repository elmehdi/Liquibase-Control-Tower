import React, { useState, useEffect } from 'react';
import { Download, Plus, PlusCircle, Trash2, FolderGit2, Upload, Code2, Terminal, ChevronDown } from 'lucide-react';

interface GeneratorProps {
  workingDirectory: string;
}

interface SQLFileWithContent {
  name: string;
  content: string;
}

export const Generator: React.FC<GeneratorProps> = ({ workingDirectory }) => {
  const categories = [
    { name: 'tables', label: 'Tables' },
    { name: 'views', label: 'Views' },
    { name: 'materialized_views', label: 'Materialized Views' },
    { name: 'procedures', label: 'Procedures' },
    { name: 'sequences', label: 'Sequences' }
  ];

  const [author, setAuthor] = useState('');
  const [version, setVersion] = useState('');
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [newFileNames, setNewFileNames] = useState<Record<string, string>>({
    tables: '',
    views: '',
    materialized_views: '',
    procedures: '',
    sequences: ''
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [sqlContents, setSqlContents] = useState<Record<string, string>>({});
  
  const [categoryFiles, setCategoryFiles] = useState<Record<string, SQLFileWithContent[]>>({
    tables: [],
    views: [],
    materialized_views: [],
    procedures: [],
    sequences: []
  });

  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  const [warning, setWarning] = useState<string | null>(null);

  const [sqlContent, setSqlContent] = useState('');
  const [showVersionInput, setShowVersionInput] = useState(false);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryName) 
        ? prev.filter(name => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  useEffect(() => {
    const getVersion = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/get-version', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ workingDirectory })
        });

        if (!response.ok) {
          setShowVersionInput(true);
        } else {
          const data = await response.json();
          if (data.version) {
            setVersion(data.version);
          } else {
            setShowVersionInput(true);
          }
        }
      } catch (error) {
        setShowVersionInput(true);
        setLogs(prev => [...prev, `Error getting version: ${error.message}`]);
      }
    };
    getVersion();
  }, []);

  const handleFileUpload = async (category: string, file: File) => {
    try {
      const content = await file.text();
      const name = file.name.replace('.sql', '');
      
      setCategoryFiles(prev => ({
        ...prev,
        [category]: [...prev[category], { name, content }]
      }));
      
      setNewFileNames(prev => ({
        ...prev,
        [category]: ''
      }));
      setSqlContents(prev => ({
        ...prev,
        [category]: ''
      }));
    } catch (error) {
      setLogs(prev => [...prev, `Error reading file: ${error.message}`]);
    }
  };

  const handleSqlContentChange = (category: string, content: string) => {
    setSqlContents(prev => ({
      ...prev,
      [category]: content
    }));
  };

  const handleAddFile = (category: string) => {
    if (!newFileNames[category].trim()) return;
    
    setCategoryFiles(prev => ({
      ...prev,
      [category]: [...prev[category], {
        name: newFileNames[category].trim(),
        content: isAdvancedMode ? (sqlContents[category] || '') : ''
      }]
    }));
    
    setNewFileNames(prev => ({
      ...prev,
      [category]: ''
    }));
    setSqlContent('');
  };

  const handleRemoveFile = (category: string, fileName: string) => {
    setCategoryFiles(prev => ({
      ...prev,
      [category]: prev[category].filter(file => file.name !== fileName)
    }));
  };

  const handleBuild = async () => {
    const hasUnaddedContent = Object.entries(newFileNames).some(([category, fileName]) => fileName.trim() !== '');
    
    if (hasUnaddedContent) {
      setWarning('You have unadded changes. Please add or clear them before building.');
      return;
    }

    const hasFiles = Object.values(categoryFiles).some(files => files.length > 0);
    
    if (!hasFiles) {
      setWarning('Please add at least one file before building.');
      return;
    }

    if (!author.trim()) {
      setWarning('Please enter an author name');
      return;
    }

    setWarning(null);
    setIsBuilding(true);
    setLogs(prev => [...prev, '[INFO] Starting build process...']);

    try {
      // Log files that will be created
      categories.forEach(cat => {
        const files = categoryFiles[cat.name];
        if (files.length > 0) {
          setLogs(prev => [...prev, `\n[INFO] Processing ${cat.label}:`]);
          files.forEach(file => {
            setLogs(prev => [
              ...prev, 
              `   > Creating ${file.name}.xml`,
              `   > Creating ${file.name}.sql ${file.content ? 'with content' : '(empty)'}`
            ]);
          });
        }
      });

      const response = await fetch('http://localhost:3000/api/build-structure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workingDirectory,
          config: {
            author,
            version,
            categories: categories.map(cat => ({
              name: cat.name,
              files: categoryFiles[cat.name].map(file => ({
                name: file.name,
                content: file.content
              }))
            }))
          }
        })
      });

      if (!response.ok) throw new Error('Build failed');
      
      // Log master changelog creation
      setLogs(prev => [
        ...prev,
        '\n[INFO] Creating master changelogs:',
        `   > changelog-SIO2-all.xml`,
        ...categories
          .filter(cat => categoryFiles[cat.name].length > 0)
          .map(cat => `   > changelog-${version}-${cat.name.toUpperCase()}.xml`)
      ]);

      // Clear the built files from the lists
      setCategoryFiles(prev => {
        const newState = { ...prev };
        categories.forEach(cat => {
          newState[cat.name] = [];
        });
        return newState;
      });

      // Clear SQL content and reset current category
      setSqlContent('');
      setCurrentCategory(null);
      
      setLogs(prev => [...prev, '\n[SUCCESS] Build completed successfully']);
    } catch (error) {
      setLogs(prev => [...prev, `\n[ERROR] Build error: ${error.message}`]);
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="container mx-auto px-4">
      {/* Header section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-bold text-gray-800">
              Changelog Structure
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-sm w-48
                            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                            transition-all duration-200"
                  placeholder="Enter author name"
                />
              </div>
              {showVersionInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-md text-sm w-32
                              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                              transition-all duration-200"
                    placeholder="e.g., 49"
                  />
                </div>
              ) : version && (
                <div className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 
                              rounded-md border border-gray-200 font-medium">
                  Version: {version}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {warning && (
              <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                ⚠️ {warning}
              </div>
            )}
            <button
              onClick={handleBuild}
              disabled={isBuilding || 
                       !author.trim() || 
                       Object.values(categoryFiles).every(files => files.length === 0) ||
                       Object.values(newFileNames).some(name => name.trim() !== '')}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg 
                       hover:bg-blue-700
                       transition-all duration-200 
                       flex items-center gap-3
                       disabled:bg-gray-300 disabled:cursor-not-allowed
                       font-semibold"
            >
              <FolderGit2 size={22} className={isBuilding ? 'animate-pulse' : ''} />
              {isBuilding ? 'Building...' : 'Build Structure'}
            </button>
          </div>
        </div>
      </div>

      {/* Mode toggle section */}
      <div className="bg-gray-100 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-800">Advanced Mode</span>
            {isAdvancedMode && (
              <span className="text-sm text-gray-600">
                Add SQL content or upload existing files
              </span>
            )}
          </div>
          <button
            onClick={() => setIsAdvancedMode(!isAdvancedMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full
                       transition-colors duration-200 ease-in-out focus:outline-none
                       ${isAdvancedMode ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white
                         transition-transform duration-200 ease-in-out
                         ${isAdvancedMode ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex gap-6">
        {/* Categories grid */}
        <div className="flex-grow">
          <div className="grid gap-4 md:grid-cols-2">
            {categories.map((category) => (
              <div key={category.name} 
                   className="bg-white rounded-lg border border-gray-200 p-4
                            transition-colors duration-200">
                <button 
                  onClick={() => toggleCategory(category.name)}
                  className="w-full flex items-center justify-between text-left mb-3"
                >
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <FolderGit2 size={18} className="text-blue-600" />
                    {category.label}
                    {categoryFiles[category.name].length > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
                        {categoryFiles[category.name].length}
                      </span>
                    )}
                  </h3>
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform duration-200
                               ${expandedCategories.includes(category.name) ? 'rotate-180' : ''}`}
                  />
                </button>
                
                {expandedCategories.includes(category.name) && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFileNames[category.name]}
                        onChange={(e) => {
                          setNewFileNames(prev => ({
                            ...prev,
                            [category.name]: e.target.value
                          }));
                          setCurrentCategory(category.name);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-md
                                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                  transition-all duration-200"
                        placeholder="File name"
                      />
                      {isAdvancedMode && (
                        <label className="p-2 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer
                                        transition-colors duration-200">
                          <input
                            type="file"
                            accept=".sql"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(category.name, file);
                            }}
                          />
                          <Upload size={20} />
                        </label>
                      )}
                      <button
                        onClick={() => handleAddFile(category.name)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md
                                  transition-colors duration-200"
                      >
                        <PlusCircle size={20} />
                      </button>
                    </div>

                    {isAdvancedMode && currentCategory === category.name && newFileNames[category.name].trim() !== '' && (
                      <div className="relative">
                        <Code2 size={16} className="absolute top-3 left-3 text-gray-400" />
                        <textarea
                          value={sqlContent}
                          onChange={(e) => setSqlContent(e.target.value)}
                          className="w-full px-9 py-2 border border-gray-200 rounded-md 
                                   font-mono text-sm min-h-[100px] resize-y
                                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                   transition-all duration-200"
                          placeholder="Enter SQL content..."
                        />
                      </div>
                    )}

                    <ul className="space-y-2">
                      {categoryFiles[category.name].map((file) => (
                        <li key={file.name} 
                            className="flex justify-between items-center p-2 rounded-md
                                     hover:bg-gray-50 transition-colors duration-200">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700">{file.name}</span>
                            {isAdvancedMode && file.content && (
                              <Code2 size={16} className="text-blue-500" />
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveFile(category.name, file.name)}
                            className="text-red-500 hover:text-red-600 p-1 rounded-md
                                     hover:bg-red-50 transition-colors duration-200"
                          >
                            <Trash2 size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Logs panel */}
        <div className="w-1/4 min-w-[300px]">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
              <Terminal size={18} className="text-blue-600" />
              Build Logs
            </h3>
            <div className="space-y-1 font-mono text-sm max-h-[600px] overflow-y-auto
                          bg-gray-50 rounded-md p-3">
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center py-4">No logs yet</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} 
                       className={`${
                         log.includes('[ERROR]') ? 'text-red-600' :
                         log.includes('[SUCCESS]') ? 'text-green-600' :
                         'text-gray-600'
                       }`}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};