export const basename = (path: string, ext?: string): string => {
  // Get the part after the last slash
  const base = path.split('/').pop() || '';
  
  // If extension is provided, remove it
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  
  return base;
}; 