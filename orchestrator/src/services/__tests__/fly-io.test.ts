import axios from 'axios';
import { FlyIOService } from '../fly-io';
import type { FlyMachine, CreateMachineResponse } from '../../types/fly.types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FlyIOService', () => {
  let service: FlyIOService;
  const mockApiToken = 'test-fly-token';
  const mockAppName = 'test-app';
  const mockProjectId = 'test-project-123';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FlyIOService(mockApiToken, mockAppName);
    
    // Setup default axios mock
    mockedAxios.create = jest.fn().mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    } as any);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.machines.dev/v1',
        headers: {
          'Authorization': `Bearer ${mockApiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
    });
  });

  describe('createMachine', () => {
    const mockMachine: FlyMachine = {
      id: 'machine-123',
      name: 'preview-test-project-123-1234567890',
      state: 'started',
      region: 'dfw',
      instance_id: 'instance-123',
      private_ip: '172.16.0.1',
      config: {
        image: 'ghcr.io/velocity/preview-container:latest',
        env: {
          PROJECT_ID: mockProjectId,
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_ANON_KEY: 'test-key',
          NODE_ENV: 'production',
        },
      },
      image_ref: {
        registry: 'ghcr.io',
        repository: 'velocity/preview-container',
        tag: 'latest',
        digest: 'sha256:abc123',
      },
      created_at: '2023-08-30T10:00:00Z',
      updated_at: '2023-08-30T10:05:00Z',
      checks: [
        {
          name: 'http',
          status: 'passing',
          output: 'OK',
          updated_at: '2023-08-30T10:05:00Z',
        }
      ]
    };

    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-key';
      
      // Mock the axios instance methods
      const mockClient = {
        post: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
      };
      mockedAxios.create = jest.fn().mockReturnValue(mockClient);
      
      // Recreate service to use new mocked axios
      service = new FlyIOService(mockApiToken, mockAppName);
    });

    it('should successfully create a machine', async () => {
      const mockClient = (service as any).client;
      mockClient.post.mockResolvedValueOnce({ data: mockMachine });
      mockClient.get.mockResolvedValueOnce({ data: mockMachine });

      const result: CreateMachineResponse = await service.createMachine(mockProjectId);

      expect(result).toEqual({
        machine: mockMachine,
        url: `https://${mockMachine.name}.fly.dev`,
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        `/apps/${mockAppName}/machines`,
        expect.objectContaining({
          name: expect.stringMatching(/^preview-test-project-123-\d+$/),
          config: expect.objectContaining({
            image: 'ghcr.io/velocity/preview-container:latest',
            env: {
              PROJECT_ID: mockProjectId,
              SUPABASE_URL: 'https://test.supabase.co',
              SUPABASE_ANON_KEY: 'test-key',
              NODE_ENV: 'production',
            },
          }),
          region: 'dfw',
        })
      );
    });

    it('should handle machine creation failure', async () => {
      const mockClient = (service as any).client;
      mockClient.post.mockRejectedValueOnce(new Error('Fly.io API error'));

      await expect(service.createMachine(mockProjectId)).rejects.toThrow(
        'Failed to create preview container'
      );
    });

    it('should wait for machine to be ready', async () => {
      const startingMachine = { ...mockMachine, state: 'starting' };
      const readyMachine = { ...mockMachine, state: 'started' };

      const mockClient = (service as any).client;
      mockClient.post.mockResolvedValueOnce({ data: startingMachine });
      mockClient.get
        .mockResolvedValueOnce({ data: startingMachine })
        .mockResolvedValueOnce({ data: readyMachine });

      const result = await service.createMachine(mockProjectId);

      expect(result.machine).toEqual(readyMachine);
      expect(mockClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('destroyMachine', () => {
    const machineId = 'machine-123';

    it('should successfully destroy a machine', async () => {
      const mockClient = (service as any).client;
      mockClient.post.mockResolvedValueOnce({ data: {} }); // stop
      mockClient.delete.mockResolvedValueOnce({ data: {} }); // destroy

      await service.destroyMachine(machineId);

      expect(mockClient.post).toHaveBeenCalledWith(
        `/apps/${mockAppName}/machines/${machineId}/stop`
      );
      expect(mockClient.delete).toHaveBeenCalledWith(
        `/apps/${mockAppName}/machines/${machineId}?force=true`
      );
    });

    it('should handle destroy failure gracefully', async () => {
      const mockClient = (service as any).client;
      mockClient.post.mockRejectedValueOnce(new Error('Stop failed'));
      mockClient.delete.mockRejectedValueOnce(new Error('Delete failed'));

      // Should not throw - method handles errors gracefully
      await expect(service.destroyMachine(machineId)).resolves.toBeUndefined();
    });
  });

  describe('getMachine', () => {
    const machineId = 'machine-123';
    const mockMachine: FlyMachine = {
      id: machineId,
      name: 'test-machine',
      state: 'started',
      region: 'dfw',
      instance_id: 'instance-123',
      private_ip: '172.16.0.1',
      config: { image: 'test:latest' },
      image_ref: {
        registry: 'test',
        repository: 'test',
        tag: 'latest',
        digest: 'sha256:abc123',
      },
      created_at: '2023-08-30T10:00:00Z',
      updated_at: '2023-08-30T10:05:00Z',
    };

    it('should return machine details', async () => {
      const mockClient = (service as any).client;
      mockClient.get.mockResolvedValueOnce({ data: mockMachine });

      const result = await service.getMachine(machineId);

      expect(result).toEqual(mockMachine);
      expect(mockClient.get).toHaveBeenCalledWith(
        `/apps/${mockAppName}/machines/${machineId}`
      );
    });

    it('should return null for 404 errors', async () => {
      const mockClient = (service as any).client;
      const error = { response: { status: 404 } };
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);
      mockClient.get.mockRejectedValueOnce(error);

      const result = await service.getMachine(machineId);

      expect(result).toBeNull();
    });

    it('should throw for non-404 errors', async () => {
      const mockClient = (service as any).client;
      mockClient.get.mockRejectedValueOnce(new Error('API error'));

      await expect(service.getMachine(machineId)).rejects.toThrow('API error');
    });
  });

  describe('listMachines', () => {
    it('should return list of machines', async () => {
      const machines = [
        { id: 'machine-1', name: 'test-1', state: 'started' },
        { id: 'machine-2', name: 'test-2', state: 'stopped' },
      ];

      const mockClient = (service as any).client;
      mockClient.get.mockResolvedValueOnce({ data: machines });

      const result = await service.listMachines();

      expect(result).toEqual(machines);
      expect(mockClient.get).toHaveBeenCalledWith(`/apps/${mockAppName}/machines`);
    });

    it('should return empty array on error', async () => {
      const mockClient = (service as any).client;
      mockClient.get.mockRejectedValueOnce(new Error('API error'));

      const result = await service.listMachines();

      expect(result).toEqual([]);
    });
  });

  describe('cleanupOrphanedMachines', () => {
    const oldMachine = {
      id: 'machine-old',
      name: 'preview-old',
      state: 'started',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      metadata: { 'velocity-service': 'preview-container' },
    };

    const recentMachine = {
      id: 'machine-recent',
      name: 'preview-recent',
      state: 'started',
      created_at: new Date().toISOString(),
      metadata: { 'velocity-service': 'preview-container' },
    };

    it('should cleanup old machines', async () => {
      const mockClient = (service as any).client;
      mockClient.get.mockResolvedValueOnce({ data: [oldMachine, recentMachine] });
      mockClient.post.mockResolvedValue({ data: {} });
      mockClient.delete.mockResolvedValue({ data: {} });

      const cleanedCount = await service.cleanupOrphanedMachines(60);

      expect(cleanedCount).toBe(1);
      expect(mockClient.post).toHaveBeenCalledWith(
        `/apps/${mockAppName}/machines/${oldMachine.id}/stop`
      );
      expect(mockClient.delete).toHaveBeenCalledWith(
        `/apps/${mockAppName}/machines/${oldMachine.id}?force=true`
      );
    });

    it('should not cleanup recent machines', async () => {
      const mockClient = (service as any).client;
      mockClient.get.mockResolvedValueOnce({ data: [recentMachine] });

      const cleanedCount = await service.cleanupOrphanedMachines(60);

      expect(cleanedCount).toBe(0);
      expect(mockClient.post).not.toHaveBeenCalled();
      expect(mockClient.delete).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockClient = (service as any).client;
      mockClient.get.mockRejectedValueOnce(new Error('API error'));

      const cleanedCount = await service.cleanupOrphanedMachines(60);

      expect(cleanedCount).toBe(0);
    });
  });
});