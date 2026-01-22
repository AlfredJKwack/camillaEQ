import { describe, it, expect } from '@jest/globals';
import { shellExec } from '../shellExec.js';
import { AppError, ErrorCode } from '../../types/errors.js';

describe('shellExec', () => {
  describe('successful execution', () => {
    it('should execute a simple command and return stdout', async () => {
      const result = await shellExec('echo', ['hello']);
      
      expect(result.success).toBe(true);
      expect(result.stdout).toBe('hello');
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    });

    it('should execute command with multiple arguments', async () => {
      const result = await shellExec('echo', ['hello', 'world']);
      
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('hello');
      expect(result.stdout).toContain('world');
    });
  });

  describe('command whitelist', () => {
    it('should allow whitelisted commands', async () => {
      const result = await shellExec('echo', ['test'], {
        allowedCommands: ['echo', 'ls'],
      });
      
      expect(result.success).toBe(true);
      expect(result.stdout).toBe('test');
    });

    it('should reject non-whitelisted commands', async () => {
      await expect(
        shellExec('whoami', [], {
          allowedCommands: ['echo', 'ls'],
        })
      ).rejects.toThrow(AppError);

      try {
        await shellExec('whoami', [], {
          allowedCommands: ['echo', 'ls'],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_SHELL_COMMAND_NOT_ALLOWED);
        expect(appError.statusCode).toBe(403);
      }
    });

    it('should allow all commands when whitelist is empty', async () => {
      const result = await shellExec('echo', ['no whitelist'], {
        allowedCommands: [],
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running commands', async () => {
      await expect(
        shellExec('sleep', ['5'], { timeout: 100 })
      ).rejects.toThrow(AppError);

      try {
        await shellExec('sleep', ['5'], { timeout: 100 });
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_SHELL_TIMEOUT);
        expect(appError.statusCode).toBe(408);
      }
    }, 10000);
  });

  describe('output size limits', () => {
    it('should handle output within size limit', async () => {
      const result = await shellExec('echo', ['small output'], {
        maxOutputSize: 1000,
      });
      
      expect(result.success).toBe(true);
      expect(result.stdout).toBe('small output');
    });

    it('should reject output exceeding size limit', async () => {
      // Generate output larger than limit using 'yes' command (limited by timeout)
      await expect(
        shellExec('yes', [], {
          maxOutputSize: 100,
          timeout: 5000,
        })
      ).rejects.toThrow(AppError);

      try {
        await shellExec('yes', [], {
          maxOutputSize: 100,
          timeout: 5000,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_SHELL_OUTPUT_TOO_LARGE);
        expect(appError.statusCode).toBe(413);
      }
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle non-zero exit codes', async () => {
      const result = await shellExec('ls', ['/nonexistent']);
      
      expect(result.success).toBe(false);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it('should handle command not found', async () => {
      await expect(
        shellExec('nonexistentcommand12345', [])
      ).rejects.toThrow(AppError);

      try {
        await shellExec('nonexistentcommand12345', []);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_SHELL_EXECUTION_FAILED);
        expect(appError.statusCode).toBe(500);
      }
    });
  });
});
