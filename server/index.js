import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs, existsSync } from 'fs';
import xmlFormatter from 'xml-formatter';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createChangelogXML } from './utils/xml.js';
import { basename } from 'path';
import { executeLiquibaseCommand, validateLiquibaseSetup } from './controllers/liquibase.js';
import prettier from 'prettier';
import xml2js from 'xml2js';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const port = 3000;

const app = express();
app.use(express.json());

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// XML Configuration
const XML_CONFIG = {
  schema: 'http://www.liquibase.org/xml/ns/dbchangelog',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  location: 'http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd',
};

// Helper function to read existing changelog includes
const getExistingIncludes = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const matches = content.match(/<include.*?file=".*?\.xml".*?\/>/g) || [];
    return matches.map(include => {
      const match = include.match(/file="([^"]+)"/);
      return match ? match[1] : null;
    }).filter(Boolean);
  } catch (error) {
    return [];
  }
};

// Directory validation endpoint
app.post('/api/validate-directory', async (req, res) => {
  try {
    console.log('Validating directory:', req.body);
    const { path } = req.body;
    
    if (!path) {
      console.log('No path provided');
      return res.json({ valid: false, error: 'No directory path provided' });
    }

    // Print detailed debugging information
    console.log('Current working directory:', process.cwd());
    console.log('Path to validate:', path);
    console.log('Path type:', typeof path);
    
    // Check if path exists using fs.access instead of existsSync
    try {
      await fs.access(path);
      console.log('Path is accessible using fs.access');
      
      // Check if it's a directory
      const stats = await fs.lstat(path);
      if (stats.isDirectory()) {
        console.log('Directory validated successfully (fs.access):', path);
        return res.json({ valid: true });
      } else {
        console.log('Path is not a directory (fs.access)');
        return res.json({ valid: false, error: 'Path is not a directory' });
      }
    } catch (accessError) {
      console.log('fs.access error:', accessError.message);
      
      // Continue with other approaches if fs.access fails
    }

    // Try with normalized path
    const normalizedPath = path.replace(/\\/g, '/');
    console.log('Normalized path:', normalizedPath);
    
    try {
      if (existsSync(normalizedPath)) {
        const stats = await fs.lstat(normalizedPath);
        if (stats.isDirectory()) {
          console.log('Directory validated successfully (normalized path):', normalizedPath);
          return res.json({ valid: true });
        } else {
          console.log('Path is not a directory (normalized path)');
        }
      } else {
        console.log('Normalized path does not exist');
      }
    } catch (normalizedError) {
      console.error('Error with normalized path:', normalizedError.message);
    }
    
    // Last resort: Just assume it's valid if we've gotten this far and the path looks reasonable
    if (path && path.length > 3 && !path.includes('*') && !path.includes('?')) {
      console.log('Assuming path is valid as a last resort:', path);
      return res.json({ valid: true, warning: 'Path validation bypassed' });
    }
    
    // If all approaches fail
    console.log('Path does not exist (tried all approaches)');
    return res.json({ valid: false, error: 'Path does not exist' });
    
  } catch (error) {
    console.error('Error validating directory:', error);
    res.status(500).json({ error: 'Failed to validate directory', details: error.message });
  }
});

// Structure check endpoint
app.post('/api/check-structure', async (req, res) => {
  const { workingDirectory } = req.body;
  const results = [];

  try {
    // Initial check message
    results.push({
      type: 'info',
      category: 'system',
      message: 'Starting structure check...'
    });

    // Check if directory exists
    await fs.access(workingDirectory);
    results.push({
      type: 'info',
      category: 'system',
      message: `Checking directory: ${workingDirectory}`
    });

    // Check for tag-database.xml
    const tagPath = join(workingDirectory, 'tag-database.xml');
    try {
      await fs.access(tagPath);
      results.push({
        type: 'success',
        category: 'system',
        message: 'Found tag-database.xml'
      });
    } catch {
      results.push({
        type: 'error',
        category: 'system',
        message: 'Missing tag-database.xml'
      });
    }

    // Check for required directories
    const requiredDirs = ['tables', 'views', 'materialized_views', 'procedures', 'sequences'];
    
    results.push({
      type: 'info',
      category: 'structure',
      message: 'Checking required directories...'
    });

    for (const dir of requiredDirs) {
      const dirPath = join(workingDirectory, dir);
      try {
        await fs.access(dirPath);
        results.push({
          type: 'success',
          category: 'structure',
          message: `Found ${dir} directory`
        });
      } catch {
        results.push({
          type: 'error',
          category: 'structure',
          message: `Missing ${dir} directory`
        });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Error checking structure:', error);
    res.status(500).json({ error: error.message });
  }
});

// Directory browser endpoint
app.post('/api/browse-directory', async (req, res) => {
  try {
    console.log('Attempting to open directory dialog...');
    
    // Detect if running in WSL
    const isWSL = process.platform === 'linux' && process.env.WSL_DISTRO_NAME;
    console.log('Environment:', isWSL ? 'WSL' : process.platform);
    
    // Try multiple approaches for opening the directory dialog
    let selectedPath = '';
    let error = null;
    
    // Approach for WSL: Use PowerShell through cmd.exe
    if (isWSL) {
      try {
        console.log('Trying WSL approach: PowerShell through cmd.exe');
        
        // Create a temporary PowerShell script
        const psScriptContent = `
Add-Type -AssemblyName System.Windows.Forms
$folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
$folderBrowser.Description = "Select a folder"
$folderBrowser.ShowNewFolderButton = $true
$folderBrowser.RootFolder = "MyComputer"

if ($folderBrowser.ShowDialog() -eq "OK") {
    Write-Output $folderBrowser.SelectedPath
} else {
    exit 1
}
        `;
        
        const tempPsPath = join(process.cwd(), 'temp_folder_dialog.ps1');
        await fs.writeFile(tempPsPath, psScriptContent);
        
        // Convert to Windows path
        const winPath = tempPsPath.replace(/^\/mnt\/([a-z])\//, '$1:/').replace(/\//g, '\\');
        
        // Execute PowerShell script through cmd.exe
        const command = `cmd.exe /c powershell -ExecutionPolicy Bypass -File "${winPath}"`;
        const result = await execAsync(command, { timeout: 60000 });
        
        // Clean up
        try {
          await fs.unlink(tempPsPath);
        } catch (unlinkError) {
          console.error('Failed to delete temporary PS script:', unlinkError);
        }
        
        selectedPath = result.stdout.trim();
        
        if (selectedPath) {
          console.log('WSL approach succeeded with path:', selectedPath);
          return res.json({ path: selectedPath });
        }
      } catch (wslErr) {
        console.error('WSL approach failed:', wslErr.message);
        error = wslErr;
        
        // Try alternative approach for WSL using explorer.exe
        try {
          console.log('Trying alternative WSL approach: Using explorer.exe');
          
          // Create a temporary VBS script that will be executed by Windows
          const vbsContent = `
Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.BrowseForFolder(0, "Select a folder", 0)
If objFolder Is Nothing Then
  WScript.Quit(1)
Else
  WScript.Echo objFolder.Self.Path
  WScript.Quit(0)
End If
          `;
          
          const tempVbsPath = join(process.cwd(), 'temp_folder_dialog.vbs');
          await fs.writeFile(tempVbsPath, vbsContent);
          
          // Convert to Windows path
          const winVbsPath = tempVbsPath.replace(/^\/mnt\/([a-z])\//, '$1:/').replace(/\//g, '\\');
          
          // Execute VBS script through cmd.exe
          const command = `cmd.exe /c cscript //NoLogo "${winVbsPath}"`;
          const result = await execAsync(command, { timeout: 60000 });
          
          // Clean up
          try {
            await fs.unlink(tempVbsPath);
          } catch (unlinkError) {
            console.error('Failed to delete temporary VBS file:', unlinkError);
          }
          
          selectedPath = result.stdout.trim();
          
          if (selectedPath) {
            console.log('Alternative WSL approach succeeded with path:', selectedPath);
            return res.json({ path: selectedPath });
          }
        } catch (altWslErr) {
          console.error('Alternative WSL approach failed:', altWslErr.message);
          error = error || altWslErr;
        }
      }
    } else {
      // Windows native approach
      try {
        console.log('Trying Windows approach: Standard PowerShell dialog');
        const command = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select a folder'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }"`;
        const result = await execAsync(command, { timeout: 30000 });
        selectedPath = result.stdout.trim();
        
        if (selectedPath) {
          console.log('Windows approach succeeded with path:', selectedPath);
          return res.json({ path: selectedPath });
        }
      } catch (winErr) {
        console.error('Windows approach failed:', winErr.message);
        error = winErr;
      }
    }
    
    // If all dialog approaches fail, return an error
    console.error('All dialog approaches failed');
    return res.status(500).json({
      error: 'Failed to open directory dialog. Please enter the path manually.',
      details: error ? error.message : 'Unknown error'
    });
    
  } catch (finalError) {
    console.error('Unexpected error in directory browser:', finalError);
    res.status(500).json({ error: 'Failed to open directory dialog. Please try again or enter the path manually.' });
  }
});

// Helper function for the direct API approach
async function useDirectAPIApproach(res) {
  console.log('Using direct API approach with common directories');
  
  // Get common directories for both Windows and WSL
  let commonPaths = [];
  
  // Detect if running in WSL
  const isWSL = process.platform === 'linux' && process.env.WSL_DISTRO_NAME;
  
  if (isWSL) {
    // WSL paths
    const homeDir = process.env.HOME || '/home/' + process.env.USER;
    const username = process.env.USER;
    
    commonPaths = [
      homeDir,
      '/mnt/c',
      '/mnt/c/Users',
      `/mnt/c/Users/${username}`,
      `/mnt/c/Users/${username}/Desktop`,
      `/mnt/c/Users/${username}/Documents`,
      `/mnt/c/Users/${username}/Downloads`,
      process.cwd()
    ];
    
    // Try to get Windows username from WSL
    try {
      const { stdout } = await execAsync('cmd.exe /c echo %USERNAME%');
      const winUsername = stdout.trim();
      if (winUsername) {
        commonPaths.push(`/mnt/c/Users/${winUsername}`);
        commonPaths.push(`/mnt/c/Users/${winUsername}/Desktop`);
        commonPaths.push(`/mnt/c/Users/${winUsername}/Documents`);
        commonPaths.push(`/mnt/c/Users/${winUsername}/Downloads`);
      }
    } catch (err) {
      console.error('Failed to get Windows username:', err.message);
    }
  } else {
    // Windows paths
    const userHome = process.env.USERPROFILE || 'C:\\Users\\' + process.env.USERNAME;
    commonPaths = [
      userHome,
      join(userHome, 'Desktop'),
      join(userHome, 'Documents'),
      join(userHome, 'Downloads'),
      'C:\\',
      'C:\\Program Files',
      'C:\\Users',
      process.cwd()
    ];
  }
  
  // Filter to only include paths that exist
  const existingPaths = [];
  for (const path of commonPaths) {
    try {
      if (existsSync(path)) {
        existingPaths.push(path);
      }
    } catch (err) {
      console.error(`Error checking if path exists: ${path}`, err.message);
    }
  }
  
  if (existingPaths.length > 0) {
    console.log('Direct API approach succeeded with paths:', existingPaths);
    return res.status(200).json({
      success: true,
      message: 'Here are some common directories you can use',
      paths: existingPaths,
      defaultPath: existingPaths[0],
      currentDirectory: process.cwd()
    });
  } else {
    // If no paths exist, return the current directory
    console.log('No common paths found, using current directory');
    return res.status(200).json({
      success: true,
      message: 'No common directories found, using current directory',
      paths: [process.cwd()],
      defaultPath: process.cwd(),
      currentDirectory: process.cwd()
    });
  }
}

app.post('/api/get-version', async (req, res) => {
  try {
    const { workingDirectory } = req.body;
    const tagPath = join(workingDirectory, 'tag-database.xml');

    try {
      // Read the tag-database.xml file
      const content = await fs.readFile(tagPath, 'utf8');
      
      // Try to find the version number
      const match = content.match(/<tagDatabase\s+tag="(\d+)\.0\.0"/);
      
      if (match && match[1]) {
        // Successfully found version number
        console.log('Found version:', match[1]);
        res.json({ version: match[1] });
      } else {
        // File exists but couldn't find version
        console.log('Version pattern not found in tag-database.xml');
        res.status(404).json({ error: 'Version not found in tag-database.xml' });
      }
    } catch (error) {
      // File doesn't exist
      console.log('tag-database.xml not found');
      res.status(404).json({ error: 'tag-database.xml not found' });
    }
  } catch (error) {
    console.error('Error getting version:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-orphaned', async (req, res) => {
  const { workingDirectory, category, version } = req.body;
  const logs = [];
  let errors = 0;

  try {
    const masterChangelog = `changelog-${version}-${category.toUpperCase()}.xml`;
    const masterPath = join(workingDirectory, masterChangelog);
    
    // Get all declared files from master changelog first
    let declaredFiles = new Set();
    if (await fs.access(masterPath).then(() => true).catch(() => false)) {
      const content = await fs.readFile(masterPath, 'utf-8');
      const matches = content.match(/file="[^"]+"/g) || [];
      declaredFiles = new Set(matches.map(m => {
        const match = m.match(/file="([^"]+)"/);
        return match ? match[1] : null;
      }).filter(Boolean));
    }

    // Check for XML files that exist but aren't declared in changelog
    const categoryDir = join(workingDirectory, category);
    if (await fs.access(categoryDir).then(() => true).catch(() => false)) {
      const xmlFiles = (await fs.readdir(categoryDir))
        .filter(f => f.endsWith('.xml') && !f.startsWith('changelog-'));
      
      for (const xmlFile of xmlFiles) {
        const relativePath = `${category}/${xmlFile}`;
        const shortPath = xmlFile;
        
        // Check if either the full path or short path is declared
        if (!declaredFiles.has(relativePath) && !declaredFiles.has(shortPath)) {
          logs.push({
            type: 'error',
            category,
            message: `XML file '${relativePath}' exists but is not declared in ${masterChangelog}`
          });
          errors++;
        }
      }
    }

    // Check for SQL files without XML
    const sqlDir = join(workingDirectory, category, 'sql');
    if (await fs.access(sqlDir).then(() => true).catch(() => false)) {
      const sqlFiles = await fs.readdir(sqlDir);
      for (const sqlFile of sqlFiles) {
        if (sqlFile.endsWith('.sql')) {
          const baseName = sqlFile.replace('.sql', '');
          const xmlPath = join(workingDirectory, category, `${baseName}.xml`);
          
          if (!await fs.access(xmlPath).then(() => true).catch(() => false)) {
            logs.push({
              type: 'error',
              category,
              message: `SQL file '${category}/sql/${sqlFile}' has no corresponding XML file`
            });
            errors++;
          }
        }
      }
    }

    res.json({ errors, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-references', async (req, res) => {
  const { workingDirectory, category, version } = req.body;
  const logs = [];
  let errors = 0;

  try {
    const masterChangelog = `changelog-${version}-${category.toUpperCase()}.xml`;
    const masterPath = join(workingDirectory, masterChangelog);

    // Check files referenced in master changelog
    if (await fs.access(masterPath).then(() => true).catch(() => false)) {
      const content = await fs.readFile(masterPath, 'utf-8');
      const references = content.match(/file="[^"]+"/g) || [];
      
      for (const ref of references) {
        const file = ref.match(/file="([^"]+)"/)?.[1];
        if (file) {
          // Handle both relative and full paths
          const filePath = file.includes('/') 
            ? join(workingDirectory, file)
            : join(workingDirectory, category, file);
            
          if (!await fs.access(filePath).then(() => true).catch(() => false)) {
            logs.push({
              type: 'error',
              category,
              message: `File '${file}' referenced in ${masterChangelog} does not exist`
            });
            errors++;
          }
        }
      }
    }

    // Check SQL files referenced in XML changesets
    const categoryDir = join(workingDirectory, category);
    if (await fs.access(categoryDir).then(() => true).catch(() => false)) {
      const xmlFiles = (await fs.readdir(categoryDir))
        .filter(f => f.endsWith('.xml') && !f.startsWith('changelog-'));

      for (const xmlFile of xmlFiles) {
        const xmlPath = join(categoryDir, xmlFile);
        const content = await fs.readFile(xmlPath, 'utf-8');
        const sqlRefs = content.match(/path="[^"]+"/g) || [];

        for (const ref of sqlRefs) {
          const sqlPath = ref.match(/path="([^"]+)"/)?.[1];
          if (sqlPath) {
            const fullSqlPath = join(categoryDir, sqlPath);
            if (!await fs.access(fullSqlPath).then(() => true).catch(() => false)) {
              logs.push({
                type: 'error',
                category,
                message: `SQL file '${sqlPath}' referenced in '${category}/${xmlFile}' does not exist`
              });
              errors++;
            }
          }
        }
      }
    }

    res.json({ errors, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-main-changelog', async (req, res) => {
  const { workingDirectory, version } = req.body;
  const logs = [];
  let errors = 0;

  try {
    const mainChangelogPath = join(workingDirectory, 'changelog-SIO2-all.xml');
    const orderManagersChangelogPath = join(workingDirectory, 'changelog-Order-Managers-Param-DATA.xml');
    
    let mainChangelog = 'changelog-SIO2-all.xml'; // Default changelog
    
    if (await fs.access(orderManagersChangelogPath).then(() => true).catch(() => false)) {
      mainChangelog = 'changelog-Order-Managers-Param-DATA.xml'; // Change to special case
    }

    const mainChangelogPathToCheck = join(workingDirectory, mainChangelog);
    
    if (!await fs.access(mainChangelogPathToCheck).then(() => true).catch(() => false)) {
      logs.push({
        type: 'error',
        category: 'system',
        message: `Main changelog file not found: ${mainChangelog}`
      });
      errors++;
      return res.json({ errors, logs });
    }

    const content = await fs.readFile(mainChangelogPathToCheck, 'utf-8');

    if (mainChangelog === 'changelog-SIO2-all.xml') {
      const categories = ['TABLES', 'VIEWS', 'MATERIALIZED_VIEWS', 'PROCEDURES', 'SEQUENCES'];
      for (const category of categories) {
        const categoryChangelog = `changelog-${version}-${category}.xml`;
        const changelogPath = join(workingDirectory, categoryChangelog);
        
        if (await fs.access(changelogPath).then(() => true).catch(() => false)) {
          if (!content.includes(`file="${categoryChangelog}"`)) {
            logs.push({
              type: 'error',
              category: 'main_changelog',
              message: `Existing changelog '${categoryChangelog}' is not declared in changelog-SIO2-all.xml`
            });
            errors++;
          }
        }
      }
    } else if (mainChangelog === 'changelog-Order-Managers-Param-DATA.xml') {
      const categoryChangelog = 'changelog-Order-Managers-Param-DATA.xml';
      // Check if 'data' is included in the main changelog, if not, log an error
      if (!content.includes(`file="${categoryChangelog}"`)) {
        logs.push({
          type: 'error',
          category: 'main_changelog',
          message: `Changelog '${categoryChangelog}' is not declared in changelog-Order-Managers-Param-DATA.xml`
        });
        errors++;
      }
    }

    res.json({ errors, logs });
  } catch (error) {
    console.error('Error checking main changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/build-structure', async (req, res) => {
  const { workingDirectory, config } = req.body;
  // if (category.name.toLowerCase() === 'data') {
  //   console.log('Building data structure...');
  // }

  try {
    // Create tag-database.xml if it doesn't exist
    const tagPath = join(workingDirectory, 'tag-database.xml');
    if (!existsSync(tagPath)) {
      const tagContent = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
  xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                      http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd">
                      
  <changeSet author="${config.author}" id="tag-database">
    <tagDatabase tag="${config.version}.0.0"/>
  </changeSet>
</databaseChangeLog>`;
      await fs.writeFile(tagPath, tagContent);
    }
    let isDataCategory = false;
    // Process categories with files
    for (const category of config.categories) {
      if (category.files && category.files.length > 0) {
        const categoryPath = join(workingDirectory, category.name);
        const categorySqlPath = join(categoryPath, 'sql');
        
        await fs.mkdir(categoryPath, { recursive: true });
        await fs.mkdir(categorySqlPath, { recursive: true });

        // Create or update category changelog
        console.log(category.name.toLowerCase());
        const categoryChangelogPath = category.name.toLowerCase() === 'data'
  ? join(workingDirectory, 'changelog-Order-Managers-Param-DATA.xml')
  : join(workingDirectory, `changelog-${config.version}-${category.name.toUpperCase()}.xml`);

        let categoryChangelogContent = '';
        let existingIncludes = [];

        if (existsSync(categoryChangelogPath)) {
          // Read existing changelog
          const existingContent = await fs.readFile(categoryChangelogPath, 'utf8');
          // Extract existing includes
          const includeRegex = /<include .*?file="(.*?)".*?\/>/g;
          let match;
          while ((match = includeRegex.exec(existingContent)) !== null) {
            existingIncludes.push(match[1]);
          }
        }
        
        // Create individual XML files with proper indentation
        for (const file of category.files) {
          const xmlPath = join(categoryPath, `${file.name}.xml`);
          const fileSqlPath = join(categorySqlPath, `${file.name}.sql`);
           isDataCategory = `${category.name}`.toLowerCase() === 'data';

          if (!existsSync(xmlPath)) {
            const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                      http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd">

    <changeSet id="${file.name}" author="${config.author}">
        <sqlFile path="sql/${file.name}.sql" relativeToChangelogFile="true"/>
    </changeSet>
</databaseChangeLog>`;
            await fs.writeFile(xmlPath, xmlContent);
          }

          // Always write the SQL content, whether the file exists or not
          const sqlContent = file.content || `-- Add your SQL here for ${file.name}`;
          await fs.writeFile(fileSqlPath, sqlContent);

          // Add to includes if not already present
          const includePath = `${category.name}/${file.name}.xml`;
          if (!existingIncludes.includes(includePath)) {
            existingIncludes.push(includePath);
          }
        }

        // Write updated category changelog with proper indentation
        categoryChangelogContent = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                      http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd">

${existingIncludes.map(file => `    <include file="${file}" relativeToChangelogFile="true"/>`).join('\n')}
</databaseChangeLog>`;

        await fs.writeFile(categoryChangelogPath, categoryChangelogContent);
      }
    }

    // Update main changelog (changelog-SIO2-all.xml)
    const mainChangelogPath = isDataCategory
      ? join(workingDirectory, 'changelog-Order-Managers-Param-DATA.xml')  // Data updates this file instead
      : join(workingDirectory, 'changelog-SIO2-all.xml');
    let mainChangelogContent;

    if (existsSync(mainChangelogPath)) {
      // Read existing content
      const existingContent = await fs.readFile(mainChangelogPath, 'utf-8');
      
      // Find the closing tag position
      const closingTagIndex = existingContent.lastIndexOf('</databaseChangeLog>');
      
      if (closingTagIndex !== -1) {
        // Get content without the closing tag
        const contentWithoutClosing = existingContent.substring(0, closingTagIndex);
        
        // Get existing includes to avoid duplicates
        const includeRegex = /<include.*?file="(.*?)".*?\/>/g;
        const existingIncludes = new Set();
        let match;
        
        while ((match = includeRegex.exec(existingContent)) !== null) {
          existingIncludes.add(match[1]);
        }

        // Add only new category changelogs
        // const newIncludes = config.categories
        //   .filter(cat => cat.files && cat.files.length > 0)
        //   .map(cat => `changelog-${config.version}-${cat.name.toUpperCase()}.xml`)
        //   .filter(file => !existingIncludes.has(file))
        //   .map(file => `    <include file="${file}" relativeToChangelogFile="true"/>`)
        //   .join('\n');

        const newIncludes = config.categories
            .filter(cat => cat.files && cat.files.length > 0 && cat.name.toLowerCase() !== 'data')  // 
            .map(cat => `changelog-${config.version}-${cat.name.toUpperCase()}.xml`)
            .filter(file => !existingIncludes.has(file))
            .map(file => `    <include file="${file}" relativeToChangelogFile="true"/>`)
            .join('\n');


        // Only add newIncludes if there are any
        mainChangelogContent = `${contentWithoutClosing}${newIncludes ? '\n' + newIncludes : ''}\n</databaseChangeLog>`;
      }
    } else {
      // Create new main changelog if it doesn't exist
      if (isDataCategory) {
        mainChangelogContent = `<?xml version="1.0" encoding="UTF-8"?>
    <databaseChangeLog
        xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                          http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd">
    
        <include file="tag-database.xml" relativeToChangelogFile="true"/>
    
        <!-- DML Inserts -->
        ${category.files.map(file => `    <include relativeToChangelogFile="true" file="data/${file}"/>`).join('\n')}
    </databaseChangeLog>`;
    }
    else {
      mainChangelogContent = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                      http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd">

    <!-- Definition de la version -->
    <!-- -->
    <include file="tag-database.xml" relativeToChangelogFile="true"/>

    <!-- Ajouter tous les version à installer -->
${config.categories
        .filter(cat => cat.files && cat.files.length > 0)
        .map(cat => `    <include file="changelog-${config.version}-${cat.name.toUpperCase()}.xml" relativeToChangelogFile="true"/>`)
        .join('\n')}
</databaseChangeLog>`;
    }
  }
    await fs.writeFile(mainChangelogPath, mainChangelogContent);

    res.json({ success: true });
  } catch (error) {
    console.error('Error building structure:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-sql-exists', async (req, res) => {
  const { workingDirectory, sqlFile } = req.body;
  const fullPath = join(workingDirectory, sqlFile);
  
  try {
    const exists = await fs.access(fullPath)
      .then(() => true)
      .catch(() => false);
    
    res.json({ exists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/apply-fix', async (req, res) => {
  const { action, details } = req.body;
  
  console.log('Received fix request:', { action, details });
  
  try {
    switch (action) {
      case 'create-xml-and-reference': {
        const { sqlFile, xmlFile, category, workingDirectory } = details;
        
        if (!sqlFile || !category || !workingDirectory) {
          console.error('Missing required fields:', { sqlFile, category, workingDirectory });
          return res.status(400).json({ error: 'Missing required fields' });
        }

        console.log('Creating XML file with details:', { sqlFile, xmlFile, category });

        // Extract the base name without extension
        const baseName = basename(sqlFile, '.sql');
        
        // Create paths
        const xmlPath = join(workingDirectory, category, `${baseName}.xml`);
        const sqlPath = join(workingDirectory, category, 'sql', `${baseName}.sql`);
        
        console.log('Creating files at:', { xmlPath, sqlPath });

        try {
          // Create XML file with proper content
          const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
    http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.3.xsd">
    
    <changeSet id="${baseName}" author="system">
        <sqlFile path="sql/${baseName}.sql" relativeToChangelogFile="true"/>
    </changeSet>
</databaseChangeLog>`;

          await fs.writeFile(xmlPath, xmlContent);
          
          // Add to changelog if it exists
          const changelogPath = join(workingDirectory, `changelog-49-${category.toUpperCase()}.xml`);
          if (await fs.access(changelogPath).then(() => true).catch(() => false)) {
            let changelogContent = await fs.readFile(changelogPath, 'utf8');
            const insertPoint = changelogContent.lastIndexOf('</databaseChangeLog>');
            const newEntry = `    <include file="${category}/${baseName}.xml" relativeToChangelogFile="true"/>\n`;
            changelogContent = changelogContent.slice(0, insertPoint) + newEntry + changelogContent.slice(insertPoint);
            await fs.writeFile(changelogPath, changelogContent);
          }

          console.log('Successfully created XML file and updated changelog');
          res.json({ success: true });
        } catch (fileError) {
          console.error('File operation error:', fileError);
          throw fileError;
        }
        break;
      }

      case 'add-to-changelog': {
        const { xmlFile, changelogFile, workingDirectory } = details;
        
        if (!xmlFile || !changelogFile || !workingDirectory) {
          console.error('Missing required fields:', { xmlFile, changelogFile, workingDirectory });
          return res.status(400).json({ error: 'Missing required fields' });
        }

        console.log('Adding XML to changelog:', { xmlFile, changelogFile });

        try {
          const changelogPath = join(workingDirectory, changelogFile);
          
          // Check if changelog exists
          if (!(await fs.access(changelogPath).then(() => true).catch(() => false))) {
            throw new Error(`Changelog file ${changelogFile} does not exist`);
          }

          // Read current changelog content
          let changelogContent = await fs.readFile(changelogPath, 'utf-8');
          
          // Check if the XML is already included
          if (changelogContent.includes(`file="${xmlFile}"`)) {
            return res.json({ success: true, message: 'XML already included in changelog' });
          }

          // Add the new include before the closing tag
          const insertPoint = changelogContent.lastIndexOf('</databaseChangeLog>');
          if (insertPoint === -1) {
            throw new Error('Invalid changelog format: missing closing tag');
          }

          const newEntry = `    <include file="${xmlFile}" relativeToChangelogFile="true"/>\n`;
          changelogContent = changelogContent.slice(0, insertPoint) + newEntry + changelogContent.slice(insertPoint);

          // Format the XML content
          const formattedContent = xmlFormatter(changelogContent, {
            indentation: '    ',
            collapseContent: true,
            lineSeparator: '\n'
          });

          // Write back to file
          await fs.writeFile(changelogPath, formattedContent);
          console.log('Successfully added XML to changelog');
          res.json({ success: true });
        } catch (fileError) {
          console.error('File operation error:', fileError);
          throw fileError;
        }
        break;
      }
      
      default:
        console.error('Unknown action type:', action);
        res.status(400).json({ error: 'Unknown action type' });
    }
  } catch (error) {
    console.error('Server error while applying fix:', error);
    res.status(500).json({
      error: error.message,
      details: error.stack
    });
  }
});

// Add function to get version from tag-database.xml
async function getVersionFromTag(workingDirectory) {
  try {
    const tagPath = join(workingDirectory, 'tag-database.xml');
    const content = await fs.readFile(tagPath, 'utf8');
    const match = content.match(/tag="([^"]+)"/);
    return match ? match[1].split('.')[0] : null;
  } catch (error) {
    console.error('Error reading tag-database.xml:', error);
    return null;
  }
}

// Add function to get author from package.json or use default
async function getAuthor() {
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    return packageJson.author || 'SIO2';
  } catch (error) {
    console.error('Error reading package.json:', error);
    return 'SIO2'; // Default author
  }
}

app.post('/api/get-config', async (req, res) => {
  const { workingDirectory } = req.body;

  try {
    const [version, author] = await Promise.all([
      getVersionFromTag(workingDirectory),
      getAuthor()
    ]);

    if (!version) {
      throw new Error('Could not determine version from tag-database.xml');
    }

    res.json({ version, author });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/liquibase', async (req, res) => {
  const { command, workingDirectory, options } = req.body;
  
  console.log('Received liquibase request:', { command, workingDirectory, options });
  
  try {
    // First validate the Liquibase setup
    console.log('Validating Liquibase setup...');
    const validation = await validateLiquibaseSetup(workingDirectory);
    console.log('Validation result:', validation);
    
    if (!validation.success) {
      console.log('Validation failed:', validation.error);
      return res.status(400).json({
        error: 'Invalid Liquibase setup',
        details: validation.error
      });
    }

    // Execute the command
    console.log('Executing Liquibase command...');
    const result = await executeLiquibaseCommand(workingDirectory, command, options);
    
    if (!result.success) {
      console.log('Command failed:', result.error);
      return res.status(500).json({
        error: result.error,
        logs: result.logs,
        command: result.command
      });
    }

    console.log('Command succeeded');
    res.json({
      success: true,
      logs: result.logs,
      command: result.command
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({
      error: error.message,
      logs: error.stderr?.split('\n').filter(Boolean)
    });
  }
});

app.post('/api/check-changelog-declarations', async (req, res) => {
  const { workingDirectory, version } = req.body;
  const logs = [];
  let errors = 0;

  try {
    // Read main changelog
    const mainChangelogPath = join(workingDirectory, 'changelog-SIO2-all.xml');
    if (!existsSync(mainChangelogPath)) {
      logs.push({
        type: 'error',
        category: 'system',
        message: 'Main changelog (changelog-SIO2-all.xml) not found'
      });
      errors++;
      return res.json({ logs, errors });
    }

    const mainContent = await fs.readFile(mainChangelogPath, 'utf8');
    
    // Extract all declared changelogs
    const includeRegex = /<include.*?file="(changelog-\d+-[A-Z_]+\.xml)".*?\/>/g;
    const declaredChangelogs = new Set();
    let match;
    
    while ((match = includeRegex.exec(mainContent)) !== null) {
      declaredChangelogs.add(match[1]);
    }

    // Check for existing changelog files that should be declared
    const files = await fs.readdir(workingDirectory);
    const changelogPattern = new RegExp(`changelog-${version}-[A-Z_]+\\.xml$`);
    
    for (const file of files) {
      if (file !== 'changelog-SIO2-all.xml' && 
          file !== 'tag-database.xml' && 
          changelogPattern.test(file)) {
        
        if (!declaredChangelogs.has(file)) {
          logs.push({
            type: 'error',
            category: 'system',
            message: `Changelog file '${file}' exists but is not declared in changelog-SIO2-all.xml`
          });
          errors++;
        }
      }
    }

    // Success message if no issues found
    if (errors === 0) {
      logs.push({
        type: 'success',
        category: 'system',
        message: 'All changelog files are properly declared'
      });
    }

    res.json({ logs, errors });
  } catch (error) {
    console.error('Error checking changelog declarations:', error);
    res.status(500).json({ 
      logs: [{
        type: 'error',
        category: 'system',
        message: `Failed to check changelog declarations: ${error.message}`
      }],
      errors: 1
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});