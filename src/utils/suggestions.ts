import { mkdir, writeFile } from 'fs/promises';
import { Action, Suggestion } from '../types';

// Helper function to get basename (replaces path.basename)
function getBasename(path: string, ext?: string): string {
  // Remove trailing slashes
  let base = path.replace(/[\/\\]$/, '');
  
  // Get the part after the last slash
  base = base.slice(base.lastIndexOf('/') + 1);
  base = base.slice(base.lastIndexOf('\\') + 1);
  
  // Remove extension if specified
  if (ext && base.endsWith(ext)) {
    base = base.slice(0, -ext.length);
  }
  
  return base;
}

export function getSuggestion(errorMessage: string): Suggestion | null {
  console.log('Checking suggestion for:', errorMessage);

  // Existing handlers
  // 1. Missing directory
  if (errorMessage.includes('Missing') && errorMessage.includes('directory')) {
    console.log('Found missing directory error');
    const dirName = errorMessage.split('Missing ')[1].split(' directory')[0];
    return {
      actions: [
        {
          label: 'Create Directory',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  action: 'create-directory',
                  details: { dirName }
                })
              });
              if (!response.ok) throw new Error('Failed to create directory');
            } catch (error) {
              console.error('Failed to create directory:', error);
              throw error;
            }
          }
        }
      ]
    };
  }

  // 2. XML not declared in changelog
  if (errorMessage.includes('is not declared in changelog-')) {
    const match = errorMessage.match(/XML file '(.+?)' is not declared in (.+?)$/);
    if (match) {
      const [_, xmlFile, changelogFile] = match;
      return {
        actions: [
          {
            label: 'Add to Changelog',
            handler: async () => {
              try {
                const response = await fetch('http://localhost:3000/api/apply-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    action: 'add-to-changelog',
                    details: { 
                      xmlFile,
                      changelogFile,
                      workingDirectory: window.workingDirectory
                    }
                  })
                });
                if (!response.ok) throw new Error('Failed to add to changelog');
              } catch (error) {
                console.error('Failed to add to changelog:', error);
                throw error;
              }
            }
          }
        ]
      };
    }
  }

  // 3. Missing tag-database.xml
  if (errorMessage.includes('Missing tag-database.xml')) {
    console.log('Found missing tag-database.xml error');
    return {
      actions: [
        {
          label: 'Create tag-database.xml',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  action: 'create-tag-database'
                })
              });
              if (!response.ok) throw new Error('Failed to create tag-database.xml');
            } catch (error) {
              console.error('Failed to create tag-database.xml:', error);
              throw error;
            }
          }
        }
      ]
    };
  }

  // 4. SQL file without XML file
  if (errorMessage.includes('SQL file') && errorMessage.includes('has no corresponding XML file')) {
    const match = errorMessage.match(/SQL file '(.+?)' has no corresponding XML file/);
    if (match) {
      const sqlFile = match[1];
      return {
        actions: [
          {
            label: 'Create XML File',
            handler: async () => {
              try {
                const response = await fetch('http://localhost:3000/api/apply-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    action: 'create-xml-and-reference',
                    details: { 
                      sqlFile,
                      xmlFile: sqlFile.replace('sql/', '').replace('.sql', '.xml'),
                      category: sqlFile.split('/')[0],
                      workingDirectory: window.workingDirectory
                    }
                  })
                });
                if (!response.ok) throw new Error('Failed to create XML file');
              } catch (error) {
                console.error('Failed to create XML file:', error);
                throw error;
              }
            }
          }
        ]
      };
    }
  }

  // 5. Referenced XML file doesn't exist
  if (errorMessage.includes('referenced in') && errorMessage.includes('does not exist')) {
    console.log('Found referenced file error');
    const fileMatch = errorMessage.match(/File '([^']+)'/);
    // Fix the category extraction - look for it in the changelog filename
    const categoryMatch = errorMessage.match(/changelog-\d+-([A-Z_]+)\.xml/);
    const versionMatch = errorMessage.match(/changelog-(\d+)-/);
    
    console.log('Matches:', { fileMatch, categoryMatch, versionMatch });
    
    if (fileMatch && categoryMatch) {
      const xmlFile = fileMatch[1];
      const category = categoryMatch[1].toLowerCase();
      const version = versionMatch ? versionMatch[1] : '49';
      
      console.log('Creating suggestion for:', { xmlFile, category, version });
      
      return {
        actions: [{
          label: 'Create Referenced File',
          handler: async () => {
            try {
              console.log('Creating referenced file:', { xmlFile, category, version });
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'create-referenced-file',
                  details: {
                    xmlFile,
                    category,
                    version,
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              
              if (!response.ok) {
                throw new Error('Failed to create referenced file');
              }
            } catch (error) {
              console.error('Failed to create referenced file:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 6. XML file not declared in changelog
  if (errorMessage.includes('exists but is not declared in')) {
    const fileMatch = errorMessage.match(/XML file '([^']+)'/);
    const categoryMatch = errorMessage.match(/\[([^\]]+)\]/);
    const versionMatch = errorMessage.match(/changelog-(\d+)-/);
    
    if (fileMatch && categoryMatch && versionMatch) {
      const xmlFile = getBasename(fileMatch[1]);
      const category = categoryMatch[1].toLowerCase();
      const version = versionMatch[1];
      
      return {
        actions: [{
          label: 'Add to Changelog',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'add-to-changelog',
                  details: {
                    xmlFile,
                    category,
                    version,
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              
              if (!response.ok) {
                throw new Error('Failed to add to changelog');
              }
            } catch (error) {
              console.error('Failed to add to changelog:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 7. SQL file missing
  if (errorMessage.includes('has no corresponding SQL file')) {
    const fileMatch = errorMessage.match(/SQL file '([^']+)'/);
    const categoryMatch = errorMessage.match(/\[([^\]]+)\]/);
    
    if (fileMatch && categoryMatch) {
      const sqlFile = getBasename(fileMatch[1]);
      const category = categoryMatch[1].toLowerCase();
      
      return {
        actions: [{
          label: 'Create SQL File',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'create-sql-file',
                  details: {
                    sqlFile,
                    category,
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              
              if (!response.ok) {
                throw new Error('Failed to create SQL file');
              }
            } catch (error) {
              console.error('Failed to create SQL file:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // New handlers
  // 8. Changelog not in main changelog
  if (errorMessage.includes('exists but is not declared in changelog-SIO2-all.xml')) {
    const fileMatch = errorMessage.match(/Changelog file '([^']+)'/);
    if (fileMatch) {
      const changelogFile = fileMatch[1];
      return {
        actions: [{
          label: 'Add to Main Changelog',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'add-to-main-changelog',
                  details: {
                    changelogFile,
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to add to main changelog');
            } catch (error) {
              console.error('Failed to add to main changelog:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 9. Invalid XML format
  if (errorMessage.includes('Invalid XML format')) {
    const fileMatch = errorMessage.match(/in file '([^']+)'/);
    if (fileMatch) {
      return {
        actions: [{
          label: 'Fix XML Format',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'fix-xml-format',
                  details: {
                    xmlFile: fileMatch[1],
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to fix XML format');
            } catch (error) {
              console.error('Failed to fix XML format:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 10. Invalid SQL format
  if (errorMessage.includes('Invalid SQL format')) {
    const fileMatch = errorMessage.match(/in file '([^']+)'/);
    if (fileMatch) {
      return {
        actions: [{
          label: 'Fix SQL Format',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'fix-sql-format',
                  details: {
                    sqlFile: fileMatch[1],
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to fix SQL format');
            } catch (error) {
              console.error('Failed to fix SQL format:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 11. Duplicate entries in changelog
  if (errorMessage.includes('Duplicate entry')) {
    const matches = errorMessage.match(/Duplicate entry '([^']+)' in '([^']+)'/);
    if (matches) {
      return {
        actions: [{
          label: 'Remove Duplicate Entry',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'remove-duplicate-entry',
                  details: {
                    entry: matches[1],
                    changelogFile: matches[2],
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to remove duplicate entry');
            } catch (error) {
              console.error('Failed to remove duplicate entry:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 12. Wrong version number in changelog
  if (errorMessage.includes('Invalid version number')) {
    const matches = errorMessage.match(/in file '([^']+)'/);
    if (matches) {
      return {
        actions: [{
          label: 'Fix Version Number',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'fix-version-number',
                  details: {
                    changelogFile: matches[1],
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to fix version number');
            } catch (error) {
              console.error('Failed to fix version number:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 13. Wrong category name
  if (errorMessage.includes('Invalid category name')) {
    const matches = errorMessage.match(/in file '([^']+)'/);
    if (matches) {
      return {
        actions: [{
          label: 'Fix Category Name',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'fix-category-name',
                  details: {
                    changelogFile: matches[1],
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to fix category name');
            } catch (error) {
              console.error('Failed to fix category name:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // 14. Orphaned XML files
  if (errorMessage.includes('Orphaned XML file')) {
    const fileMatch = errorMessage.match(/file '([^']+)'/);
    if (fileMatch) {
      return {
        actions: [
          {
            label: 'Add to Changelog',
            handler: async () => {
              try {
                const response = await fetch('http://localhost:3000/api/apply-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'add-orphaned-xml',
                    details: {
                      xmlFile: fileMatch[1],
                      workingDirectory: window.workingDirectory
                    }
                  })
                });
                if (!response.ok) throw new Error('Failed to add orphaned XML');
              } catch (error) {
                console.error('Failed to add orphaned XML:', error);
                throw error;
              }
            }
          },
          {
            label: 'Remove File',
            handler: async () => {
              try {
                const response = await fetch('http://localhost:3000/api/apply-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'remove-orphaned-xml',
                    details: {
                      xmlFile: fileMatch[1],
                      workingDirectory: window.workingDirectory
                    }
                  })
                });
                if (!response.ok) throw new Error('Failed to remove orphaned XML');
              } catch (error) {
                console.error('Failed to remove orphaned XML:', error);
                throw error;
              }
            }
          }
        ]
      };
    }
  }

  // 15. Missing required attributes
  if (errorMessage.includes('Missing required attributes')) {
    const matches = errorMessage.match(/in file '([^']+)'/);
    if (matches) {
      return {
        actions: [{
          label: 'Add Required Attributes',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'add-required-attributes',
                  details: {
                    xmlFile: matches[1],
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to add required attributes');
            } catch (error) {
              console.error('Failed to add required attributes:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  // Handler for XML file not declared in category changelog
  if (errorMessage.includes('exists but is not declared in changelog-')) {
    const fileMatch = errorMessage.match(/XML file '([^']+)' exists but is not declared in (changelog-\d+-[A-Z_]+\.xml)/);
    if (fileMatch) {
      const xmlFile = fileMatch[1];
      const changelogFile = fileMatch[2];
      return {
        actions: [{
          label: 'Add to Category Changelog',
          handler: async () => {
            try {
              const response = await fetch('http://localhost:3000/api/apply-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'add-to-changelog',
                  details: {
                    xmlFile,
                    changelogFile,
                    workingDirectory: window.workingDirectory
                  }
                })
              });
              if (!response.ok) throw new Error('Failed to add XML to category changelog');
            } catch (error) {
              console.error('Failed to add XML to category changelog:', error);
              throw error;
            }
          }
        }]
      };
    }
  }

  console.log('No suggestion found for this error');
  return null;
} 