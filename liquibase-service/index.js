import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

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
      stderr: error.stderr?.split('\n').filter(Boolean) || [],
      command: error.cmd
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { stdout } = await execAsync('liquibase --version');
    res.json({ 
      status: 'healthy',
      version: stdout.trim()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Liquibase service listening on port ${PORT}`);
  console.log('Supported commands:', Object.keys(COMMAND_CONFIG).join(', '));
});