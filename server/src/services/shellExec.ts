import { spawn } from 'child_process';
import { AppError, ErrorCode } from '../types/errors.js';

/**
 * Configuration for shell command execution
 */
export interface ShellExecConfig {
  /** Maximum execution time in milliseconds */
  timeout?: number;
  /** Maximum output size in bytes */
  maxOutputSize?: number;
  /** Allowed commands whitelist (if empty, all commands allowed - use with caution) */
  allowedCommands?: string[];
}

/**
 * Result of shell command execution
 */
export interface ShellExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const DEFAULT_MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

/**
 * Execute a shell command with strict timeout and output size limits
 * 
 * @param command - The command to execute
 * @param args - Command arguments
 * @param config - Execution configuration
 * @returns Promise with execution result
 */
export async function shellExec(
  command: string,
  args: string[] = [],
  config: ShellExecConfig = {}
): Promise<ShellExecResult> {
  const {
    timeout = DEFAULT_TIMEOUT,
    maxOutputSize = DEFAULT_MAX_OUTPUT_SIZE,
    allowedCommands = [],
  } = config;

  // Check if command is whitelisted (if whitelist is provided)
  if (allowedCommands.length > 0 && !allowedCommands.includes(command)) {
    throw new AppError(
      ErrorCode.ERR_SHELL_COMMAND_NOT_ALLOWED,
      `Command '${command}' is not in the whitelist`,
      403
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    
    let stdout = '';
    let stderr = '';
    let killed = false;
    let outputSizeExceeded = false;

    // Set timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
      reject(
        new AppError(
          ErrorCode.ERR_SHELL_TIMEOUT,
          `Command exceeded timeout of ${timeout}ms`,
          408
        )
      );
    }, timeout);

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      if (outputSizeExceeded) return;
      
      stdout += data.toString();
      
      if (stdout.length > maxOutputSize) {
        outputSizeExceeded = true;
        child.kill('SIGKILL');
        reject(
          new AppError(
            ErrorCode.ERR_SHELL_OUTPUT_TOO_LARGE,
            `Output exceeded maximum size of ${maxOutputSize} bytes`,
            413
          )
        );
      }
    });

    // Capture stderr
    child.stderr?.on('data', (data: Buffer) => {
      if (outputSizeExceeded) return;
      
      stderr += data.toString();
      
      if (stderr.length > maxOutputSize) {
        outputSizeExceeded = true;
        child.kill('SIGKILL');
        reject(
          new AppError(
            ErrorCode.ERR_SHELL_OUTPUT_TOO_LARGE,
            `Error output exceeded maximum size of ${maxOutputSize} bytes`,
            413
          )
        );
      }
    });

    // Handle process exit
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (killed || outputSizeExceeded) {
        return; // Already handled by timeout or size limit
      }

      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code,
      });
    });

    // Handle spawn errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(
        new AppError(
          ErrorCode.ERR_SHELL_EXECUTION_FAILED,
          `Failed to execute command: ${error.message}`,
          500,
          { originalError: error.message }
        )
      );
    });
  });
}
