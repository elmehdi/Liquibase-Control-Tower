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
              message: `SQL file '${category}/sql/${sqlFile}' has no corresponding XML file '${category}/${baseName}.xml'`
            });
            errors++;
          }
        }
      }
    }

    // Check for XML files without SQL and not in changelog
    const categoryDir = join(workingDirectory, category);
    if (await fs.access(categoryDir).then(() => true).catch(() => false)) {
      const xmlFiles = (await fs.readdir(categoryDir)).filter(f => f.endsWith('.xml') && !f.startsWith('changelog-'));
      
      for (const xmlFile of xmlFiles) {
        const baseName = xmlFile.replace('.xml', '');
        const sqlPath = join(workingDirectory, category, 'sql', `${baseName}.sql`);

        // Check if XML has corresponding SQL
        if (!await fs.access(sqlPath).then(() => true).catch(() => false)) {
          logs.push({
            type: 'error',
            category,
            message: `XML file '${category}/${xmlFile}' has no corresponding SQL file '${category}/sql/${baseName}.sql'`
          });
          errors++;
        }

        // Check if XML is declared in changelog
        const masterPath = join(workingDirectory, masterChangelog);
        if (await fs.access(masterPath).then(() => true).catch(() => false)) {
          const content = await fs.readFile(masterPath, 'utf-8');
          if (!content.includes(`file="${category}/${baseName}.xml"`)) {
            logs.push({
              type: 'error',
              category,
              message: `XML file '${category}/${xmlFile}' is not declared in ${masterChangelog}`
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
          const filePath = join(workingDirectory, file);
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
        const content = await fs.readFile(join(categoryDir, xmlFile), 'utf-8');
        const sqlRefs = content.match(/path="[^"]+"/g) || [];

        for (const ref of sqlRefs) {
          const sqlPath = ref.match(/path="([^"]+)"/)?.[1];
          if (sqlPath) {
            const fullSqlPath = join(workingDirectory, category, sqlPath);
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
  try {
    const { action, details } = req.body;
    console.log('Received action:', action, 'with details:', details);

    switch (action) {
      case 'create-xml-and-reference': {
        const { sqlFile, category } = details;
        const workingDirectory = details.workingDirectory || process.cwd();
        
        // Extract the base name (e.g., "PRC2" from "procedures/sql/PRC2.sql")
        const baseName = sqlFile.split('/').pop().replace('.sql', '');
        const xmlFileName = `${baseName}.xml`;
        
        console.log('Creating XML file:', xmlFileName, 'in category:', category); // Debug log

        // Create XML content
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                   http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.3.xsd">
    <changeSet id="${baseName}" author="liquibase">
        <sqlFile path="sql/${baseName}.sql" relativeToChangelogFile="true"/>
    </changeSet>
</databaseChangeLog>`;

        // Ensure category directory exists
        const categoryPath = join(workingDirectory, category);
        try {
          await fs.access(categoryPath);
        } catch {
          await fs.mkdir(categoryPath, { recursive: true });
        }

        // Write the XML file
        const xmlPath = join(categoryPath, xmlFileName);
        console.log('Writing XML file to:', xmlPath); // Debug log
        await fs.writeFile(xmlPath, xmlContent);

        console.log('XML file created successfully'); // Debug log
        break;
      }

      case 'add-to-changelog': {
        const { xmlFile, changelogFile, workingDirectory } = details;
        
        // Read the changelog file
        const changelogPath = join(workingDirectory, changelogFile);
        let content = await fs.readFile(changelogPath, 'utf8');
        
        // Find the closing tag
        const closingTagIndex = content.lastIndexOf('</databaseChangeLog>');
        
        if (closingTagIndex === -1) {
          throw new Error('Invalid changelog format');
        }
        
        // Add the include statement before the closing tag
        const newContent = content.slice(0, closingTagIndex) +
          `    <include file="${xmlFile.split('/').pop()}" relativeToChangelogFile="true"/>\n` +
          content.slice(closingTagIndex);
        
        // Write the updated content
        await fs.writeFile(changelogPath, newContent);
        console.log('Added XML file to changelog successfully');
        break;
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Server error applying fix:', error);
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});