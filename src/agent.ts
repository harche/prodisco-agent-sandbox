/**
 * ProDisco Agent Sandbox
 * 
 * AI agent using Claude Code Agent SDK with @prodisco/k8s-mcp for Kubernetes operations.
 * Supports both Anthropic API and Google Vertex AI authentication.
 * 
 * Modes:
 * - single-task: Execute one task and exit (ephemeral)
 * - daemon: Long-running HTTP server that accepts tasks via API (official agent-sandbox pattern)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import Fastify, { FastifyRequest } from 'fastify';

// Configuration from environment variables
const CONFIG = {
  // Agent configuration
  mode: process.env.AGENT_MODE || 'single-task', // 'single-task' or 'daemon'
  task: process.env.AGENT_TASK || 'List all pods in the default namespace and provide a summary',
  maxTurns: parseInt(process.env.MAX_ITERATIONS || '10', 10),
  
  // HTTP server configuration (daemon mode)
  serverPort: parseInt(process.env.SERVER_PORT || '8888', 10),
  serverHost: process.env.SERVER_HOST || '0.0.0.0',
  
  // Kubernetes configuration
  namespace: process.env.K8S_NAMESPACE || 'default',
  
  // Claude configuration
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250514',
  
  // Google Vertex AI configuration
  useVertex: process.env.CLAUDE_CODE_USE_VERTEX === '1',
  vertexRegion: process.env.CLOUD_ML_REGION || 'us-east5',
  vertexProject: process.env.ANTHROPIC_VERTEX_PROJECT_ID || '',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Log levels
const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function log(level: string, message: string, data?: any) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[CONFIG.logLevel]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (data) {
      console.log(prefix, message, JSON.stringify(data, null, 2));
    } else {
      console.log(prefix, message);
    }
  }
}

// Build the system prompt with Kubernetes context
function buildSystemPrompt(): string {
  return `
You are a Kubernetes operations agent with access to the @prodisco/k8s-mcp MCP server.

IMPORTANT WORKFLOW:
1. Use the kubernetes.searchTools MCP tool to find the right Kubernetes API methods
2. The tool will tell you where to write scripts and how to execute them
3. Write TypeScript scripts using @kubernetes/client-node library
4. Execute scripts using: npx tsx <script-path>

Current Kubernetes namespace context: ${CONFIG.namespace}

Always execute the scripts you write to get real results. Don't just show the code - run it!
`;
}

// Execute a task using Claude Code Agent SDK
async function executeTask(task: string, maxTurns?: number): Promise<{
  success: boolean;
  result?: string;
  error?: string;
  stats?: { turns: number; cost: number };
}> {
  log('info', `Executing task: ${task}`);
  console.log('');
  console.log('═'.repeat(50));
  console.log('📋 Task:', task);
  console.log('═'.repeat(50));
  console.log('');

  try {
    const result = query({
      prompt: task,
      options: {
        model: CONFIG.model,
        maxTurns: maxTurns || CONFIG.maxTurns,
        cwd: process.cwd(),
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: buildSystemPrompt(),
        },
        mcpServers: {
          'prodisco-k8s': {
            type: 'stdio',
            command: 'prodisco-k8s',
            args: [],
          },
        },
        permissionMode: 'bypassPermissions',
        includePartialMessages: true,
        stderr: (data: string) => {
          process.stderr.write(data);
        },
      },
    });

    let currentStreamText = '';
    let finalResult: string | undefined;
    let finalStats: { turns: number; cost: number } | undefined;

    for await (const message of result) {
      switch (message.type) {
        case 'system':
          if (message.subtype === 'init') {
            log('info', 'Claude Code initialized');
            log('info', `Model: ${message.model}`);
            log('info', `Tools: ${message.tools.join(', ')}`);
            if (message.mcp_servers?.length > 0) {
              log('info', `MCP Servers: ${message.mcp_servers.map(s => `${s.name}(${s.status})`).join(', ')}`);
            }
          }
          break;

        case 'stream_event':
          const event = message.event;
          if (event.type === 'content_block_delta') {
            const delta = event.delta as any;
            if (delta.type === 'text_delta' && delta.text) {
              process.stdout.write(delta.text);
              currentStreamText += delta.text;
            }
          } else if (event.type === 'content_block_start') {
            const block = event.content_block as any;
            if (block.type === 'text') {
              console.log('\n💬 Claude:');
              console.log('─'.repeat(40));
              currentStreamText = '';
            } else if (block.type === 'tool_use') {
              if (currentStreamText) {
                console.log('\n' + '─'.repeat(40));
              }
              console.log(`\n🔧 Tool: ${block.name}`);
              currentStreamText = '';
            }
          } else if (event.type === 'content_block_stop') {
            if (currentStreamText) {
              console.log('\n' + '─'.repeat(40));
              currentStreamText = '';
            }
          }
          break;

        case 'tool_progress':
          process.stdout.write(`\r⏳ ${message.tool_name} running... (${message.elapsed_time_seconds.toFixed(1)}s)`);
          break;

        case 'assistant':
          if (message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'tool_use') {
                console.log('\n📥 Input:', JSON.stringify(block.input, null, 2));
              } else if (block.type === 'tool_result') {
                const toolResult = block as any;
                console.log(`\n${toolResult.is_error ? '❌' : '✅'} Result:`);
                console.log('─'.repeat(40));
                const content = typeof toolResult.content === 'string' 
                  ? toolResult.content 
                  : JSON.stringify(toolResult.content, null, 2);
                const displayContent = content.length > 1500 
                  ? content.substring(0, 1500) + '\n...(truncated)'
                  : content;
                console.log(displayContent);
                console.log('─'.repeat(40));
              }
            }
          }
          break;

        case 'result':
          console.log('\n');
          console.log('═'.repeat(50));
          if (message.subtype === 'success') {
            console.log('✅ Task Completed Successfully');
            console.log('─'.repeat(50));
            finalResult = message.result;
            finalStats = { turns: message.num_turns, cost: message.total_cost_usd };
            if (message.result) {
              const displayResult = message.result.length > 2000 
                ? message.result.substring(0, 2000) + '...(truncated)'
                : message.result;
              console.log(displayResult);
            }
            console.log('─'.repeat(50));
            console.log(`📊 Stats: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)} USD`);
          } else {
            console.log('❌ Task Failed');
            console.log('─'.repeat(50));
            console.log(`Error type: ${message.subtype}`);
            if ('errors' in message && message.errors) {
              (message.errors as string[]).forEach((err: string) => console.log(`  - ${err}`));
            }
            return {
              success: false,
              error: `Task failed: ${message.subtype}`,
            };
          }
          console.log('═'.repeat(50));
          break;
      }
    }

    return {
      success: true,
      result: finalResult,
      stats: finalStats,
    };

  } catch (error: any) {
    log('error', 'Error during task execution', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

// Daemon mode: Start HTTP server following official agent-sandbox pattern
async function startDaemonServer() {
  const fastify = Fastify({ logger: true });

  // Health check endpoint
  fastify.get('/', async () => {
    return { 
      status: 'ok', 
      message: 'ProDisco Agent Sandbox is active.',
      mode: 'daemon',
      namespace: CONFIG.namespace,
    };
  });

  // Health check endpoint (standard path)
  fastify.get('/healthz', async () => {
    return { status: 'ok' };
  });

  // Execute task endpoint (official agent-sandbox pattern)
  // See: https://github.com/kubernetes-sigs/agent-sandbox/blob/main/examples/python-runtime-sandbox/main.py
  // Request: { "command": string }
  // Response: { "stdout": string, "stderr": string, "exit_code": int }
  interface ExecuteBody {
    command: string;
  }
  
  fastify.post<{ Body: ExecuteBody }>('/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', description: 'The task/command for the agent to execute' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: ExecuteBody }>) => {
    const { command } = request.body;
    
    log('info', `Received task via /execute: ${command.substring(0, 100)}...`);
    
    const result = await executeTask(command);
    
    // Return in official agent-sandbox format
    return {
      stdout: result.result || '',
      stderr: result.error || '',
      exit_code: result.success ? 0 : 1,
    };
  });

  // Status endpoint
  fastify.get('/status', async () => {
    return {
      status: 'running',
      mode: CONFIG.mode,
      model: CONFIG.model,
      namespace: CONFIG.namespace,
      maxTurns: CONFIG.maxTurns,
      useVertex: CONFIG.useVertex,
    };
  });

  try {
    await fastify.listen({ port: CONFIG.serverPort, host: CONFIG.serverHost });
    log('info', `Daemon server listening on ${CONFIG.serverHost}:${CONFIG.serverPort}`);
    console.log('');
    console.log('═'.repeat(50));
    console.log('🚀 ProDisco Agent Daemon Running');
    console.log('═'.repeat(50));
    console.log(`📡 Server: http://${CONFIG.serverHost}:${CONFIG.serverPort}`);
    console.log('');
    console.log('Endpoints (official agent-sandbox pattern):');
    console.log('  GET  /         - Health check');
    console.log('  GET  /healthz  - Health check (k8s)');
    console.log('  GET  /status   - Agent status');
    console.log('  POST /execute  - Execute a task { command: string }');
    console.log('');
    console.log('Response format: { stdout: string, stderr: string, exit_code: int }');
    console.log('═'.repeat(50));
    console.log('');
    console.log('Example usage:');
    console.log(`  curl -X POST http://localhost:${CONFIG.serverPort}/execute \\`);
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"command": "List all pods in the default namespace"}\'');
    console.log('');
    console.log('With Sandbox Router (X-Sandbox-ID header):');
    console.log('  curl -X POST http://<router-ip>:8080/execute \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -H "X-Sandbox-ID: <sandbox-name>" \\');
    console.log('    -d \'{"command": "List all failing deployments"}\'');
    console.log('');
  } catch (err) {
    log('error', 'Failed to start daemon server', { error: err });
    process.exit(1);
  }
}

async function main() {
  // Print startup banner
  console.log('');
  if (CONFIG.useVertex) {
    console.log('Using Google Vertex AI authentication');
    console.log(`  Region: ${CONFIG.vertexRegion}`);
    console.log(`  Project: ${CONFIG.vertexProject}`);
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log('Using Anthropic API Key authentication');
  } else {
    console.error('ERROR: No authentication configured');
    console.error('Set either ANTHROPIC_API_KEY or CLAUDE_CODE_USE_VERTEX=1 with ANTHROPIC_VERTEX_PROJECT_ID');
    process.exit(1);
  }
  
  console.log('===================================');
  console.log('ProDisco Agent Sandbox');
  console.log('===================================');
  log('info', 'Initializing ProDisco Agent');
  log('info', `Mode: ${CONFIG.mode}`);
  log('info', `Model: ${CONFIG.model}`);
  log('info', `Namespace: ${CONFIG.namespace}`);
  log('info', `Max Turns: ${CONFIG.maxTurns}`);
  
  // Validate Vertex AI configuration
  if (CONFIG.useVertex && !CONFIG.vertexProject) {
    log('error', 'ERROR: ANTHROPIC_VERTEX_PROJECT_ID is required when using Vertex AI');
    process.exit(1);
  }

  // Route based on mode
  if (CONFIG.mode === 'daemon') {
    log('info', 'Starting in daemon mode with HTTP API');
    await startDaemonServer();
  } else {
    // Single-task mode: execute the task from environment and exit
    log('info', 'Running in single-task mode');
    const result = await executeTask(CONFIG.task);
    
    if (!result.success) {
      process.exit(1);
    }
    
    log('info', 'Single task completed, shutting down');
  }
}

// Run the agent
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
