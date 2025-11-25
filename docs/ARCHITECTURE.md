# Architecture

This document describes the architecture of the ProDisco Agent Sandbox system.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           agent-sandbox Namespace                      │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  agent-sandbox Controller                        │  │ │
│  │  │  - Watches SandboxClaims                         │  │ │
│  │  │  - Creates Pods from SandboxTemplates            │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Application Namespace (default)              │ │
│  │                                                        │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  Agent Pod (from SandboxClaim)                   │ │ │
│  │  │                                                  │ │ │
│  │  │  ┌────────────────────────────────────────────┐ │ │ │
│  │  │  │  Agent Harness (Node.js)                   │ │ │ │
│  │  │  │  - Task orchestration                      │ │ │ │
│  │  │  │  - MCP client                              │ │ │ │
│  │  │  │  - API: Anthropic Claude                   │ │ │ │
│  │  │  └────────────────┬───────────────────────────┘ │ │ │
│  │  │                   │ stdio                        │ │ │
│  │  │  ┌────────────────▼───────────────────────────┐ │ │ │
│  │  │  │  @prodisco/k8s-mcp (subprocess)            │ │ │ │
│  │  │  │  - MCP server                              │ │ │ │
│  │  │  │  - Kubernetes client                       │ │ │ │
│  │  │  └────────────────┬───────────────────────────┘ │ │ │
│  │  └──────────────────┼──────────────────────────────┘ │ │
│  │                     │                                │ │
│  │  ServiceAccount: prodisco-agent                     │ │
│  │  Role: prodisco-agent-reader (RBAC)                 │ │
│  └────────────────────┼──────────────────────────────────┘ │
│                       │                                    │
│  ┌────────────────────▼──────────────────────────────────┐ │
│  │            Kubernetes API Server                      │ │
│  │  - Pod list/get                                       │ │
│  │  - Deployment list/get                                │ │
│  │  - Service list/get                                   │ │
│  │  - etc.                                               │ │
│  └───────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
                  ┌─────────────────────┐
                  │  Anthropic API      │
                  │  (Claude)           │
                  └─────────────────────┘
```

## Components

### 1. Agent Harness (`src/agent.ts`)

**Responsibility**: Orchestrate the AI agent's execution

**Key Functions**:
- Initialize MCP client connection
- Manage conversation state
- Call Anthropic API (Claude)
- Parse and execute tool calls
- Handle different execution modes

**Execution Modes**:
1. **Single-Task**: Execute one task and exit
2. **Interactive**: REPL for development
3. **Daemon**: Long-running process

**Configuration**: Via environment variables

### 2. MCP Server (`@prodisco/k8s-mcp`)

**Responsibility**: Provide Kubernetes operations as MCP tools

**Communication**: Stdio-based transport

**Key Features**:
- Resource listing (Pods, Deployments, Services, etc.)
- Resource details and status
- Log retrieval
- Event watching
- In-cluster authentication support

**Important**: This is a separate NPM package, not part of this repository.

### 3. agent-sandbox Controller

**Responsibility**: Manage sandboxed execution environments

**What it does**:
- Watches for `SandboxClaim` resources
- Creates Pods based on `SandboxTemplate` specifications
- Manages pod lifecycle
- Handles cleanup

**Part of**: Kubernetes SIG Agent Sandbox project

### 4. Kubernetes RBAC

**Components**:
- **ServiceAccount**: `prodisco-agent`
- **Role**: `prodisco-agent-reader` (namespace-scoped)
- **RoleBinding**: Links ServiceAccount to Role

**Permissions**: Read-only access to common resources

### 5. Container Image

**Base**: Node.js 20 Alpine

**Security**:
- Non-root user (UID 1001)
- Read-only root filesystem
- Minimal attack surface

**Contents**:
- Built agent harness
- NPM production dependencies
- `@prodisco/k8s-mcp` package

## Data Flow

### Single-Task Execution Flow

```
1. User creates SandboxClaim
   └─> kubectl apply -f sandbox-claim.yaml

2. agent-sandbox Controller detects claim
   └─> Creates Pod from SandboxTemplate

3. Pod starts
   └─> Container runs agent.ts

4. Agent initializes
   ├─> Spawns @prodisco/k8s-mcp subprocess (stdio)
   ├─> Connects MCP client to server
   └─> Verifies available tools

5. Agent executes task
   ├─> Sends task to Anthropic API with tool definitions
   ├─> Receives response with tool_use
   ├─> Calls MCP tool via stdio
   │   └─> MCP server calls Kubernetes API (via ServiceAccount)
   ├─> Returns result to Claude
   └─> Iterates until task complete

6. Agent exits
   └─> Pod completes (restartPolicy: Never)

7. User views results
   └─> kubectl logs <pod-name>
```

### Communication Protocols

#### Agent ↔ Anthropic API
- **Protocol**: HTTPS (REST API)
- **Authentication**: API key (from Secret)
- **Data**: JSON (Messages API format)
- **Direction**: Bidirectional

#### Agent ↔ MCP Server
- **Protocol**: stdio (JSON-RPC 2.0)
- **Transport**: Standard input/output
- **Data**: MCP protocol messages
- **Direction**: Bidirectional

#### MCP Server ↔ Kubernetes API
- **Protocol**: HTTPS (REST API)
- **Authentication**: ServiceAccount token (in-cluster)
- **Data**: JSON (Kubernetes API format)
- **Direction**: Bidirectional

## Security Model

### Trust Boundaries

```
┌─────────────────────────────────────────────┐
│  Untrusted: User Input                      │
│  (Task description, parameters)             │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  Semi-Trusted: Agent Harness                │
│  - Validates inputs                         │
│  - Enforces iteration limits                │
│  - Logs all actions                         │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  Semi-Trusted: Claude API                   │
│  - May generate arbitrary tool calls        │
│  - Bounded by tool definitions              │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  Trusted: MCP Server                        │
│  - Validates tool calls                     │
│  - Enforces RBAC permissions                │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  Trusted: Kubernetes API                    │
│  - Final authorization decision             │
│  - Audit logging                            │
└─────────────────────────────────────────────┘
```

### Security Controls

1. **Network Isolation**: Pod network policies (if enabled)
2. **RBAC**: Least-privilege access
3. **Secret Management**: API keys in Kubernetes Secrets
4. **Container Security**: Non-root, read-only filesystem
5. **Audit Logging**: All Kubernetes API calls logged

## Scalability

### Horizontal Scaling

Multiple SandboxClaims can run concurrently:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Agent Pod 1  │  │ Agent Pod 2  │  │ Agent Pod 3  │
│ Task: List   │  │ Task: Debug  │  │ Task: Report │
└──────────────┘  └──────────────┘  └──────────────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │ Kubernetes API  │
                └─────────────────┘
```

### Resource Management

- **CPU**: Configurable requests/limits per pod
- **Memory**: Configurable requests/limits per pod
- **API Rate Limiting**: Kubernetes API throttling applies

## Extensibility

### Adding New MCP Tools

To add new Kubernetes operations:

1. Update `@prodisco/k8s-mcp` package (in separate repo)
2. Publish new version to NPM
3. Update `package.json` dependency version
4. Rebuild and redeploy container image

### Custom Agent Logic

To modify agent behavior:

1. Edit `src/agent.ts`
2. Add new execution modes or features
3. Rebuild container image
4. Update SandboxTemplate

### Alternative AI Models

To use a different model:

1. Modify agent harness to support different API
2. Update configuration in SandboxTemplate
3. Change secret references if needed

## Failure Modes

### Agent Failures
- **Cause**: Invalid configuration, API errors
- **Impact**: Single task fails
- **Recovery**: Fix configuration, recreate SandboxClaim

### MCP Server Failures
- **Cause**: Invalid kubeconfig, RBAC errors
- **Impact**: Tool calls fail
- **Recovery**: Fix RBAC, verify ServiceAccount

### Kubernetes API Failures
- **Cause**: API unavailable, rate limiting
- **Impact**: MCP tools fail
- **Recovery**: Wait for API recovery, adjust rate limits

### Network Failures
- **Cause**: Network partitions, DNS issues
- **Impact**: Cannot reach Anthropic API or Kubernetes API
- **Recovery**: Network troubleshooting

## Monitoring and Observability

### Logs
- **Agent logs**: Stdout/stderr (captured by Kubernetes)
- **MCP server logs**: Stderr (visible in pod logs)
- **Kubernetes audit logs**: API access patterns

### Metrics (Future)
- Task completion rate
- Execution duration
- API call counts
- Error rates

### Tracing (Future)
- End-to-end request tracing
- Tool call latency
- API call breakdown

## Related Architectures

### Comparison with Other Patterns

| Pattern | ProDisco Agent | Kubernetes Operator | Serverless Function |
|---------|----------------|---------------------|---------------------|
| Execution | Agent-driven | Controller-driven | Event-driven |
| State | Stateless (per task) | Stateful | Stateless |
| Duration | Minutes | Continuous | Seconds |
| Scaling | Horizontal | Single instance | Auto-scale |
| Use Case | Complex tasks | Resource management | Simple operations |

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [agent-sandbox Design](https://agent-sandbox.sigs.k8s.io/concepts/architecture/)
- [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post)
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

