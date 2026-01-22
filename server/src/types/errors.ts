/**
 * Standard error codes for the API
 */
export enum ErrorCode {
  // Config errors
  ERR_CONFIG_NOT_FOUND = 'ERR_CONFIG_NOT_FOUND',
  ERR_CONFIG_INVALID_JSON = 'ERR_CONFIG_INVALID_JSON',
  ERR_CONFIG_TOO_LARGE = 'ERR_CONFIG_TOO_LARGE',
  ERR_CONFIG_WRITE_FAILED = 'ERR_CONFIG_WRITE_FAILED',
  
  // Shell/System errors
  ERR_SHELL_TIMEOUT = 'ERR_SHELL_TIMEOUT',
  ERR_SHELL_OUTPUT_TOO_LARGE = 'ERR_SHELL_OUTPUT_TOO_LARGE',
  ERR_SHELL_COMMAND_NOT_ALLOWED = 'ERR_SHELL_COMMAND_NOT_ALLOWED',
  ERR_SHELL_EXECUTION_FAILED = 'ERR_SHELL_EXECUTION_FAILED',
  
  // Generic errors
  ERR_INTERNAL_SERVER = 'ERR_INTERNAL_SERVER',
  ERR_NOT_FOUND = 'ERR_NOT_FOUND',
  ERR_BAD_REQUEST = 'ERR_BAD_REQUEST',
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode | string;
    message: string;
    statusCode: number;
    details?: unknown;
  };
}

/**
 * Application error class with structured error information
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode | string,
    public message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON(): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
      },
    };
  }
}
