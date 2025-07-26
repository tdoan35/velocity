# Velocity AI Edge Functions

This directory contains Supabase Edge Functions that power the AI code generation capabilities of Velocity.

## Overview

Three main Edge Functions handle AI processing:

### 1. `/generate-code`
Main code generation endpoint that interfaces with Claude 3.5 Sonnet.

**Features:**
- Streaming responses for real-time code generation
- Context-aware code generation using project structure
- Vector embedding cache for similar requests (70-80% hit rate target)
- Rate limiting based on subscription tiers
- Comprehensive error handling with retry logic

**Request Format:**
```json
{
  "prompt": "Create a login screen with email and password",
  "context": {
    "projectStructure": ["src/screens/", "src/components/"],
    "currentFile": "src/screens/LoginScreen.tsx",
    "userHistory": ["previous prompts..."],
    "preferences": {}
  },
  "options": {
    "temperature": 0.7,
    "maxTokens": 4096,
    "stream": true
  }
}
```

### 2. `/optimize-prompt`
Enhances prompts with React Native/Expo specific context and best practices.

**Features:**
- Template matching for common React Native patterns
- Context injection based on project state
- Learning from previous attempts
- Similarity search for cached optimizations
- Suggestions for prompt improvement

**Request Format:**
```json
{
  "prompt": "create a navigation system",
  "targetComponent": "navigation",
  "projectContext": {
    "techStack": ["react-native", "expo", "react-navigation"],
    "existingPatterns": ["src/navigation/AppNavigator.tsx"],
    "dependencies": ["@react-navigation/native", "@react-navigation/stack"]
  },
  "previousAttempts": []
}
```

### 3. `/conversation`
Manages multi-turn conversations for iterative code refinement.

**Features:**
- Conversation state persistence
- Context window management (20 messages max)
- Action-based responses (continue, refine, explain, debug)
- Message summarization for long conversations
- Streaming responses with conversation tracking

**Request Format:**
```json
{
  "conversationId": "optional-uuid",
  "message": "Can you add error handling to the login function?",
  "context": {
    "currentCode": "// current code here",
    "fileContext": "src/screens/LoginScreen.tsx"
  },
  "action": "refine"
}
```

## Authentication

All endpoints require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <supabase-auth-token>
```

## Rate Limiting

Rate limits are enforced per subscription tier:

| Tier | /generate-code | /optimize-prompt |
|------|----------------|------------------|
| Free | 20/hour | 10/hour |
| Basic | 100/hour | 50/hour |
| Pro | 500/hour | 200/hour |
| Enterprise | 2000/hour | 1000/hour |

## Environment Variables

Required environment variables (set in Supabase dashboard):

- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `SUPABASE_URL` - Auto-injected
- `SUPABASE_ANON_KEY` - Auto-injected
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-injected

## Database Schema

The Edge Functions use several database tables:

- `ai_cache` - Stores prompt/response pairs with vector embeddings
- `prompt_optimizations` - Caches optimized prompts
- `conversations` - Stores conversation metadata
- `conversation_messages` - Individual messages in conversations
- `rate_limit_logs` - Tracks API usage for rate limiting
- `edge_function_logs` - Stores function execution logs

## Local Development

To run Edge Functions locally:

```bash
# Start Supabase local development
supabase start

# Serve functions locally
supabase functions serve

# Test a function
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/generate-code' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"prompt":"Create a button component"}'
```

## Deployment

Deploy functions to production:

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy generate-code
```

## Monitoring

Function logs can be viewed in the Supabase dashboard or via CLI:

```bash
# View logs for a function
supabase functions logs generate-code

# Follow logs in real-time
supabase functions logs generate-code --follow
```

## Error Handling

All functions implement comprehensive error handling:

- Authentication errors (401)
- Rate limit errors (429)
- Bad request errors (400)
- Internal server errors (500)

Errors are logged to `edge_function_logs` table for monitoring.

## Performance Optimization

- Vector similarity search achieves 70-80% cache hit rate
- Streaming responses reduce time-to-first-byte
- Parallel context building and embedding generation
- Incremental context updates to avoid redundant processing

## Security

- Row Level Security (RLS) on all tables
- Service role key only accessible to Edge Functions
- User-scoped data access
- Input validation and sanitization
- Rate limiting prevents abuse