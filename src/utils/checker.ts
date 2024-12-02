import { CheckResult } from '../types';

export class StructureChecker {
  private readonly CATEGORIES = ['tables', 'views', 'materialized_views', 'procedures', 'sequences'];
  private version: string | null = null;

  constructor(private workingDirectory: string) {}

  async check(onLog: (result: CheckResult) => void): Promise<boolean> {
    let totalErrors = 0;

    // Initial check message
    onLog({ 
      type: 'info', 
      category: 'system', 
      message: '=== Liquibase Structure Checker ===' 
    });

    // Check working directory
    onLog({ 
      type: 'info', 
      category: 'system', 
      message: `Checking directory: ${this.workingDirectory}` 
    });

    // Check tag-database.xml
    try {
      const response = await fetch('http://localhost:3000/api/get-version', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workingDirectory: this.workingDirectory })
      });

      const data = await response.json();
      if (data.error) {
        onLog({ 
          type: 'error', 
          category: 'system', 
          message: 'Missing tag-database.xml' 
        });
        totalErrors++;
      } else {
        onLog({ 
          type: 'success', 
          category: 'system', 
          message: 'Found tag-database.xml' 
        });
        this.version = data.version;
      }
    } catch (error) {
      onLog({ 
        type: 'error', 
        category: 'system', 
        message: 'Failed to check tag-database.xml' 
      });
      totalErrors++;
    }

    // Check each category
    for (const category of this.CATEGORIES) {
      onLog({ 
        type: 'info', 
        category: 'system', 
        message: `\nChecking ${category}...` 
      });

      try {
        // Check for orphaned files
        const orphanedResponse = await fetch('http://localhost:3000/api/check-orphaned', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workingDirectory: this.workingDirectory,
            category,
            version: this.version
          })
        });

        const orphanedResults = await orphanedResponse.json();
        totalErrors += orphanedResults.errors;
        orphanedResults.logs.forEach(log => onLog(log));

        // Check references
        const referencesResponse = await fetch('http://localhost:3000/api/check-references', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workingDirectory: this.workingDirectory,
            category,
            version: this.version
          })
        });

        const referencesResults = await referencesResponse.json();
        totalErrors += referencesResults.errors;
        referencesResults.logs.forEach(log => onLog(log));

      } catch (error) {
        onLog({ 
          type: 'error', 
          category: 'system', 
          message: `Failed to check ${category}: ${error.message}` 
        });
        totalErrors++;
      }
    }

    // Log summary
    onLog({ 
      type: totalErrors > 0 ? 'error' : 'success', 
      category: 'summary', 
      message: totalErrors === 0 ? 'All checks passed successfully!' : `Found ${totalErrors} error(s)` 
    });

    return totalErrors === 0;
  }
}