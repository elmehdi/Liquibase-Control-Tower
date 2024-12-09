import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

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
    // Check if liquibase.properties exists
    const { stdout: version } = await execAsync('liquibase --version');
    const { stdout: status } = await execAsync(
      `liquibase --defaultsFile=${join(workingDirectory, 'liquibase.properties')} status`,
      { cwd: workingDirectory }
    );

    return {
      success: true,
      version: version.trim(),
      status: status.split('\n').filter(Boolean)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: error.stderr?.split('\n').filter(Boolean)
    };
  }
}; 