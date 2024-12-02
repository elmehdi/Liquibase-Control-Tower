import { mkdir, writeFile } from 'fs/promises';
import { Action, Suggestion } from '../types';

export function getSuggestion(errorMessage: string): Suggestion | null {
  console.log('Checking suggestion for:', errorMessage);

  // Missing directory suggestions
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

  // XML not declared in changelog
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

  // Missing tag-database.xml suggestion
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

  // SQL file without XML file
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

  // Referenced XML file doesn't exist
  if (errorMessage.includes('referenced in') && errorMessage.includes('does not exist')) {
    const match = errorMessage.match(/File '(.+?)' referenced in (.+?) does not exist/);
    if (match) {
      const [_, xmlFile, changelogFile] = match;
      return {
        actions: [
          {
            label: 'Create Referenced File',
            handler: async () => {
              try {
                const response = await fetch('http://localhost:3000/api/apply-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    action: 'create-referenced-file',
                    details: { xmlFile, changelogFile }
                  })
                });
                if (!response.ok) throw new Error('Failed to create referenced file');
              } catch (error) {
                console.error('Failed to create referenced file:', error);
                throw error;
              }
            }
          }
        ]
      };
    }
  }

  console.log('No suggestion found for this error');
  return null;
} 