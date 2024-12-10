import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

export const executeLiquibaseCommand = async (req, res) => {
  const { command, workingDirectory, options } = req.body;

  try {
    // Construct the Liquibase command
    let fullCommand = `liquibase --defaultsFile=${join(workingDirectory, 'liquibase.properties')} ${command}`;

    // Add any additional options
    if (options) {
      if (options.tag) {
        fullCommand += ` --tag="${options.tag}"`;
      }
      if (options.count) {
        fullCommand += ` --count=${options.count}`;
      }
    }

    // Execute the command
    const { stdout, stderr } = await execAsync(fullCommand, { cwd: workingDirectory });

    res.json({
      success: true,
      logs: stdout.split('\n').filter(Boolean),
      command: fullCommand
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      logs: error.stderr?.split('\n').filter(Boolean),
      command: error.cmd
    });
  }
}; 