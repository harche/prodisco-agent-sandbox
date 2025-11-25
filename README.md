# ProDisco Agent Sandbox

AI agent runtime packaging [@prodisco/k8s-mcp](https://www.npmjs.com/package/@prodisco/k8s-mcp) for [agent-sandbox](https://agent-sandbox.sigs.k8s.io/) deployment on Kubernetes.

## Prerequisites

- **Kubernetes cluster** (v1.28+) - kind, minikube, or GKE
- **kubectl** configured for your cluster
- **agent-sandbox** CRDs installed
- **Authentication** (choose one):
  - Google Cloud project with Vertex AI Claude access (recommended), OR
  - Anthropic API key ([get one here](https://console.anthropic.com/))

## Quick Start

**Image:** `quay.io/harpatil/prodisco-agent-sandbox:latest`

### Setup (one-time)

```bash
# 1. Install agent-sandbox CRDs and controller
VERSION=v0.1.0
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${VERSION}/manifest.yaml
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${VERSION}/extensions.yaml

# 2. Set up authentication (Vertex AI)
gcloud auth application-default login
kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=$HOME/.config/gcloud/application_default_credentials.json

# 3. Clone and deploy templates
git clone https://github.com/harpatil/prodisco-agent-sandbox.git && cd prodisco-agent-sandbox
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/sandbox-template.yaml
```

### Demo 1: Single-Task Mode (ephemeral)

Runs one task and exits. Best for CI/CD, scheduled audits, one-off queries.

```bash
# Create the demo claim
kubectl apply -f k8s/sandbox-claim.yaml

# Watch the agent work (streams in real-time)
kubectl logs -f prodisco-agent-demo

# When complete, the pod exits. Check status:
kubectl get sandboxclaim prodisco-agent-demo

# Run a different task:
# 1. Edit AGENT_TASK in k8s/sandbox-template.yaml (prodisco-agent-sandbox-vertex section)
# 2. Re-apply template and claim:
kubectl apply -f k8s/sandbox-template.yaml
kubectl delete sandboxclaim prodisco-agent-demo
kubectl apply -f k8s/sandbox-claim.yaml
kubectl logs -f prodisco-agent-demo
```

### Demo 2: Daemon Mode (long-running HTTP API)

Runs continuously, accepts tasks via HTTP. Best for interactive use, multiple queries.

```bash
# Create the daemon
kubectl apply -f k8s/sandbox-claim-daemon.yaml

# Wait for it to be ready
kubectl wait --for=condition=ready pod/prodisco-agent-daemon --timeout=60s

# Port-forward to access the API
kubectl port-forward pod/prodisco-agent-daemon 8888:8888 &

# Send tasks via HTTP
curl http://localhost:8888/status

curl -X POST http://localhost:8888/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "List all pods in the default namespace"}'

curl -X POST http://localhost:8888/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "Get the etcd pod details from kube-system"}'

# Cleanup
kubectl delete sandboxclaim prodisco-agent-daemon
```

### What You'll See

The agent will:
1. 🔍 Search for Kubernetes API methods using MCP
2. 📝 Write a TypeScript script
3. ⚡ Execute it with `npx tsx`
4. 📊 Return formatted results

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Agent Sandbox Pod                      │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ Agent Harness (src/agent.ts)      │ │
│  │  - Claude API integration         │ │
│  │  - Task orchestration             │ │
│  │  - MCP client                     │ │
│  └───────────────┬───────────────────┘ │
│                  │ stdio                │
│  ┌───────────────▼───────────────────┐ │
│  │ @prodisco/k8s-mcp (subprocess)    │ │
│  │  - Kubernetes API client          │ │
│  │  - Resource operations            │ │
│  │  - MCP server                     │ │
│  └───────────────┬───────────────────┘ │
│                  │                      │
└──────────────────┼──────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │ Kubernetes API  │
         │ (in-cluster)    │
         └─────────────────┘
```

## Configuration

### Environment Variables

#### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODE` | `single-task` | Execution mode: `single-task`, `interactive`, or `daemon` |
| `AGENT_TASK` | *varies* | The task for the agent to perform (single-task mode) |
| `MAX_ITERATIONS` | `10` | Maximum conversation iterations |
| `MCP_COMMAND` | `prodisco-k8s` | Command to start the MCP server |
| `K8S_NAMESPACE` | `default` | Kubernetes namespace to operate in |
| `LOG_LEVEL` | `info` | Logging level: `error`, `warn`, `info`, `debug` |

#### Anthropic API Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | *(required)* | Your Anthropic API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5-20250514` | Claude model to use |

#### Google Vertex AI Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_CODE_USE_VERTEX` | - | Set to `1` to enable Vertex AI |
| `CLOUD_ML_REGION` | - | GCP region (e.g., `us-east5`, `europe-west1`) |
| `ANTHROPIC_VERTEX_PROJECT_ID` | - | Your GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | - | Path to credentials file (not needed with Workload Identity) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5@20250929` | Claude model (Vertex AI format) |

> **Note**: Vertex AI model names use a different format than direct API (e.g., `claude-sonnet-4-5@20250929` vs `claude-sonnet-4-5-20250514`)

### Authentication Options

<details>
<summary><b>Anthropic API Key (Simple)</b></summary>

```bash
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=sk-ant-YOUR_KEY_HERE
```

</details>

<details>
<summary><b>Google Vertex AI (Enterprise)</b></summary>

**For GKE with Workload Identity (Production):**
```bash
gcloud iam service-accounts create prodisco-agent \
  --project=YOUR_GCP_PROJECT

gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT \
  --member="serviceAccount:prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud iam service-accounts add-iam-policy-binding \
  prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:YOUR_GCP_PROJECT.svc.id.goog[default/prodisco-agent]"
```

**For kind/minikube (Development):**
```bash
gcloud auth application-default login
kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=$HOME/.config/gcloud/application_default_credentials.json
```

</details>

## License

MIT
