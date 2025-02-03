import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { access } from 'fs/promises';

const execAsync = promisify(exec);

export const executeLiquibaseCommand = async (workingDirectory, command, options = {}) => {
  try {
    // Build the command with options
    let fullCommand = `liquibase --defaultsFile=${join(workingDirectory, 'liquibase.properties')}`;
    
    // Add any additional options
    if (options.tag) {
      fullCommand += ` --tag="${options.tag}"`;
    }
    if (options.count) {
      fullCommand += ` --count=${options.count}`;
    }
    
    // Add the main command
    fullCommand += ` ${command}`;

    const { stdout, stderr } = await execAsync(fullCommand, { cwd: workingDirectory });

    return {
      success: true,
      logs: stdout.split('\n').filter(Boolean),
      command: fullCommand
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      logs: error.stderr?.split('\n').filter(Boolean),
      command: error.cmd
    };
  }
};

export const validateLiquibaseSetup = async (workingDirectory) => {
  try {
    console.log('Validating Liquibase setup for directory:', workingDirectory);
    const liquibasePath = 'c:\\Users\\efetouak\\Downloads\\liquibase-4.31.0\\liquibase.bat';
    
    // Just check if liquibase is available
    console.log('Checking Liquibase version...');
    const { stdout: version } = await execAsync(`${liquibasePath} --version`);
    console.log('Liquibase version:', version.trim());

    return {
      success: true,
      version: version.trim()
    };
  } catch (error) {
    console.error('Liquibase validation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};