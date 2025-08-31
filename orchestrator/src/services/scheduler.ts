import cron from 'node-cron';
import { ContainerManager } from './container-manager';
import { MonitoringService } from './monitoring';

export class SchedulerService {
  private containerManager: ContainerManager;
  private monitoringService: MonitoringService;
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.containerManager = new ContainerManager();
    this.monitoringService = new MonitoringService();
  }

  /**
   * Start all scheduled jobs
   */
  startJobs(): void {
    console.log('🕒 Starting scheduled cleanup and monitoring jobs...');

    // Cleanup expired sessions every 15 minutes
    const cleanupJob = cron.schedule('*/15 * * * *', async () => {
      console.log('⏰ Running scheduled container cleanup...');
      try {
        await this.containerManager.cleanupExpiredSessions();
        console.log('✅ Container cleanup completed successfully');
      } catch (error) {
        console.error('❌ Container cleanup failed:', error);
        this.monitoringService.recordEvent('cleanup_failure', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // System monitoring every 5 minutes
    const monitoringJob = cron.schedule('*/5 * * * *', async () => {
      console.log('⏰ Running scheduled system monitoring...');
      try {
        await this.containerManager.runMonitoringJob();
        console.log('✅ System monitoring completed successfully');
      } catch (error) {
        console.error('❌ System monitoring failed:', error);
        this.monitoringService.recordEvent('monitoring_failure', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Aggressive orphaned machine cleanup every hour
    const orphanCleanupJob = cron.schedule('0 * * * *', async () => {
      console.log('⏰ Running hourly orphaned machine cleanup...');
      try {
        const orphanedCount = await this.containerManager.listActiveMachines();
        const machinesList = Array.isArray(orphanedCount) ? orphanedCount : [];
        
        let cleanedCount = 0;
        for (const machine of machinesList) {
          // Check if machine is older than 30 minutes and not in database
          const machineAge = Date.now() - new Date(machine.created_at || 0).getTime();
          if (machineAge > 30 * 60 * 1000) { // 30 minutes
            try {
              // Check if machine exists in our database
              const sessionExists = await this.containerManager.getSessionStatus(machine.id);
              if (!sessionExists) {
                // This is an orphaned machine - destroy it
                await this.containerManager.destroySession(machine.id);
                cleanedCount++;
                console.log(`🗑️ Cleaned up orphaned machine: ${machine.id}`);
              }
            } catch (error) {
              console.error(`Failed to check/cleanup machine ${machine.id}:`, error);
            }
          }
        }
        
        this.monitoringService.recordMetric('orphaned_machines_cleaned', cleanedCount);
        console.log(`✅ Orphaned machine cleanup completed, cleaned ${cleanedCount} machines`);
      } catch (error) {
        console.error('❌ Orphaned machine cleanup failed:', error);
        this.monitoringService.recordEvent('orphan_cleanup_failure', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Session timeout enforcement every 10 minutes
    const timeoutJob = cron.schedule('*/10 * * * *', async () => {
      console.log('⏰ Running session timeout enforcement...');
      try {
        await this.enforceSessionTimeouts();
        console.log('✅ Session timeout enforcement completed');
      } catch (error) {
        console.error('❌ Session timeout enforcement failed:', error);
        this.monitoringService.recordEvent('timeout_enforcement_failure', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Health metrics collection every minute
    const metricsJob = cron.schedule('* * * * *', async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        console.error('❌ Metrics collection failed:', error);
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Store job references
    this.jobs.set('cleanup', cleanupJob);
    this.jobs.set('monitoring', monitoringJob);
    this.jobs.set('orphan-cleanup', orphanCleanupJob);
    this.jobs.set('timeout-enforcement', timeoutJob);
    this.jobs.set('metrics-collection', metricsJob);

    // Start all jobs
    cleanupJob.start();
    monitoringJob.start();
    orphanCleanupJob.start();
    timeoutJob.start();
    metricsJob.start();

    console.log('✅ All scheduled jobs started successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  stopJobs(): void {
    console.log('🛑 Stopping all scheduled jobs...');
    
    for (const [name, job] of this.jobs) {
      try {
        job.stop();
        console.log(`✅ Stopped job: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to stop job ${name}:`, error);
      }
    }
    
    this.jobs.clear();
    console.log('✅ All jobs stopped');
  }

  /**
   * Get status of all scheduled jobs
   */
  getJobStatus(): { name: string; running: boolean }[] {
    return Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      running: true, // If job is in the map, it's running
    }));
  }

  /**
   * Enforce session timeouts based on tier limits
   */
  private async enforceSessionTimeouts(): Promise<void> {
    try {
      const results = await this.containerManager.monitorAllSessions();
      
      for (const result of results) {
        if (result.status === 'critical' && 
            result.actions.includes('Auto-destroy machine')) {
          
          console.log(`⏱️ Enforcing timeout for session: ${result.sessionId}`);
          
          try {
            await this.containerManager.destroySession(result.sessionId);
            this.monitoringService.recordEvent('session_timeout_enforced', {
              sessionId: result.sessionId,
              containerId: result.containerId,
              tier: result.tier,
              timestamp: new Date(),
            });
          } catch (error) {
            console.error(`Failed to enforce timeout for session ${result.sessionId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Session timeout enforcement failed:', error);
      throw error;
    }
  }

  /**
   * Collect system-wide metrics for monitoring
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // Get active session count
      const monitoringResults = await this.containerManager.monitorAllSessions();
      
      const metrics = {
        active_sessions: monitoringResults.length,
        healthy_sessions: monitoringResults.filter(r => r.status === 'ok').length,
        warning_sessions: monitoringResults.filter(r => r.status === 'warning').length,
        critical_sessions: monitoringResults.filter(r => r.status === 'critical').length,
        timestamp: new Date(),
      };

      // Record metrics
      for (const [key, value] of Object.entries(metrics)) {
        if (typeof value === 'number') {
          this.monitoringService.recordMetric(key, value);
        }
      }

      // Record tier distribution
      const tierCounts = monitoringResults.reduce((acc, result) => {
        acc[result.tier] = (acc[result.tier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [tier, count] of Object.entries(tierCounts)) {
        this.monitoringService.recordMetric(`sessions_${tier}_tier`, count);
      }

    } catch (error) {
      console.error('Failed to collect system metrics:', error);
    }
  }

  /**
   * Run a specific job immediately (for testing/debugging)
   */
  async runJobNow(jobName: string): Promise<void> {
    console.log(`🚀 Running job immediately: ${jobName}`);
    
    switch (jobName) {
      case 'cleanup':
        await this.containerManager.cleanupExpiredSessions();
        break;
      case 'monitoring':
        await this.containerManager.runMonitoringJob();
        break;
      case 'timeout-enforcement':
        await this.enforceSessionTimeouts();
        break;
      case 'metrics-collection':
        await this.collectSystemMetrics();
        break;
      case 'orphan-cleanup':
        // Custom orphan cleanup logic
        const machines = await this.containerManager.listActiveMachines();
        console.log(`Found ${Array.isArray(machines) ? machines.length : 0} machines to check`);
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
    
    console.log(`✅ Job completed: ${jobName}`);
  }
}