/**
 * Test suite for Supabase Realtime Channel Configuration
 * 
 * Tests the proper setup and functionality of real-time channels
 * for the preview container system.
 */

import { createClient } from '@supabase/supabase-js';
import RealtimeChannelManager from '../services/realtime-channel-manager.js';

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'test-anon-key',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key',
  testProjectId: '00000000-0000-0000-0000-000000000001',
  testContainerId: 'test-container-123',
  testUserId: '00000000-0000-0000-0000-000000000002',
};

describe('Realtime Channel Configuration', () => {
  let supabase: any;
  let channelManager: RealtimeChannelManager;

  beforeAll(async () => {
    // Initialize Supabase client
    supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseServiceKey);
    
    // Initialize channel manager
    channelManager = new RealtimeChannelManager(
      TEST_CONFIG.supabaseUrl,
      TEST_CONFIG.supabaseServiceKey
    );
  });

  afterAll(async () => {
    // Cleanup
    await channelManager.cleanup();
  });

  describe('Channel Configuration', () => {
    test('should have preview-specific channels configured', async () => {
      const { data: channels, error } = await supabase
        .from('realtime_channels')
        .select('*')
        .in('channel_name', [
          'realtime:project:files',
          'realtime:preview:session',
          'realtime:container:health'
        ]);

      expect(error).toBeNull();
      expect(channels).toHaveLength(3);
      
      // Verify channel configurations
      const fileChannel = channels.find((c: any) => c.channel_name === 'realtime:project:files');
      expect(fileChannel).toBeDefined();
      expect(fileChannel.channel_type).toBe('file_changes');
      expect(fileChannel.access_policy.allow_containers).toBe(true);
    });

    test('should allow project access validation', async () => {
      const { data: accessResult, error } = await supabase.rpc('check_preview_channel_access', {
        channel_pattern: 'realtime:project:files',
        project_uuid: TEST_CONFIG.testProjectId,
        user_uuid: TEST_CONFIG.testUserId,
        container_token: null
      });

      expect(error).toBeNull();
      expect(typeof accessResult).toBe('boolean');
    });

    test('should allow container access validation', async () => {
      const { data: accessResult, error } = await supabase.rpc('check_preview_channel_access', {
        channel_pattern: 'realtime:project:files',
        project_uuid: TEST_CONFIG.testProjectId,
        user_uuid: null,
        container_token: 'valid-container-token-123'
      });

      expect(error).toBeNull();
      expect(typeof accessResult).toBe('boolean');
    });
  });

  describe('Container Registration', () => {
    test('should register a container successfully', async () => {
      // First, create a mock preview session
      const { error: sessionError } = await supabase
        .from('preview_sessions')
        .insert({
          id: 'test-session-123',
          user_id: TEST_CONFIG.testUserId,
          project_id: TEST_CONFIG.testProjectId,
          container_id: TEST_CONFIG.testContainerId,
          status: 'active'
        });

      expect(sessionError).toBeNull();

      // Register container
      const registrationInfo = await channelManager.registerContainer(
        TEST_CONFIG.testProjectId,
        TEST_CONFIG.testContainerId,
        'http://test-container.fly.dev'
      );

      expect(registrationInfo).toBeDefined();
      expect(registrationInfo.channel_name).toBe(`realtime:project:${TEST_CONFIG.testProjectId}`);
      expect(registrationInfo.container_id).toBe(TEST_CONFIG.testContainerId);

      // Verify subscription was created
      const { data: subscriptions } = await supabase
        .from('realtime_subscriptions')
        .select('*')
        .eq('subscription_id', `container:${TEST_CONFIG.testContainerId}`);

      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].channel_name).toBe(registrationInfo.channel_name);
    });

    test('should unregister a container successfully', async () => {
      const success = await channelManager.unregisterContainer(
        TEST_CONFIG.testProjectId,
        TEST_CONFIG.testContainerId
      );

      expect(success).toBe(true);

      // Verify subscription was deactivated
      const { data: subscriptions } = await supabase
        .from('realtime_subscriptions')
        .select('*')
        .eq('subscription_id', `container:${TEST_CONFIG.testContainerId}`)
        .eq('is_active', true);

      expect(subscriptions).toHaveLength(0);
    });

    // Cleanup test data
    afterEach(async () => {
      await supabase
        .from('preview_sessions')
        .delete()
        .eq('id', 'test-session-123');
        
      await supabase
        .from('realtime_subscriptions')
        .delete()
        .eq('subscription_id', `container:${TEST_CONFIG.testContainerId}`);
    });
  });

  describe('Message Broadcasting', () => {
    test('should broadcast file update successfully', async () => {
      const { data: broadcastId, error } = await supabase.rpc('broadcast_file_update', {
        project_uuid: TEST_CONFIG.testProjectId,
        file_path: 'src/App.jsx',
        file_content: 'console.log("Hello World");',
        sender_type: 'user'
      });

      expect(error).toBeNull();
      expect(broadcastId).toBeDefined();

      // Verify broadcast was recorded
      const { data: broadcasts } = await supabase
        .from('realtime_broadcasts')
        .select('*')
        .eq('id', broadcastId);

      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0].event_type).toBe('file:update');
      expect(broadcasts[0].payload.file_path).toBe('src/App.jsx');
    });

    test('should enforce rate limiting', async () => {
      // Try to send two rapid broadcasts
      await supabase.rpc('broadcast_file_update', {
        project_uuid: TEST_CONFIG.testProjectId,
        file_path: 'src/Test.jsx',
        file_content: 'console.log("First");',
        sender_type: 'user'
      });

      // Second broadcast should fail due to rate limiting
      const { error } = await supabase.rpc('broadcast_file_update', {
        project_uuid: TEST_CONFIG.testProjectId,
        file_path: 'src/Test.jsx',
        file_content: 'console.log("Second");',
        sender_type: 'user'
      });

      expect(error).toBeDefined();
      expect(error.message).toContain('Rate limit exceeded');
    });
  });

  describe('Channel Status', () => {
    test('should provide channel status information', () => {
      const status = channelManager.getChannelStatus();
      
      expect(status).toBeDefined();
      expect(status.activeChannels).toBeGreaterThanOrEqual(0);
      expect(status.containerChannels).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(status.channels)).toBe(true);
    });
  });
});

// Integration test for end-to-end flow
describe('End-to-End Channel Flow', () => {
  let supabase: any;
  let channelManager: RealtimeChannelManager;
  let testChannel: any;

  beforeAll(async () => {
    supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseAnonKey);
    channelManager = new RealtimeChannelManager(
      TEST_CONFIG.supabaseUrl,
      TEST_CONFIG.supabaseServiceKey
    );
  });

  afterAll(async () => {
    if (testChannel) {
      await testChannel.unsubscribe();
    }
    await channelManager.cleanup();
  });

  test('should connect to project channel and receive messages', (done) => {
    const channelName = `realtime:project:${TEST_CONFIG.testProjectId}`;
    const testMessage = { filePath: 'src/test.js', content: 'test content' };
    
    // Set up message handler
    const messageHandler = (event: string, payload: any) => {
      expect(event).toBe('file:update');
      expect(payload.payload).toBeDefined();
      done();
    };

    // Connect to channel
    channelManager.connectToProjectChannel(
      TEST_CONFIG.testProjectId,
      TEST_CONFIG.testContainerId,
      messageHandler
    ).then(() => {
      // Wait a bit for connection to establish
      setTimeout(async () => {
        // Broadcast a test message
        await channelManager.broadcastMessage(channelName, 'file:update', testMessage);
      }, 1000);
    }).catch(done);
  });
});