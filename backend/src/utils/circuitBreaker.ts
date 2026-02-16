export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeout = 60000,
    private readonly name = 'default'
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - (this.lastFailureTime || 0) > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      console.log(`[CircuitBreaker:${this.name}] Transitioning to CLOSED`);
    }
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.error(`[CircuitBreaker:${this.name}] Transitioning to OPEN after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      name: this.name,
    };
  }
}

export const blockchainCircuitBreaker = new CircuitBreaker(5, 60000, 'blockchain');
export const databaseCircuitBreaker = new CircuitBreaker(3, 30000, 'database');
