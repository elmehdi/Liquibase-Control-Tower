import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

export const executeLiquibaseCommand = async (workingDirectory, command, options = {}) => {
  try {
    // First try to execute via Liquibase service
    try {
      // Convert the working directory path to the correct path in the Liquibase container
      const liquibaseWorkingDir = workingDirectory.replace('/app', '/liquibase/workspace');
      console.log('Converting path:', workingDirectory, 'to:', liquibaseWorkingDir);

      const response = await fetch('http://liquibase:8080/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          options: {
            ...options,
            defaultsFile: `${liquibaseWorkingDir}/liquibase.properties`
          }
        }),
      });

      const data = await response.json();
      if (data.success) {
        return {
          success: true,
          logs: data.output.split('\n').filter(Boolean),
          command: data.command
        };
      }
    } catch (serviceError) {
      console.error('Failed to execute via Liquibase service:', serviceError);
    }

    // Fallback to direct execution if service fails
    const propertiesPath = join(workingDirectory, 'liquibase.properties');
    if (!existsSync(propertiesPath)) {
      throw new Error('liquibase.properties not found');
    }

    let fullCommand = `liquibase --defaultsFile="${propertiesPath}"`;
    
    if (options.tag) {
      fullCommand += ` --tag="${options.tag}"`;
    }
    if (options.count) {
      fullCommand += ` --count=${options.count}`;
    }
    
    fullCommand += ` ${command}`;

    console.log('Executing Liquibase command:', fullCommand);
    const { stdout, stderr } = await execAsync(fullCommand, { 
      cwd: workingDirectory,
      env: { ...process.env, PATH: process.env.PATH }
    });

    return {
      success: true,
      logs: stdout.split('\n').filter(Boolean),
      command: fullCommand
    };
  } catch (error) {
    console.error('Liquibase execution error:', error);
    return {
      success: false,
      error: error.message,
      logs: error.stderr ? error.stderr.split('\n').filter(Boolean) : [],
      command: error.cmd
    };
  }
};

export const validateLiquibaseSetup = async (workingDirectory) => {
  console.log('Original working directory:', workingDirectory);
  
  // First check if the working directory exists in the backend container
  try {
    await fs.access(workingDirectory);
  } catch (error) {
    console.error('Working directory not accessible in backend:', error);
    return {
      success: false,
      error: 'Working directory not accessible',
      details: [`Cannot access directory: ${workingDirectory}`]
    };
  }
  
  // Convert the working directory path to the correct path in the Liquibase container
  const liquibaseWorkingDir = workingDirectory.replace('/app', '/liquibase/workspace');
  console.log('Converted working directory:', liquibaseWorkingDir);
  
  try {
    console.log('Checking Liquibase service setup...');
    const response = await fetch('http://liquibase:8080/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workingDirectory: liquibaseWorkingDir
      }),
    });

    const data = await response.json();
    console.log('Liquibase service validation:', data);

    if (!data.success) {
      return {
        success: false,
        error: data.error,
        details: data.details || ['Setup validation failed']
      };
    }

    return {
      success: true,
      details: ['Liquibase setup validated successfully']
    };
  } catch (error) {
    console.error('Failed to validate via Liquibase service:', error);
    return {
      success: false,
      error: 'Cannot connect to Liquibase service',
      details: [error.message]
    };
  }
};