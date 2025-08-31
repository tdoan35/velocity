# Orchestrator Monitoring & Cleanup System

This document outlines the comprehensive monitoring and automated cleanup system implemented for the Velocity Orchestrator Service.

## Overview

The monitoring system provides real-time visibility into container health, resource usage, and system performance. It includes automated cleanup, alerting, and comprehensive metrics collection.

## Core Components

### 1. SchedulerService (`src/services/scheduler.ts`)

Manages automated background jobs using cron scheduling:

- **Container Cleanup**: Every 15 minutes (`*/15 * * * *`)
- **System Monitoring**: Every 5 minutes (`*/5 * * * *`)  
- **Orphaned Machine Cleanup**: Every hour (`0 * * * *`)
- **Session Timeout Enforcement**: Every 10 minutes (`*/10 * * * *`)
- **Metrics Collection**: Every minute (`* * * * *`)

### 2. MonitoringService (`src/services/monitoring.ts`)

Handles metrics, events, alerts, and system health tracking:

- **Metrics Recording**: Numerical data with timestamps and tags
- **Event Logging**: System events with severity levels (info, warning, error, critical)
- **Alert Management**: Automated alerts with webhook notifications
- **Health Summary**: Real-time system status overview
- **Prometheus Export**: Industry-standard metrics format

### 3. Database Schema

New monitoring tables (see `supabase/migrations/20250831000002_monitoring_tables.sql`):

- `system_events`: System event logging
- `system_alerts`: Alert management
- `system_metrics`: Historical metrics storage
- `container_metrics`: Container resource usage
- Enhanced `preview_sessions`: Health status and monitoring data

## API Endpoints

### Health & Status
- `GET /api/monitoring/health` - System health summary
- `GET /api/monitoring/dashboard` - Comprehensive dashboard data

### Metrics & Events  
- `GET /api/monitoring/metrics` - System metrics (optional: `?name=metric_name&limit=N`)
- `GET /api/monitoring/events` - System events (optional: `?type=event_type&limit=N`)

### Alerts
- `GET /api/monitoring/alerts` - Active alerts (optional: `?all=true` for all alerts)
- `POST /api/monitoring/alerts/:alertId/resolve` - Resolve an alert

### Session Monitoring
- `GET /api/monitoring/sessions` - All session monitoring data
- `GET /api/monitoring/sessions/:sessionId/metrics` - Specific session metrics

### Job Management
- `GET /api/monitoring/jobs` - Scheduled job status
- `POST /api/monitoring/cleanup` - Run cleanup immediately
- `POST /api/monitoring/monitor` - Run monitoring immediately  
- `POST /api/monitoring/jobs/:jobName/run` - Run specific job

### Prometheus Integration
- `GET /api/metrics` - Prometheus-formatted metrics (no auth required)

## Automated Cleanup Features

### 1. Expired Session Cleanup
- Removes sessions past their tier-based expiration time
- Destroys associated Fly.io machines
- Updates database records to 'ended' status

### 2. Orphaned Machine Cleanup  
- Identifies machines older than 30 minutes not in database
- Automatically destroys orphaned resources
- Prevents resource leakage and cost accumulation

### 3. Session Timeout Enforcement
- Monitors sessions against tier-based duration limits
- Automatically terminates sessions exceeding limits
- Records enforcement events for audit tracking

## Monitoring Metrics

### System Health Metrics
- `active_sessions`: Current active preview sessions
- `healthy_sessions`: Sessions in healthy state
- `warning_sessions`: Sessions with warnings
- `critical_sessions`: Sessions in critical state
- `total_alerts`: Unresolved system alerts
- `critical_alerts`: Unresolved critical alerts

### Resource Metrics  
- `sessions_<tier>_tier`: Session count by tier (free, basic, pro)
- `orphaned_machines_cleaned`: Cleanup operations performed
- `cpu_usage_percent`: System CPU utilization
- `memory_usage_percent`: System memory utilization

## Alert Thresholds

### Automatic Alert Conditions
- `critical_sessions >= 5`: Error-level alert
- `active_sessions >= 50`: Warning-level alert  
- `memory_usage_percent >= 90`: Critical-level alert
- `cpu_usage_percent >= 85`: Warning-level alert

### Alert Severity Levels
- **Warning**: Non-critical issues requiring attention
- **Error**: Significant issues affecting system functionality
- **Critical**: Severe issues requiring immediate intervention

## Configuration

### Environment Variables
- `MONITORING_WEBHOOK_URL`: Webhook URL for critical alert notifications
- `SUPABASE_URL`: Database connection for monitoring data
- `SUPABASE_SERVICE_ROLE_KEY`: Database service account key

### Webhook Notifications
Critical alerts automatically trigger webhook notifications containing:
- Alert ID, type, and message  
- Severity level and timestamp
- Associated data and context
- Service identification

## Usage Examples

### Manual Cleanup
```bash
curl -X POST http://localhost:8080/api/monitoring/cleanup \
  -H "Authorization: Bearer <token>"
```

### Get System Health
```bash
curl http://localhost:8080/api/monitoring/health \
  -H "Authorization: Bearer <token>"
```

### Resolve Alert
```bash
curl -X POST http://localhost:8080/api/monitoring/alerts/alert-123/resolve \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resolution": "Issue resolved by restarting service"}'
```

### Prometheus Metrics
```bash
curl http://localhost:8080/api/metrics
```

## Testing

The system includes comprehensive tests:
- `src/__tests__/scheduler.test.ts` - Scheduler functionality
- `src/__tests__/monitoring.test.ts` - Monitoring service
- `src/__tests__/monitoring-api.integration.test.ts` - API endpoints

Run tests with:
```bash
npm test
```

## Dashboard Integration

The monitoring system provides a comprehensive dashboard endpoint (`/api/monitoring/dashboard`) that returns:

- System health status and uptime
- Active session monitoring with tier distribution  
- Recent alerts and system events
- Scheduled job status
- Key metrics trends
- Real-time timestamp

This data can be consumed by frontend dashboards, monitoring tools, or administrative interfaces.

## Operational Notes

### Performance Considerations
- Metrics are kept in memory (last 1000 entries)
- Events are kept in memory (last 500 entries)  
- Critical events/alerts are persisted to database
- Automatic cleanup of old in-memory data

### Resource Management
- Background jobs run with error handling and logging
- Failed operations are logged but don't stop the service
- Graceful shutdown stops all scheduled jobs
- Memory usage is bounded by retention limits

### Scalability
- Metrics collection is lightweight and non-blocking
- Database operations use connection pooling
- Webhook notifications are fire-and-forget
- Jobs can be run manually for troubleshooting

## Troubleshooting

### Common Issues

1. **Jobs Not Running**: Check job status via `/api/monitoring/jobs`
2. **High Memory Usage**: Old data cleanup may be needed
3. **Missing Metrics**: Verify metrics collection job is running
4. **Webhook Failures**: Check `MONITORING_WEBHOOK_URL` configuration

### Debug Commands

```bash
# Check job status
curl http://localhost:8080/api/monitoring/jobs

# Run monitoring immediately  
curl -X POST http://localhost:8080/api/monitoring/monitor

# View recent events
curl http://localhost:8080/api/monitoring/events?limit=50

# Check active alerts
curl http://localhost:8080/api/monitoring/alerts
```

This monitoring system provides comprehensive visibility and automated management of the Velocity preview orchestration service, ensuring reliable operation and proactive issue resolution.