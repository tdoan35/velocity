/**
 * Structured logging utility for container observability
 */

const SESSION_ID = require('uuid').v4();
const START_TIME = Date.now();

/**
 * Creates a structured log entry with consistent format
 */
function createLogEntry(level, message, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    session_id: SESSION_ID,
    project_id: process.env.PROJECT_ID || null,
    container_id: process.env.FLY_MACHINE_ID || 'local',
    uptime_ms: Date.now() - START_TIME,
    ...data
  };
}

/**
 * Structured logger with different levels
 */
const logger = {
  info: (message, data) => {
    const entry = createLogEntry('info', message, data);
    console.log(JSON.stringify(entry));
    return entry;
  },
  
  warn: (message, data) => {
    const entry = createLogEntry('warn', message, data);
    console.warn(JSON.stringify(entry));
    return entry;
  },
  
  error: (message, error, data) => {
    const entry = createLogEntry('error', message, {
      ...data,
      error: {
        message: error?.message,
        stack: error?.stack,
        code: error?.code
      }
    });
    console.error(JSON.stringify(entry));
    return entry;
  },
  
  metric: (metric_name, value, unit = 'ms', data) => {
    const entry = createLogEntry('metric', `${metric_name}: ${value}${unit}`, {
      ...data,
      metric: {
        name: metric_name,
        value,
        unit,
        timestamp: Date.now()
      }
    });
    console.log(JSON.stringify(entry));
    return entry;
  },
  
  event: (event_type, data) => {
    const entry = createLogEntry('event', `Event: ${event_type}`, {
      ...data,
      event_type,
      event_timestamp: Date.now()
    });
    console.log(JSON.stringify(entry));
    return entry;
  }
};

/**
 * Metrics tracking utility
 */
class MetricsTracker {
  constructor() {
    this.timers = new Map();
    this.counters = new Map();
    this.gauges = new Map();
  }
  
  // Timer methods
  startTimer(name) {
    this.timers.set(name, Date.now());
  }
  
  endTimer(name, data = {}) {
    const startTime = this.timers.get(name);
    if (!startTime) {
      logger.warn(`Timer ${name} was not started`, { timer_name: name });
      return null;
    }
    
    const duration = Date.now() - startTime;
    this.timers.delete(name);
    
    logger.metric(name, duration, 'ms', data);
    return duration;
  }
  
  // Counter methods
  incrementCounter(name, value = 1, data = {}) {
    const current = this.counters.get(name) || 0;
    const newValue = current + value;
    this.counters.set(name, newValue);
    
    logger.metric(`${name}_count`, newValue, 'count', data);
    return newValue;
  }
  
  // Gauge methods
  setGauge(name, value, unit = 'value', data = {}) {
    this.gauges.set(name, value);
    logger.metric(`${name}_gauge`, value, unit, data);
    return value;
  }
  
  // Get all current metrics
  getAllMetrics() {
    return {
      timers: Object.fromEntries(this.timers),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      session_id: SESSION_ID,
      uptime_ms: Date.now() - START_TIME
    };
  }
}

const metrics = new MetricsTracker();

module.exports = {
  logger,
  metrics,
  SESSION_ID,
  START_TIME
};