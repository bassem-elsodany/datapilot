// ========================================
// SQL SCRIPT LOADER
// ========================================
// Purpose: Load and execute SQL scripts from assets folder
// Created: 2025-08-18
// Version: 1.0

// Using logger to avoid module conflicts
const logDebug = (message: string, context?: string, data?: any) => {
  // Import logger dynamically to avoid circular dependencies
  import('../services/Logger').then(({ logger }) => {
    logger.debug(message, context || 'ScriptLoader', data);
  }).catch(() => {
    // Fallback to console if logger is not available
    console.log(`[DEBUG] [${context || 'ScriptLoader'}] ${message}`, data || '');
  });
};

const logError = (message: string, context?: string, data?: any, error?: Error) => {
  // Import logger dynamically to avoid circular dependencies
  import('../services/Logger').then(({ logger }) => {
    logger.error(message, context || 'ScriptLoader', { data, error });
  }).catch(() => {
    // Fallback to console if logger is not available
    console.error(`[ERROR] [${context || 'ScriptLoader'}] ${message}`, data || '', error || '');
  });
};

export interface ScriptExecutionResult {
  success: boolean;
  scriptName: string;
  executionTime: number;
  error?: string;
  rowsAffected?: number;
}

export class ScriptLoader {
  private static instance: ScriptLoader;
  private executedScripts: Set<string> = new Set();

  private constructor() {}

  static getInstance(): ScriptLoader {
    if (!ScriptLoader.instance) {
      ScriptLoader.instance = new ScriptLoader();
    }
    return ScriptLoader.instance;
  }

  /**
   * Load and execute a SQL script from the assets folder
   */
  async executeScript(scriptPath: string, executeQuery: (sql: string, params?: any[]) => Promise<any>): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    const scriptName = scriptPath.split('/').pop() || 'unknown';

    try {
      logDebug(`📜 Loading SQL script: ${scriptName}`, 'ScriptLoader');
      
      // Load the script content
      const scriptContent = await this.loadScriptContent(scriptPath);
      
      if (!scriptContent) {
        throw new Error(`Failed to load script: ${scriptPath}`);
      }

      // Split the script into individual statements
      const statements = this.parseScript(scriptContent);
      
      logDebug(`📜 Executing ${statements.length} statements from ${scriptName}`, 'ScriptLoader');

      let totalRowsAffected = 0;

      // Execute each statement
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          try {
            logDebug(`📜 Executing statement ${i + 1}/${statements.length}`, 'ScriptLoader', { 
              statementPreview: statement.substring(0, 100) + (statement.length > 100 ? '...' : '') 
            });
            
            const result = await executeQuery(statement);
            if (result.data && typeof result.data === 'object' && 'changes' in result.data) {
              totalRowsAffected += result.data.changes || 0;
            }
          } catch (error) {
            logError(`❌ Statement ${i + 1} failed`, 'ScriptLoader', { 
              statement: statement.substring(0, 200) + (statement.length > 200 ? '...' : ''),
              error: error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
        }
      }

      const executionTime = Date.now() - startTime;
      this.executedScripts.add(scriptName);

      logDebug(`✅ Script executed successfully: ${scriptName}`, 'ScriptLoader', { 
        executionTime, 
        statementsExecuted: statements.length,
        rowsAffected: totalRowsAffected 
      });

      return {
        success: true,
        scriptName,
        executionTime,
        rowsAffected: totalRowsAffected
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logError(`❌ Script execution failed: ${scriptName}`, 'ScriptLoader', { 
        scriptName, 
        executionTime, 
        error: errorMessage 
      });

      return {
        success: false,
        scriptName,
        executionTime,
        error: errorMessage
      };
    }
  }

  /**
   * Load script content from the assets folder using Node.js fs
   */
  private async loadScriptContent(scriptPath: string): Promise<string | null> {
    try {
      logDebug(`Loading script via fs: ${scriptPath}`, 'ScriptLoader');
      
      // Import fs dynamically to avoid build issues
      const fs = await import('fs');
      const path = await import('path');
      
      // Convert src/assets path to dist/assets path
      const relativePath = scriptPath.replace('src/assets/', 'assets/');
      const fullPath = path.join(process.cwd(), 'dist', relativePath);
      
      logDebug(`Reading from: ${fullPath}`, 'ScriptLoader');
      
      const content = fs.readFileSync(fullPath, 'utf8');
      logDebug(`Successfully loaded script: ${scriptPath} (${content.length} characters)`, 'ScriptLoader');
      return content;
    } catch (error) {
      logError(`Failed to load script: ${scriptPath}`, 'ScriptLoader', { 
        error: error instanceof Error ? error.message : String(error),
        scriptPath
      }, error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * Parse SQL script into individual statements
   */
  private parseScript(scriptContent: string): string[] {
    // Remove comments
    const withoutComments = scriptContent
      .replace(/--.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

    // Split by semicolon, but be careful with semicolons inside JSON strings
    const statements: string[] = [];
    let currentStatement = '';
    let inString = false;
    let stringChar = '';
    let escapeNext = false;
    let braceLevel = 0; // Track JSON brace levels

    for (let i = 0; i < withoutComments.length; i++) {
      const char = withoutComments[i];
      
      if (escapeNext) {
        currentStatement += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        currentStatement += char;
        continue;
      }

      // Track JSON braces
      if (!inString) {
        if (char === '{') braceLevel++;
        if (char === '}') braceLevel--;
      }

      if (!inString && (char === "'" || char === '"')) {
        inString = true;
        stringChar = char;
        currentStatement += char;
        continue;
      }

      if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
        currentStatement += char;
        continue;
      }

      // Only split on semicolon if we're not in a string and not inside JSON braces
      if (char === ';' && !inString && braceLevel === 0) {
        const trimmed = currentStatement.trim();
        if (trimmed.length > 0) {
          statements.push(trimmed);
        }
        currentStatement = '';
        continue;
      }

      currentStatement += char;
    }

    // Add the last statement if it exists
    const lastTrimmed = currentStatement.trim();
    if (lastTrimmed.length > 0) {
      statements.push(lastTrimmed);
    }

    // Debug: Log the parsed statements
    logDebug(`📜 Parsed ${statements.length} statements`, 'ScriptLoader', {
      statements: statements.map((stmt, idx) => ({
        index: idx + 1,
        preview: stmt.substring(0, 100) + (stmt.length > 100 ? '...' : ''),
        length: stmt.length
      }))
    });

    return statements;
  }

  /**
   * Execute all DDL scripts in order
   */
  async executeDDLScripts(executeQuery: (sql: string, params?: any[]) => Promise<any>): Promise<ScriptExecutionResult[]> {
    const ddlScripts = [
      'src/assets/db/ddl/000_schema_version.sql', // Must be first - tracks schema version
      'src/assets/db/ddl/001_languages.sql',
      'src/assets/db/ddl/002_translations.sql',
      'src/assets/db/ddl/004_auth_providers.sql', // Auth providers table
      'src/assets/db/ddl/005_connections.sql', // Connections table with auth_provider_id and encrypted_credentials
      'src/assets/db/ddl/006_app_settings.sql',
      'src/assets/db/ddl/007_saved_queries.sql',
      'src/assets/db/ddl/008_query_history.sql',
      'src/assets/db/ddl/009_schema_cache.sql',
      'src/assets/db/ddl/003_indexes.sql' // Must be last - creates indexes for all tables
    ];

    const results: ScriptExecutionResult[] = [];

    for (const script of ddlScripts) {
      const result = await this.executeScript(script, executeQuery);
      results.push(result);
      
      if (!result.success) {
        logError(`❌ DDL script failed: ${script}`, 'ScriptLoader', { error: result.error });
        break; // Stop execution if a script fails
      }
    }

    return results;
  }

  /**
   * Execute all DML scripts in order
   */
  async executeDMLScripts(executeQuery: (sql: string, params?: any[]) => Promise<any>): Promise<ScriptExecutionResult[]> {
    const dmlScripts = [
      'src/assets/db/dml/001_initial_languages.sql',
      'src/assets/db/dml/translations/002_initial_translations_en.sql',
      'src/assets/db/dml/003_initial_app_settings.sql', // App settings data
      'src/assets/db/dml/004_initial_auth_providers.sql' // Initial auth providers data
    ];

    const results: ScriptExecutionResult[] = [];

    for (const script of dmlScripts) {
      const result = await this.executeScript(script, executeQuery);
      results.push(result);
      
      if (!result.success) {
        logError(`❌ DML script failed: ${script}`, 'ScriptLoader', { error: result.error });
        break; // Stop execution if a script fails
      }
    }

    return results;
  }

  /**
   * Check if a script has been executed
   */
  hasExecuted(scriptName: string): boolean {
    return this.executedScripts.has(scriptName);
  }

  /**
   * Get list of executed scripts
   */
  getExecutedScripts(): string[] {
    return Array.from(this.executedScripts);
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executedScripts.clear();
  }
}

// Export the script loader instance
const scriptLoader = ScriptLoader.getInstance();
export { scriptLoader };
