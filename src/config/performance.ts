/**
 * Performance Configuration
 * 
 * Optimized settings for lightweight operation
 */

export const PerformanceConfig = {
  // Database optimizations
  database: {
    // Use synchronous operations for simplicity and reduced complexity
    synchronous: true,
    
    // SQLite optimizations
    pragmas: [
      'PRAGMA journal_mode = WAL',          // Write-Ahead Logging for better concurrency
      'PRAGMA synchronous = NORMAL',        // Balance between safety and speed
      'PRAGMA cache_size = -10000',         // 10MB cache
      'PRAGMA temp_store = MEMORY',         // Use memory for temp tables
      'PRAGMA mmap_size = 30000000',        // 30MB memory-mapped I/O
      'PRAGMA busy_timeout = 5000',         // 5 second timeout for locks
      'PRAGMA optimize'                     // Optimize on startup
    ],
    
    // Connection pool settings
    maxConnections: 1,                      // Single connection for simplicity
    idleTimeout: 60000                      // 1 minute idle timeout
  },
  
  // File sync optimizations
  fileSync: {
    // Batch file operations
    batchSize: 10,
    batchDelayMs: 100,
    
    // File watching debounce
    watchDebounceMs: 1000,
    
    // Max file size for markdown (prevent large file issues)
    maxFileSizeKB: 100,
    
    // Directory scan interval
    scanIntervalMs: 30000                   // 30 seconds
  },
  
  // Memory optimizations
  memory: {
    // Context cache settings
    maxContextCacheSize: 100,               // Max contexts to keep in memory
    contextTTLMs: 300000,                   // 5 minute TTL
    
    // Task cache settings  
    maxTaskCacheSize: 500,                  // Max tasks to cache
    taskTTLMs: 600000,                      // 10 minute TTL
    
    // String length limits
    maxStringLength: 10000,                 // Max string length for fields
    maxArrayLength: 1000                    // Max array length
  },
  
  // Startup optimizations
  startup: {
    // Lazy loading modules
    lazyLoadModules: [
      'spec_monitor',                       // Only load if .spec monitoring enabled
      'file_watcher'                        // Only load if file sync enabled
    ],
    
    // Parallel initialization
    parallelInit: true,
    
    // Skip optional features in production
    skipInProduction: [
      'debug_logging',
      'verbose_errors',
      'development_tools'
    ]
  },
  
  // Runtime optimizations
  runtime: {
    // Request handling
    maxRequestSize: 1048576,                // 1MB max request size
    requestTimeout: 30000,                  // 30 second timeout
    
    // Tool execution
    toolExecutionTimeout: 10000,            // 10 second timeout per tool
    maxConcurrentTools: 5,                  // Max concurrent tool executions
    
    // Error handling
    stackTraceLimit: isProduction() ? 5 : 50,
    
    // Logging
    logLevel: isProduction() ? 'error' : 'info'
  }
};

/**
 * Apply performance optimizations
 */
export function applyOptimizations(): void {
  // Set V8 options for better memory usage
  if (process.env.NODE_ENV === 'production') {
    // Limit heap size for consistent memory usage
    const maxHeapSize = process.env.MAX_HEAP_SIZE || '256';
    process.env.NODE_OPTIONS = `--max-old-space-size=${maxHeapSize}`;
    
    // Disable source maps in production
    process.env.NODE_NO_SOURCE_MAPS = '1';
    
    // Set production flag
    process.env.NODE_ENV = 'production';
  }
  
  // Configure error stack trace limit
  Error.stackTraceLimit = PerformanceConfig.runtime.stackTraceLimit;
  
  // Optimize promise rejection handling
  process.on('unhandledRejection', (reason, promise) => {
    if (isProduction()) {
      console.error('Unhandled rejection:', reason);
    } else {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
    }
  });
  
  // Optimize process warnings
  if (isProduction()) {
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
      // Only log critical warnings in production
      if (warning.name === 'DeprecationWarning') return;
      console.warn('Warning:', warning.message);
    });
  }
}

/**
 * Get optimized database connection options
 */
export function getOptimizedDbOptions(): any {
  return {
    verbose: isProduction() ? undefined : console.log,
    fileMustExist: false,
    timeout: 5000 // 5 second timeout from pragmas
  };
}

/**
 * Check if running in production
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  private interval: NodeJS.Timeout | null = null;
  private threshold = 0.8; // 80% memory threshold
  
  start(intervalMs = 60000): void {
    if (this.interval) return;
    
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsed = usage.heapUsed / usage.heapTotal;
      
      if (heapUsed > this.threshold) {
        console.warn(`High memory usage: ${(heapUsed * 100).toFixed(1)}%`);
        
        // Trigger garbage collection if available
        if (global.gc) {
          global.gc();
          console.log('Garbage collection triggered');
        }
      }
    }, intervalMs);
  }
  
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  
  getStats(): any {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024)
    };
  }
}

/**
 * Startup time tracker
 */
export class StartupTimer {
  private startTime = Date.now();
  private milestones = new Map<string, number>();
  
  mark(milestone: string): void {
    this.milestones.set(milestone, Date.now() - this.startTime);
  }
  
  getReport(): any {
    const total = Date.now() - this.startTime;
    const report: any = {
      totalMs: total,
      milestones: {}
    };
    
    this.milestones.forEach((time, milestone) => {
      report.milestones[milestone] = `${time}ms`;
    });
    
    return report;
  }
}