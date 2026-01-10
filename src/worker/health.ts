/**
 * Neural Intelligence Platform - Worker Health Monitoring
 *
 * Health monitoring and metrics tracking for the Convex event poller/worker.
 * Provides real-time visibility into worker performance and health status.
 *
 * Features:
 * - Event processing metrics (processed, failed, retried)
 * - Processing latency tracking with percentiles
 * - Health status determination
 * - Metrics export for monitoring systems
 *
 * @version 1.0.0
 * @author Sub-Agent 4: Feature Engineer
 */

// =============================================================================
// METRICS TYPES
// =============================================================================

/**
 * Counter metrics that track cumulative totals.
 */
export interface CounterMetrics {
  /** Total events successfully processed */
  eventsProcessed: number;

  /** Total events that failed after all retries */
  eventsFailed: number;

  /** Total retry attempts across all events */
  eventsRetried: number;

  /** Total poll cycles executed */
  pollCycles: number;

  /** Total empty poll cycles (no events found) */
  emptyPollCycles: number;

  /** Total lease renewals performed */
  leaseRenewals: number;

  /** Total lease renewal failures */
  leaseRenewalFailures: number;

  /** Total events skipped (already processed) */
  eventsSkipped: number;

  /** Total non-retryable errors */
  nonRetryableErrors: number;
}

/**
 * Gauge metrics that track current values.
 */
export interface GaugeMetrics {
  /** Currently processing events */
  activeEvents: number;

  /** Current queue depth (if known) */
  queueDepth: number;

  /** Last poll duration in ms */
  lastPollDurationMs: number;

  /** Last processing duration in ms */
  lastProcessingDurationMs: number;

  /** Time since last successful event in ms */
  timeSinceLastSuccessMs: number;

  /** Time since last poll in ms */
  timeSinceLastPollMs: number;
}

/**
 * Latency histogram for tracking processing times.
 */
export interface LatencyHistogram {
  /** Minimum latency observed */
  min: number;

  /** Maximum latency observed */
  max: number;

  /** Sum of all latencies (for calculating mean) */
  sum: number;

  /** Count of observations */
  count: number;

  /** Latency buckets for histogram */
  buckets: Map<number, number>;
}

/**
 * Health status enum.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Detailed health check result.
 */
export interface HealthCheckResult {
  /** Overall health status */
  status: HealthStatus;

  /** Worker ID */
  workerId: string;

  /** Timestamp of health check */
  timestamp: number;

  /** Uptime in milliseconds */
  uptimeMs: number;

  /** Counter metrics */
  counters: CounterMetrics;

  /** Gauge metrics */
  gauges: GaugeMetrics;

  /** Latency statistics */
  latency: LatencyStats;

  /** Individual component health checks */
  components: ComponentHealth[];

  /** Human-readable message */
  message: string;
}

/**
 * Latency statistics computed from histogram.
 */
export interface LatencyStats {
  /** Minimum processing time */
  min: number;

  /** Maximum processing time */
  max: number;

  /** Average processing time */
  avg: number;

  /** 50th percentile (median) */
  p50: number;

  /** 95th percentile */
  p95: number;

  /** 99th percentile */
  p99: number;

  /** Total observations */
  count: number;
}

/**
 * Component health status.
 */
export interface ComponentHealth {
  /** Component name */
  name: string;

  /** Component health status */
  status: HealthStatus;

  /** Last check timestamp */
  lastCheck: number;

  /** Error message if unhealthy */
  error?: string;
}

// =============================================================================
// HEALTH MONITOR CLASS
// =============================================================================

/**
 * Health monitor for tracking worker metrics and status.
 */
export class HealthMonitor {
  private workerId: string;
  private startTime: number;

  // Counter metrics
  private counters: CounterMetrics = {
    eventsProcessed: 0,
    eventsFailed: 0,
    eventsRetried: 0,
    pollCycles: 0,
    emptyPollCycles: 0,
    leaseRenewals: 0,
    leaseRenewalFailures: 0,
    eventsSkipped: 0,
    nonRetryableErrors: 0,
  };

  // Gauge metrics
  private gauges: GaugeMetrics = {
    activeEvents: 0,
    queueDepth: 0,
    lastPollDurationMs: 0,
    lastProcessingDurationMs: 0,
    timeSinceLastSuccessMs: 0,
    timeSinceLastPollMs: 0,
  };

  // Latency tracking
  private latencyHistogram: LatencyHistogram;
  private latencyValues: number[] = [];
  private readonly maxLatencyValues = 1000; // Keep last 1000 values for percentiles

  // Timestamps
  private lastSuccessTime: number = 0;
  private lastPollTime: number = 0;
  private lastHealthCheck: number = 0;

  // Component health
  private componentHealth: Map<string, ComponentHealth> = new Map();

  // Health thresholds
  private readonly healthThresholds = {
    /** Max time without success before degraded */
    maxTimeSinceSuccessMs: 300000, // 5 minutes
    /** Max time without success before unhealthy */
    criticalTimeSinceSuccessMs: 600000, // 10 minutes
    /** Max consecutive failures before degraded */
    maxConsecutiveFailures: 5,
    /** Max error rate before degraded (0-1) */
    maxErrorRate: 0.1, // 10%
    /** Min processing rate before degraded (events/min) */
    minProcessingRate: 0, // Disabled by default
  };

  constructor(workerId: string) {
    this.workerId = workerId;
    this.startTime = Date.now();
    this.latencyHistogram = this.createEmptyHistogram();
  }

  // ===========================================================================
  // COUNTER OPERATIONS
  // ===========================================================================

  /**
   * Record a successfully processed event.
   */
  recordEventProcessed(latencyMs: number): void {
    this.counters.eventsProcessed++;
    this.lastSuccessTime = Date.now();
    this.recordLatency(latencyMs);
    this.gauges.lastProcessingDurationMs = latencyMs;
  }

  /**
   * Record a failed event (after all retries exhausted).
   */
  recordEventFailed(): void {
    this.counters.eventsFailed++;
  }

  /**
   * Record a retry attempt.
   */
  recordEventRetried(): void {
    this.counters.eventsRetried++;
  }

  /**
   * Record a poll cycle.
   */
  recordPollCycle(durationMs: number, eventCount: number): void {
    this.counters.pollCycles++;
    this.lastPollTime = Date.now();
    this.gauges.lastPollDurationMs = durationMs;

    if (eventCount === 0) {
      this.counters.emptyPollCycles++;
    }
  }

  /**
   * Record a lease renewal.
   */
  recordLeaseRenewal(success: boolean): void {
    if (success) {
      this.counters.leaseRenewals++;
    } else {
      this.counters.leaseRenewalFailures++;
    }
  }

  /**
   * Record a skipped event (already processed).
   */
  recordEventSkipped(): void {
    this.counters.eventsSkipped++;
  }

  /**
   * Record a non-retryable error.
   */
  recordNonRetryableError(): void {
    this.counters.nonRetryableErrors++;
  }

  // ===========================================================================
  // GAUGE OPERATIONS
  // ===========================================================================

  /**
   * Set the number of active events being processed.
   */
  setActiveEvents(count: number): void {
    this.gauges.activeEvents = count;
  }

  /**
   * Increment active event count.
   */
  incrementActiveEvents(): void {
    this.gauges.activeEvents++;
  }

  /**
   * Decrement active event count.
   */
  decrementActiveEvents(): void {
    this.gauges.activeEvents = Math.max(0, this.gauges.activeEvents - 1);
  }

  /**
   * Set the current queue depth.
   */
  setQueueDepth(depth: number): void {
    this.gauges.queueDepth = depth;
  }

  // ===========================================================================
  // LATENCY TRACKING
  // ===========================================================================

  /**
   * Record a latency observation.
   */
  private recordLatency(latencyMs: number): void {
    // Update histogram
    this.latencyHistogram.count++;
    this.latencyHistogram.sum += latencyMs;
    this.latencyHistogram.min = Math.min(this.latencyHistogram.min, latencyMs);
    this.latencyHistogram.max = Math.max(this.latencyHistogram.max, latencyMs);

    // Update bucket
    const bucket = this.getBucket(latencyMs);
    const current = this.latencyHistogram.buckets.get(bucket) || 0;
    this.latencyHistogram.buckets.set(bucket, current + 1);

    // Store for percentile calculation
    this.latencyValues.push(latencyMs);
    if (this.latencyValues.length > this.maxLatencyValues) {
      this.latencyValues.shift();
    }
  }

  /**
   * Get the histogram bucket for a latency value.
   */
  private getBucket(latencyMs: number): number {
    // Buckets: 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, +Inf
    const buckets = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    for (const bucket of buckets) {
      if (latencyMs <= bucket) {
        return bucket;
      }
    }
    return Infinity;
  }

  /**
   * Create an empty latency histogram.
   */
  private createEmptyHistogram(): LatencyHistogram {
    return {
      min: Infinity,
      max: -Infinity,
      sum: 0,
      count: 0,
      buckets: new Map(),
    };
  }

  /**
   * Calculate latency statistics.
   */
  private calculateLatencyStats(): LatencyStats {
    if (this.latencyValues.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        count: 0,
      };
    }

    const sorted = [...this.latencyValues].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      min: sorted[0],
      max: sorted[count - 1],
      avg: this.latencyHistogram.sum / this.latencyHistogram.count,
      p50: this.getPercentile(sorted, 50),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99),
      count: this.latencyHistogram.count,
    };
  }

  /**
   * Get a percentile value from sorted array.
   */
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // ===========================================================================
  // COMPONENT HEALTH
  // ===========================================================================

  /**
   * Update component health status.
   */
  updateComponentHealth(name: string, status: HealthStatus, error?: string): void {
    this.componentHealth.set(name, {
      name,
      status,
      lastCheck: Date.now(),
      error,
    });
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Perform a health check and return the result.
   */
  getHealthCheck(): HealthCheckResult {
    const now = Date.now();
    this.lastHealthCheck = now;

    // Update time-based gauges
    this.gauges.timeSinceLastSuccessMs = this.lastSuccessTime > 0
      ? now - this.lastSuccessTime
      : now - this.startTime;
    this.gauges.timeSinceLastPollMs = this.lastPollTime > 0
      ? now - this.lastPollTime
      : now - this.startTime;

    // Calculate overall health status
    const status = this.determineHealthStatus();
    const message = this.generateHealthMessage(status);

    return {
      status,
      workerId: this.workerId,
      timestamp: now,
      uptimeMs: now - this.startTime,
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      latency: this.calculateLatencyStats(),
      components: Array.from(this.componentHealth.values()),
      message,
    };
  }

  /**
   * Determine overall health status based on metrics.
   */
  private determineHealthStatus(): HealthStatus {
    // Check for critical issues first
    if (this.gauges.timeSinceLastSuccessMs > this.healthThresholds.criticalTimeSinceSuccessMs) {
      // Only unhealthy if we've actually tried processing
      if (this.counters.pollCycles > 0 && this.counters.eventsProcessed === 0 && this.counters.eventsFailed > 0) {
        return 'unhealthy';
      }
    }

    // Check component health
    for (const component of this.componentHealth.values()) {
      if (component.status === 'unhealthy') {
        return 'unhealthy';
      }
    }

    // Check for degraded conditions
    const errorRate = this.calculateErrorRate();
    if (errorRate > this.healthThresholds.maxErrorRate) {
      return 'degraded';
    }

    if (this.gauges.timeSinceLastSuccessMs > this.healthThresholds.maxTimeSinceSuccessMs) {
      // Only degraded if we've had some activity
      if (this.counters.pollCycles > 0 && this.counters.eventsProcessed > 0) {
        return 'degraded';
      }
    }

    for (const component of this.componentHealth.values()) {
      if (component.status === 'degraded') {
        return 'degraded';
      }
    }

    // If we have no data yet, status is unknown
    if (this.counters.pollCycles === 0) {
      return 'unknown';
    }

    return 'healthy';
  }

  /**
   * Calculate the error rate.
   */
  private calculateErrorRate(): number {
    const total = this.counters.eventsProcessed + this.counters.eventsFailed;
    if (total === 0) return 0;
    return this.counters.eventsFailed / total;
  }

  /**
   * Generate a human-readable health message.
   */
  private generateHealthMessage(status: HealthStatus): string {
    const uptimeMinutes = Math.floor((Date.now() - this.startTime) / 60000);
    const errorRate = (this.calculateErrorRate() * 100).toFixed(1);

    switch (status) {
      case 'healthy':
        return `Worker healthy. Uptime: ${uptimeMinutes}m, Processed: ${this.counters.eventsProcessed}, Error rate: ${errorRate}%`;
      case 'degraded':
        return `Worker degraded. Error rate: ${errorRate}%, Time since last success: ${this.gauges.timeSinceLastSuccessMs}ms`;
      case 'unhealthy':
        return `Worker unhealthy. Failed: ${this.counters.eventsFailed}, No successful processing in ${this.gauges.timeSinceLastSuccessMs}ms`;
      case 'unknown':
        return `Worker starting up. No processing activity yet.`;
      default:
        return 'Unknown health status';
    }
  }

  // ===========================================================================
  // METRICS EXPORT
  // ===========================================================================

  /**
   * Get metrics in Prometheus-compatible format.
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    const labels = `worker_id="${this.workerId}"`;

    // Counter metrics
    lines.push(`# HELP worker_events_processed_total Total events successfully processed`);
    lines.push(`# TYPE worker_events_processed_total counter`);
    lines.push(`worker_events_processed_total{${labels}} ${this.counters.eventsProcessed}`);

    lines.push(`# HELP worker_events_failed_total Total events that failed`);
    lines.push(`# TYPE worker_events_failed_total counter`);
    lines.push(`worker_events_failed_total{${labels}} ${this.counters.eventsFailed}`);

    lines.push(`# HELP worker_events_retried_total Total retry attempts`);
    lines.push(`# TYPE worker_events_retried_total counter`);
    lines.push(`worker_events_retried_total{${labels}} ${this.counters.eventsRetried}`);

    lines.push(`# HELP worker_poll_cycles_total Total poll cycles`);
    lines.push(`# TYPE worker_poll_cycles_total counter`);
    lines.push(`worker_poll_cycles_total{${labels}} ${this.counters.pollCycles}`);

    // Gauge metrics
    lines.push(`# HELP worker_active_events Current events being processed`);
    lines.push(`# TYPE worker_active_events gauge`);
    lines.push(`worker_active_events{${labels}} ${this.gauges.activeEvents}`);

    lines.push(`# HELP worker_queue_depth Current queue depth`);
    lines.push(`# TYPE worker_queue_depth gauge`);
    lines.push(`worker_queue_depth{${labels}} ${this.gauges.queueDepth}`);

    // Latency histogram
    const latencyStats = this.calculateLatencyStats();
    lines.push(`# HELP worker_processing_duration_ms Processing latency in milliseconds`);
    lines.push(`# TYPE worker_processing_duration_ms summary`);
    lines.push(`worker_processing_duration_ms{${labels},quantile="0.5"} ${latencyStats.p50}`);
    lines.push(`worker_processing_duration_ms{${labels},quantile="0.95"} ${latencyStats.p95}`);
    lines.push(`worker_processing_duration_ms{${labels},quantile="0.99"} ${latencyStats.p99}`);
    lines.push(`worker_processing_duration_ms_sum{${labels}} ${this.latencyHistogram.sum}`);
    lines.push(`worker_processing_duration_ms_count{${labels}} ${this.latencyHistogram.count}`);

    // Uptime
    lines.push(`# HELP worker_uptime_seconds Worker uptime in seconds`);
    lines.push(`# TYPE worker_uptime_seconds gauge`);
    lines.push(`worker_uptime_seconds{${labels}} ${(Date.now() - this.startTime) / 1000}`);

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON object.
   */
  getJsonMetrics(): Record<string, unknown> {
    return {
      workerId: this.workerId,
      timestamp: Date.now(),
      uptimeMs: Date.now() - this.startTime,
      counters: this.counters,
      gauges: this.gauges,
      latency: this.calculateLatencyStats(),
      components: Array.from(this.componentHealth.values()),
      errorRate: this.calculateErrorRate(),
    };
  }

  // ===========================================================================
  // RESET
  // ===========================================================================

  /**
   * Reset all metrics (useful for testing or restart).
   */
  reset(): void {
    this.counters = {
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsRetried: 0,
      pollCycles: 0,
      emptyPollCycles: 0,
      leaseRenewals: 0,
      leaseRenewalFailures: 0,
      eventsSkipped: 0,
      nonRetryableErrors: 0,
    };

    this.gauges = {
      activeEvents: 0,
      queueDepth: 0,
      lastPollDurationMs: 0,
      lastProcessingDurationMs: 0,
      timeSinceLastSuccessMs: 0,
      timeSinceLastPollMs: 0,
    };

    this.latencyHistogram = this.createEmptyHistogram();
    this.latencyValues = [];
    this.lastSuccessTime = 0;
    this.lastPollTime = 0;
    this.componentHealth.clear();
    this.startTime = Date.now();
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new health monitor instance.
 */
export function createHealthMonitor(workerId: string): HealthMonitor {
  return new HealthMonitor(workerId);
}
