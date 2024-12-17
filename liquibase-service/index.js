import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, constants } from 'fs';
import { promises as fs } from 'fs';

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

const PORT = 8080;

// Command configuration with validation rules
const COMMAND_CONFIG = {
  status: {
    requiresParams: false,
    description: 'Show pending changesets and current database state'
  },
  validate: {
    requiresParams: false,
    description: 'Check if changelog files are correctly formatted'
  },
  updateSQL: {
    requiresParams: false,
    description: 'Generate SQL for pending changes without executing them'
  },
  update: {
    requiresParams: false,
    description: 'Apply all pending changesets'
  },
  updateCount: {
    requiresParams: true,
    requiredParams: ['count'],
    description: 'Apply specific number of pending changesets'
  },
  rollback: {
    requiresParams: true,
    requiredParams: ['tag'],
    description: 'Revert database changes to a specific tag'
  },
  rollbackCount: {
    requiresParams: true,
    requiredParams: ['count'],
    description: 'Revert specific number of changesets'
  },
  tag: {
    requiresParams: true,
    requiredParams: ['tag'],
    description: 'Create a new tag in the database'
  }
};

// Validate command and its parameters
const validateCommand = (command, options) => {
  const config = COMMAND_CONFIG[command];
  if (!config) {
    throw new Error(`Invalid command: ${command}`);
  }

  if (config.requiresParams) {
    for (const param of config.requiredParams) {
      if (!options[param]) {
        throw new Error(`${param} is required for ${command} command`);
      }
    }
  }
};

// Main execution endpoint
app.post('/execute', async (req, res) => {
  const { command, options = {} } = req.body;
  
  try {
    // Validate command and parameters
    validateCommand(command, options);

    let fullCommand = 'liquibase';
    
    // Add defaults file if provided
    if (options.defaultsFile) {
      fullCommand += ` --defaultsFile="${options.defaultsFile}"`;
    }
    
    // Add command-specific options
    switch (command) {
      case 'rollback':
      case 'tag':
        fullCommand += ` --tag="${options.tag}"`;
        break;
        
      case 'rollbackCount':
      case 'updateCount':
        fullCommand += ` --count=${options.count}`;
        break;
    }
    
    // Add the main command
    fullCommand += ` ${command}`;
    
    console.log(`Executing: ${fullCommand}`);
    
    const { stdout, stderr } = await execAsync(fullCommand);
    
    // Send response
    res.json({
      success: true,
      output: stdout,
      command: fullCommand,
      warnings: stderr ? stderr.split('\n').filter(Boolean) : []
    });
  } catch (error) {
    console.error('Command execution failed:', error);
    
    res.status(error.code === 'INVALID_COMMAND' ? 400 : 500).json({
      success: false,
      error: error.message,
      stderr: error.stderr ? error.stderr.split('\n').filter(Boolean) : [],
      command: error.cmd
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Add validation endpoint
app.post('/validate', async (req, res) => {
  const { workingDirectory } = req.body;
  console.log('Validating directory:', workingDirectory);
  
  try {
    const propertiesPath = join(workingDirectory, 'liquibase.properties');
    console.log('Checking properties file:', propertiesPath);
    
    // Check if liquibase.properties exists
    if (!existsSync(propertiesPath)) {
      return res.json({
        success: false,
        error: 'liquibase.properties not found',
        details: ['Missing liquibase.properties file in the specified directory']
      });
    }

    // Try to read the properties file to ensure it's accessible
    await fs.access(propertiesPath, constants.R_OK);

    // Try to execute liquibase --version to verify it's accessible
    try {
      await execAsync('liquibase --version');
    } catch (error) {
      return res.json({
        success: false,
        error: 'Liquibase not accessible',
        details: ['Liquibase command not found or not accessible']
      });
    }

    res.json({
      success: true,
      details: ['Setup validated successfully']
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.json({
      success: false,
      error: error.message,
      details: ['Failed to validate Liquibase setup']
    });
  }
});

app.listen(PORT, () => {
  console.log(`Liquibase service listening on port ${PORT}`);
});