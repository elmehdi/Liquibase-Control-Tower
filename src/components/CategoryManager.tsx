import React from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { Category } from '../types';
import { validateInput } from '../utils/validation';

interface CategoryManagerProps {
  category: Category;
  onUpdate: (category: Category) => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  category,
  onUpdate,
}) => {
  const [newFileName, setNewFileName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const handleAddFile = () => {
    const validationError = validateInput(newFileName, 'File name');
    if (validationError) {
      setError(validationError);
      return;
    }

    if (category.files.some(file => file.name === newFileName)) {
      setError('A file with this name already exists');
      return;
    }

    onUpdate({
      ...category,
      files: [...category.files, { name: newFileName }],
    });
    setNewFileName('');
    setError(null);
  };

  const handleRemoveFile = (fileName: string) => {
    onUpdate({
      ...category,
      files: category.files.filter(file => file.name !== fileName),
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold mb-4 capitalize">
        {category.name.replace(/_/g, ' ')}
      </h3>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="Enter file name"
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            onClick={handleAddFile}
            className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <PlusCircle size={20} />
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="max-h-48 overflow-y-auto">
          {category.files.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {category.files.map((file) => (
                <li key={file.name} className="py-2 flex items-center justify-between">
                  <span className="font-medium">{file.name}</span>
                  <button
                    onClick={() => handleRemoveFile(file.name)}
                    className="text-red-600 hover:text-red-700 p-1"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-center py-2">
              No files added yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
};