import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import xmlFormatter from 'xml-formatter';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
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
      const match = include.match(/file="(.*?)"/);
      return match ? match[1] : null;
    }).filter(Boolean);
  } catch (error) {
    return [];
  }
};

// Directory validation endpoint
app.post('/api/validate-directory', async (req, res) => {
  try {
    const { path } = req.body;
    await fs.access(path);
    const stats = await fs.stat(path);
    if (!stats.isDirectory()) {
      throw new Error('Selected path is not a directory');
    }
    res.json({ valid: true });
  } catch (error) {
    res.status(400).json({ 
      valid: false, 
      error: error.message 
    });
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

// Add this new endpoint
app.post('/api/browse-directory', async (req, res) => {
  try {
    let command;
    if (process.platform === 'win32') {
      command = 'powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; ' +
                '$folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog; ' +
                '[void]$folderBrowser.ShowDialog(); ' +
                '$folderBrowser.SelectedPath"';
    } else {
      // For Linux/Mac (requires zenity)
      command = 'zenity --file-selection --directory';
    }

    const { stdout } = await execAsync(command);
    const selectedPath = stdout.trim();

    if (selectedPath) {
      res.json({ path: selectedPath });
    } else {
      res.json({ path: null });
    }
  } catch (error) {
    console.error('Error opening directory dialog:', error);
    res.status(500).json({ error: 'Failed to open directory dialog' });
  }
});

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
    
    if (!await fs.access(mainChangelogPath).then(() => true).catch(() => false)) {
      logs.push({
        type: 'error',
        category: 'system',
        message: 'Main changelog file not found: changelog-SIO2-all.xml'
      });
      errors++;
      return res.json({ errors, logs });
    }

    const content = await fs.readFile(mainChangelogPath, 'utf-8');

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

    res.json({ errors, logs });
  } catch (error) {
    console.error('Error checking main changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/build-structure', async (req, res) => {
  const { workingDirectory, config } = req.body;
  
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

    // Process categories with files
    for (const category of config.categories) {
      if (category.files && category.files.length > 0) {
        const categoryPath = join(workingDirectory, category.name);
        const categorySqlPath = join(categoryPath, 'sql');
        
        await fs.mkdir(categoryPath, { recursive: true });
        await fs.mkdir(categorySqlPath, { recursive: true });

        // Create or update category changelog
        const categoryChangelogPath = join(workingDirectory, `changelog-${config.version}-${category.name.toUpperCase()}.xml`);
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

          if (!existsSync(fileSqlPath)) {
            const sqlContent = file.content || `-- Add your SQL here for ${file.name}`;
            await fs.writeFile(fileSqlPath, sqlContent);
          }

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
    const mainChangelogPath = join(workingDirectory, 'changelog-SIO2-all.xml');
    let mainChangelogContent;

    if (existsSync(mainChangelogPath)) {
      // Read existing content
      const existingContent = await fs.readFile(mainChangelogPath, 'utf8');
      
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
        const newIncludes = config.categories
          .filter(cat => cat.files && cat.files.length > 0)
          .map(cat => `changelog-${config.version}-${cat.name.toUpperCase()}.xml`)
          .filter(file => !existingIncludes.has(file))
          .map(file => `    <include file="${file}" relativeToChangelogFile="true"/>`)
          .join('\n');

        // Only add newIncludes if there are any
        mainChangelogContent = `${contentWithoutClosing}${newIncludes ? '\n' + newIncludes : ''}\n</databaseChangeLog>`;
      }
    } else {
      // Create new main changelog if it doesn't exist
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
  
  try {
    switch (action) {
      case 'create-referenced-file': {
        const { xmlFile, category, workingDirectory } = details;
        
        // Extract the base name without extension
        const baseName = basename(xmlFile, '.xml');
        
        // Create paths
        const xmlPath = join(workingDirectory, category, `${baseName}.xml`);
        const sqlPath = join(workingDirectory, category, 'sql', `${baseName}.sql`);
        
        // Ensure directories exist
        await fs.mkdir(join(workingDirectory, category), { recursive: true });
        await fs.mkdir(join(workingDirectory, category, 'sql'), { recursive: true });
        
        // Create XML file
        const xmlContent = await createChangelogXML('liquibase', baseName);
        await fs.writeFile(xmlPath, xmlContent);
        
        // Create SQL file
        const sqlContent = `-- Add your SQL here for ${baseName}`;
        await fs.writeFile(sqlPath, sqlContent);
        
        console.log('Created files:', xmlPath, sqlPath);
        break;
      }
      
      case 'add-to-changelog': {
        const { xmlFile, changelogFile, workingDirectory } = details;
        const changelogPath = join(workingDirectory, changelogFile);
        
        // Read existing content
        let content = await fs.readFile(changelogPath, 'utf8');
        
        // Find the closing tag position
        const closingTagIndex = content.lastIndexOf('</databaseChangeLog>');
        
        if (closingTagIndex === -1) {
          throw new Error('Invalid changelog format');
        }
        
        // Insert new include before closing tag
        const newContent = content.slice(0, closingTagIndex) +
          `    <include file="${xmlFile}" relativeToChangelogFile="true"/>\n` +
          content.slice(closingTagIndex);
        
        // Write updated content
        await fs.writeFile(changelogPath, newContent);
        
        res.json({ success: true });
        break;
      }
      
      case 'create-sql-file': {
        const { sqlFile, category, workingDirectory } = details;
        const sqlPath = join(workingDirectory, category, 'sql', sqlFile);
        
        // Ensure sql directory exists
        await fs.mkdir(join(workingDirectory, category, 'sql'), { recursive: true });
        
        // Create SQL file
        const sqlContent = `-- Add your SQL here for ${basename(sqlFile, '.sql')}`;
        await fs.writeFile(sqlPath, sqlContent);
        
        console.log('Created SQL file:', sqlPath);
        break;
      }
      
      case 'add-to-main-changelog': {
        const { changelogFile, workingDirectory } = details;
        const mainChangelogPath = join(workingDirectory, 'changelog-SIO2-all.xml');
        
        // Read existing content
        const content = await fs.readFile(mainChangelogPath, 'utf8');
        
        // Find the closing tag position
        const closingTagIndex = content.lastIndexOf('</databaseChangeLog>');
        
        if (closingTagIndex === -1) {
          throw new Error('Invalid main changelog format');
        }
        
        // Insert new include before closing tag
        const newContent = content.slice(0, closingTagIndex) +
          `    <include file="${changelogFile}" relativeToChangelogFile="true"/>\n` +
          content.slice(closingTagIndex);
        
        // Write updated content
        await fs.writeFile(mainChangelogPath, newContent);
        
        res.json({ success: true });
        break;
      }
      
      case 'fix-xml-format': {
        const { xmlFile, workingDirectory } = details;
        const xmlPath = join(workingDirectory, xmlFile);
        
        // Read the XML file
        const content = await fs.readFile(xmlPath, 'utf8');
        
        // Use prettier to format XML
        const formatted = prettier.format(content, {
          parser: 'xml',
          xmlWhitespaceSensitivity: 'ignore',
          printWidth: 100
        });
        
        // Write back formatted content
        await fs.writeFile(xmlPath, formatted);
        res.json({ success: true });
        break;
      }

      case 'fix-sql-format': {
        const { sqlFile, workingDirectory } = details;
        const sqlPath = join(workingDirectory, sqlFile);
        
        // Read the SQL file
        const content = await fs.readFile(sqlPath, 'utf8');
        
        // Use sql-formatter to format SQL
        const formatted = sqlFormatter.format(content, {
          language: 'postgresql',
          uppercase: true
        });
        
        // Write back formatted content
        await fs.writeFile(sqlPath, formatted);
        res.json({ success: true });
        break;
      }

      case 'remove-duplicate-entry': {
        const { entry, changelogFile, workingDirectory } = details;
        const changelogPath = join(workingDirectory, changelogFile);
        
        // Read changelog content
        const content = await fs.readFile(changelogPath, 'utf8');
        
        // Parse XML
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(content);
        
        // Remove duplicate entries
        const seen = new Set();
        result.databaseChangeLog.changeSet = result.databaseChangeLog.changeSet.filter(changeSet => {
          const key = JSON.stringify(changeSet);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        // Build XML
        const builder = new xml2js.Builder();
        const xml = builder.buildObject(result);
        
        // Write back to file
        await fs.writeFile(changelogPath, xml);
        res.json({ success: true });
        break;
      }

      case 'fix-version-number': {
        const { changelogFile, workingDirectory } = details;
        const oldPath = join(workingDirectory, changelogFile);
        
        // Extract current version from tag-database.xml
        const tagPath = join(workingDirectory, 'tag-database.xml');
        const tagContent = await fs.readFile(tagPath, 'utf8');
        const versionMatch = tagContent.match(/tag="(\d+)/);
        const correctVersion = versionMatch ? versionMatch[1] : '49';
        
        // Create new filename with correct version
        const newFile = changelogFile.replace(/changelog-\d+/, `changelog-${correctVersion}`);
        const newPath = join(workingDirectory, newFile);
        
        // Rename file
        await fs.rename(oldPath, newPath);
        
        // Update references in main changelog
        const mainChangelogPath = join(workingDirectory, 'changelog-SIO2-all.xml');
        let mainContent = await fs.readFile(mainChangelogPath, 'utf8');
        mainContent = mainContent.replace(changelogFile, newFile);
        await fs.writeFile(mainChangelogPath, mainContent);
        
        res.json({ success: true });
        break;
      }

      case 'fix-category-name': {
        const { changelogFile, workingDirectory } = details;
        const oldPath = join(workingDirectory, changelogFile);
        
        // Extract version and fix category name
        const match = changelogFile.match(/changelog-(\d+)-([^.]+)/);
        if (!match) throw new Error('Invalid changelog filename format');
        
        const [, version, category] = match;
        const correctCategory = category.toUpperCase();
        
        // Create new filename
        const newFile = `changelog-${version}-${correctCategory}.xml`;
        const newPath = join(workingDirectory, newFile);
        
        // Rename file
        await fs.rename(oldPath, newPath);
        
        // Update references in main changelog
        const mainChangelogPath = join(workingDirectory, 'changelog-SIO2-all.xml');
        let mainContent = await fs.readFile(mainChangelogPath, 'utf8');
        mainContent = mainContent.replace(changelogFile, newFile);
        await fs.writeFile(mainChangelogPath, mainContent);
        
        res.json({ success: true });
        break;
      }

      case 'add-orphaned-xml': {
        const { xmlFile, workingDirectory } = details;
        const category = xmlFile.split('/')[0];
        const version = '49'; // Default version
        
        // Add to appropriate changelog
        const changelogPath = join(workingDirectory, `changelog-${version}-${category.toUpperCase()}.xml`);
        let changelogContent = await fs.readFile(changelogPath, 'utf8');
        
        // Add include before closing tag
        const closingIndex = changelogContent.lastIndexOf('</databaseChangeLog>');
        const newContent = changelogContent.slice(0, closingIndex) +
          `    <include file="${xmlFile}" relativeToChangelogFile="true"/>\n` +
          changelogContent.slice(closingIndex);
        
        await fs.writeFile(changelogPath, newContent);
        res.json({ success: true });
        break;
      }

      case 'remove-orphaned-xml': {
        const { xmlFile, workingDirectory } = details;
        const xmlPath = join(workingDirectory, xmlFile);
        
        // Remove the file
        await fs.unlink(xmlPath);
        res.json({ success: true });
        break;
      }

      case 'add-required-attributes': {
        const { xmlFile, workingDirectory } = details;
        const xmlPath = join(workingDirectory, xmlFile);
        
        // Read XML content
        const content = await fs.readFile(xmlPath, 'utf8');
        
        // Parse XML
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(content);
        
        // Add required attributes if missing
        if (result.databaseChangeLog.changeSet) {
          result.databaseChangeLog.changeSet.forEach(changeSet => {
            if (!changeSet.$.id) changeSet.$.id = uuidv4();
            if (!changeSet.$.author) changeSet.$.author = 'system';
          });
        }
        
        // Build XML
        const builder = new xml2js.Builder();
        const xml = builder.buildObject(result);
        
        // Write back to file
        await fs.writeFile(xmlPath, xml);
        res.json({ success: true });
        break;
      }

      default:
        res.status(400).json({ error: 'Unknown action type' });
    }
  } catch (error) {
    console.error('Failed to apply fix:', error);
    res.status(500).json({ error: error.message });
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
  
  try {
    // First validate the Liquibase setup
    const validation = await validateLiquibaseSetup(workingDirectory);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid Liquibase setup',
        details: validation.error
      });
    }

    // Execute the command
    const result = await executeLiquibaseCommand(workingDirectory, command, options);
    
    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        logs: result.logs,
        command: result.command
      });
    }

    res.json({
      success: true,
      logs: result.logs,
      command: result.command
    });
  } catch (error) {
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