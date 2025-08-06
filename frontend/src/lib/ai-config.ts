import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

// AI Provider Configuration
export const aiProviders = {
  anthropic: createAnthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || '',
  }),
  openai: createOpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  }),
};

// Model configurations for different agents
export const aiModels = {
  project: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
  },
  ui: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
  },
  code: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
  },
  config: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
  },
};

// Get model instance for a specific agent
export function getModelForAgent(agent: keyof typeof aiModels) {
  const config = aiModels[agent];
  const provider = aiProviders[config.provider as keyof typeof aiProviders];
  
  return provider(config.model);
}

// Chat configuration
export const chatConfig = {
  maxTokens: 4096,
  temperature: 0.7,
  topP: 0.9,
  streamingEnabled: true,
  maxRetries: 3,
  retryDelay: 1000,
};

// Message persistence configuration
export const messagePersistenceConfig = {
  saveInterval: 2000, // Save messages every 2 seconds
  maxMessagesInMemory: 100,
  enableLocalStorage: false, // Use Supabase instead
};