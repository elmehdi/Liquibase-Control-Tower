import React, { useState } from 'react';
import { PlusCircleIcon, XMarkIcon } from '@heroicons/react/24/solid';

interface CategoryInputProps {
  onAdd: (category: string) => void;
  onCancel: () => void;
}

export const CategoryInput: React.FC<CategoryInputProps> = ({ onAdd, onCancel }) => {
  const [category, setCategory] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (category.trim()) {
      onAdd(category.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Enter new category"
        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={!category.trim()}
        className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                 disabled:bg-blue-300 disabled:cursor-not-allowed
                 flex items-center gap-2"
      >
        <span>Add</span>
        <PlusCircleIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 
                 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                 flex items-center gap-2"
      >
        <span>Cancel</span>
        <XMarkIcon className="h-5 w-5" />
      </button>
    </form>
  );
};
