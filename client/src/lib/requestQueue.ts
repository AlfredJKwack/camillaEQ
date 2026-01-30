/**
 * Request queue for serializing WebSocket requests per socket
 * Ensures only one request is in-flight at a time with proper cancellation
 */

interface QueuedTask<T> {
  execute: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

export class SocketRequestQueue {
  private queue: QueuedTask<any>[] = [];
  private running = false;
  private activeController: AbortController | null = null;

  /**
   * Enqueue a task to run serially with cancellation support
   */
  enqueue<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ execute: task, resolve, reject });
      this.processNext();
    });
  }

  /**
   * Process the next task in queue
   */
  private async processNext(): Promise<void> {
    if (this.running || this.queue.length === 0) {
      return;
    }

    this.running = true;
    const task = this.queue.shift()!;
    
    // Create abort controller for this task
    this.activeController = new AbortController();

    try {
      const result = await task.execute(this.activeController.signal);
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.running = false;
      this.activeController = null;
      this.processNext();
    }
  }

  /**
   * Cancel all pending and in-flight requests
   */
  cancelAll(reason: Error): void {
    // Abort active task if any
    if (this.activeController) {
      this.activeController.abort(reason);
      this.activeController = null;
    }

    // Reject all queued tasks
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      task.reject(reason);
    }

    this.running = false;
  }
}
