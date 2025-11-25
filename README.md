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

## Overview

This repository provides a containerized AI agent runtime that integrates with Kubernetes using the Model Context Protocol (MCP). The agent uses Claude via Anthropic's API or Google Vertex AI and communicates with Kubernetes through the `@prodisco/k8s-mcp` MCP server package.

**Key Features:**
- 🤖 Claude-powered AI agent for Kubernetes operations
- 🔌 Stdio-based MCP integration with `@prodisco/k8s-mcp`
- 🏗️ Native agent-sandbox support
- 🔒 Secure in-cluster authentication with RBAC
- 🐳 Multi-architecture container images (amd64/arm64)
- ⚙️ Configurable execution modes (single-task, interactive, daemon)
- ☁️ **Dual authentication support**: Anthropic API or Google Vertex AI

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


### 2. Configure Authentication

Choose **one** of the following authentication methods:

<details>
<summary><b>Option A: Anthropic API Key (Simple)</b></summary>

```bash
# Create the secret with your API key
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=sk-ant-YOUR_KEY_HERE \
  --namespace=default

# Verify
kubectl get secret anthropic-api-key -n default
```

</details>

<details>
<summary><b>Option B: Google Vertex AI (Enterprise)</b></summary>

Google Vertex AI provides enterprise-grade authentication without managing API keys.

**Benefits:**
- ✅ No API key management - credentials auto-rotate
- ✅ Enterprise security via Workload Identity (GKE)
- ✅ Centralized billing through GCP
- ✅ Regional deployment for data residency

**Choose your environment:**

**For GKE with Workload Identity (Production - Recommended):**
```bash
# Create GCP service account
gcloud iam service-accounts create prodisco-agent \
  --project=YOUR_GCP_PROJECT \
  --display-name="ProDisco Agent Sandbox"

# Grant Vertex AI permissions
gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT \
  --member="serviceAccount:prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Create Workload Identity binding
gcloud iam service-accounts add-iam-policy-binding \
  prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:YOUR_GCP_PROJECT.svc.id.goog[default/prodisco-agent]"

# Update rbac.yaml to add the Workload Identity annotation to ServiceAccount
```

**For kind/minikube/non-GKE (Development):**
```bash
# Option 1: Use your local gcloud credentials
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_QUOTA_PROJECT

kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=$HOME/.config/gcloud/application_default_credentials.json \
  --namespace=default

# Option 2: Use a service account key
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com

kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=sa-key.json \
  --namespace=default

rm sa-key.json  # Delete local key for security
```

**Update sandbox-template.yaml** with your GCP project ID:
```yaml
- name: ANTHROPIC_VERTEX_PROJECT_ID
  value: "YOUR_GCP_PROJECT"
```

See [k8s/README.md](k8s/README.md) for detailed setup instructions.

</details>

### 3. Deploy RBAC and SandboxTemplate

```bash
# Apply RBAC configuration (ServiceAccount, Role, RoleBinding)
kubectl apply -f k8s/rbac.yaml

# Apply the SandboxTemplate
kubectl apply -f k8s/sandbox-template.yaml
```

### 4. Create a SandboxClaim

```bash
# For Anthropic API authentication:
kubectl apply -f k8s/sandbox-claim.yaml

# For Vertex AI authentication, use the vertex template:
cat <<EOF | kubectl apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: my-vertex-task
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-vertex  # or prodisco-agent-sandbox-gke-workload-identity
  env:
    - name: AGENT_TASK
      value: "List all pods in the default namespace"
EOF

# Check the status
kubectl get sandboxclaim -n default

# View logs
kubectl logs -l app=prodisco-agent-sandbox -n default --follow
```

## Configuration

### Environment Variables

The agent can be configured via environment variables in the `SandboxTemplate`:

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

### Execution Modes

#### 1. Single-Task Mode (Default)

Executes one task and exits:

```yaml
env:
  - name: AGENT_MODE
    value: "single-task"
  - name: AGENT_TASK
    value: "List all pods and identify any that are failing"
```

#### 2. Interactive Mode

For local development/testing with a REPL:

```yaml
env:
  - name: AGENT_MODE
    value: "interactive"
```

#### 3. Daemon Mode

Long-running agent for continuous operation:

```yaml
env:
  - name: AGENT_MODE
    value: "daemon"
```

## Deployment

### Using Pre-built Images

```yaml
# In k8s/sandbox-template.yaml
spec:
  podTemplate:
    spec:
      containers:
        - name: agent
          image: quay.io/harpatil/prodisco-agent-sandbox:latest
```

### CI/CD

This repository includes GitHub Actions workflows for:
- **Testing**: TypeScript compilation and type checking
- **Building**: Multi-arch container images
- **Publishing**: Automatic publishing to GitHub Container Registry

Workflow files:
- `.github/workflows/test.yml` - Run on every PR
- `.github/workflows/build-and-publish.yml` - Build and publish on main/tags

## Security

### RBAC Configuration

The agent pod runs with a dedicated `ServiceAccount` that has tightly scoped permissions:

**Default permissions (read-only):**
- Pods, Services, ConfigMaps, PVCs
- Deployments, ReplicaSets, StatefulSets, DaemonSets
- Jobs, CronJobs
- Ingresses, NetworkPolicies

**To grant additional permissions:**

Edit `k8s/rbac.yaml` and add rules to the `Role`:

```yaml
rules:
  - apiGroups: [""]
    resources: ["secrets"]  # Add more resources
    verbs: ["get", "list"]  # Add more verbs if needed
```

**For cluster-wide access:**

Uncomment the `ClusterRole` and `ClusterRoleBinding` sections in `k8s/rbac.yaml`.

### Container Security

The container runs with security best practices:
- Non-root user (UID 1001)
- Read-only root filesystem
- All capabilities dropped
- Seccomp profile enabled
- No privilege escalation

### Secret Management

**Never commit secrets to git!** Always use Kubernetes Secrets:

**For Anthropic API:**
```bash
# Create from literal
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=YOUR_KEY

# Or from file
kubectl create secret generic anthropic-api-key \
  --from-file=api-key=/path/to/key/file
```

**For Google Vertex AI:**
```bash
# From Application Default Credentials (development)
kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=$HOME/.config/gcloud/application_default_credentials.json

# From Service Account key (CI/CD)
kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=sa-key.json
```

For production, consider using:
- **GKE Workload Identity** (recommended for GCP - no secrets needed!)
- [External Secrets Operator](https://external-secrets.io/)
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)
- Cloud provider secret managers (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)

## Versioning

This repository tracks the upstream `@prodisco/k8s-mcp` package version. The relationship is documented as follows:

| Image Tag | MCP Package Version | Release Date |
|-----------|---------------------|--------------|
| `v0.1.0` | `^0.1.2` | 2024-01-XX |
| `latest` | `^0.1.2` | *rolling* |

### Updating the MCP Server Version

To update to a new version of `@prodisco/k8s-mcp`:

1. Update `package.json`:
   ```json
   {
     "dependencies": {
       "@prodisco/k8s-mcp": "^0.2.0"
     }
   }
   ```

2. Install and test:
   ```bash
   npm install
   npm run build
   npm run dev
   ```

3. Commit and tag:
   ```bash
   git commit -am "Bump @prodisco/k8s-mcp to v0.2.0"
   git tag v0.1.1
   git push origin main --tags
   ```

4. CI will automatically build and publish the new image

## Troubleshooting

### Pod Won't Start

```bash
# Check pod status
kubectl get pods -l app=prodisco-agent-sandbox

# Describe pod for events
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>
```

### RBAC Permission Errors

```bash
# Check ServiceAccount
kubectl get serviceaccount prodisco-agent -n default

# Check Role
kubectl get role prodisco-agent-reader -n default -o yaml

# Check RoleBinding
kubectl get rolebinding prodisco-agent-reader-binding -n default -o yaml
```

### MCP Connection Issues

```bash
# Check logs for MCP server startup
kubectl logs <pod-name> | grep -i mcp

# Verify @prodisco/k8s-mcp is installed in the image
kubectl exec <pod-name> -- npm list @prodisco/k8s-mcp
```

### Authentication Issues

**For Kubernetes in-cluster authentication:**
1. ServiceAccount is properly mounted
2. RBAC permissions are granted
3. `KUBECONFIG` is NOT set (unless using explicit kubeconfig)

```bash
# Check ServiceAccount token mount
kubectl exec <pod-name> -- ls /var/run/secrets/kubernetes.io/serviceaccount/
```

**For Anthropic API issues:**
```bash
# Verify secret exists
kubectl get secret anthropic-api-key -n default

# Check if secret is properly referenced
kubectl describe pod <pod-name> | grep -A5 "Environment"
```

**For Google Vertex AI issues:**
```bash
# Verify GCP credentials secret exists
kubectl get secret gcp-credentials -n default

# Check credentials file content
kubectl get secret gcp-credentials -n default -o jsonpath='{.data.credentials\.json}' | base64 -d | jq .

# Verify environment variables
kubectl exec <pod-name> -- env | grep -E '(CLOUD_ML_REGION|ANTHROPIC_VERTEX_PROJECT_ID|GOOGLE_APPLICATION_CREDENTIALS|CLAUDE_CODE_USE_VERTEX)'

# Verify credentials file is mounted
kubectl exec <pod-name> -- ls -la /var/secrets/google/

# Test Workload Identity (GKE only)
kubectl exec <pod-name> -- curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email
```

**Common Vertex AI error solutions:**

| Error | Solution |
|-------|----------|
| `Permission denied` | Ensure service account has `roles/aiplatform.user` |
| `Project not found` | Check `ANTHROPIC_VERTEX_PROJECT_ID` is correct |
| `Invalid credentials` | Verify `gcp-credentials` secret content |
| `Model not found` | Use Vertex AI model format: `claude-sonnet-4-5@20250929` |

## Development

This section explains how to build your own image and test it locally or on a kind cluster.

### Prerequisites

- Node.js 20+
- Docker
- kubectl
- [kind](https://kind.sigs.k8s.io/) (for local Kubernetes testing)

### Local Development

```bash
# Clone the repository
git clone https://github.com/harpatil/prodisco-agent-sandbox.git
cd prodisco-agent-sandbox

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally (single-task mode with Vertex AI)
AGENT_MODE=single-task \
CLAUDE_CODE_USE_VERTEX=1 \
CLOUD_ML_REGION=us-east5 \
ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project \
ANTHROPIC_MODEL="claude-sonnet-4-5@20250929" \
AGENT_TASK="Say hello" \
npm start

# Run locally (daemon mode)
AGENT_MODE=daemon \
CLAUDE_CODE_USE_VERTEX=1 \
CLOUD_ML_REGION=us-east5 \
ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project \
ANTHROPIC_MODEL="claude-sonnet-4-5@20250929" \
npm start

# Test daemon mode
curl http://localhost:8888/healthz
curl -X POST http://localhost:8888/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "Say hello"}'
```

### Building Your Own Docker Image

```bash
# Build the image
docker build -t my-registry/prodisco-agent-sandbox:latest .

# Push to your registry
docker push my-registry/prodisco-agent-sandbox:latest

# Or build and push to quay.io
docker build -t quay.io/youruser/prodisco-agent-sandbox:latest .
docker push quay.io/youruser/prodisco-agent-sandbox:latest
```

### Testing on a kind Cluster

```bash
# 1. Create a kind cluster
kind create cluster --name agent-sandbox

# 2. Install agent-sandbox controller
VERSION=v0.1.0
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${VERSION}/manifest.yaml
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${VERSION}/extensions.yaml

# Wait for controller to be ready
kubectl -n agent-sandbox-system wait --for=condition=Ready pod -l app=agent-sandbox-controller --timeout=120s

# 3. Build and load your image into kind
docker build -t prodisco-agent-sandbox:dev .
kind load docker-image prodisco-agent-sandbox:dev --name agent-sandbox

# 4. Create credentials secret (Vertex AI)
gcloud auth application-default login
kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=$HOME/.config/gcloud/application_default_credentials.json

# 5. Apply RBAC and templates (with local image)
kubectl apply -f k8s/rbac.yaml

# Create a template that uses the local image
cat <<EOF | kubectl apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxTemplate
metadata:
  name: prodisco-agent-sandbox-dev
spec:
  podTemplate:
    metadata:
      labels:
        app: prodisco-agent-sandbox
    spec:
      serviceAccountName: prodisco-agent
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: agent
          image: prodisco-agent-sandbox:dev
          imagePullPolicy: Never  # Use local image
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            readOnlyRootFilesystem: true
          env:
            - name: CLAUDE_CODE_USE_VERTEX
              value: "1"
            - name: CLOUD_ML_REGION
              value: "us-east5"
            - name: ANTHROPIC_VERTEX_PROJECT_ID
              value: "your-gcp-project"
            - name: GOOGLE_APPLICATION_CREDENTIALS
              value: "/var/secrets/google/credentials.json"
            - name: ANTHROPIC_MODEL
              value: "claude-sonnet-4-5@20250929"
            - name: AGENT_MODE
              value: "single-task"
            - name: AGENT_TASK
              value: "List all pods in the cluster"
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: cache
              mountPath: /app/.cache
            - name: gcp-credentials
              mountPath: /var/secrets/google
              readOnly: true
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}
        - name: gcp-credentials
          secret:
            secretName: gcp-credentials
      restartPolicy: Never
EOF

# 6. Create a SandboxClaim to test
cat <<EOF | kubectl apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: test-dev-agent
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-dev
EOF

# 7. Watch the logs
kubectl logs -f -l app=prodisco-agent-sandbox

# 8. Cleanup
kubectl delete sandboxclaim test-dev-agent
kind delete cluster --name agent-sandbox
```

### Testing Daemon Mode on kind

```bash
# Use the daemon template with local image
cat <<EOF | kubectl apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxTemplate
metadata:
  name: prodisco-agent-sandbox-daemon-dev
spec:
  podTemplate:
    metadata:
      labels:
        app: prodisco-agent-sandbox
        mode: daemon
    spec:
      serviceAccountName: prodisco-agent
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: agent
          image: prodisco-agent-sandbox:dev
          imagePullPolicy: Never
          ports:
            - containerPort: 8888
              name: http
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            readOnlyRootFilesystem: true
          env:
            - name: CLAUDE_CODE_USE_VERTEX
              value: "1"
            - name: CLOUD_ML_REGION
              value: "us-east5"
            - name: ANTHROPIC_VERTEX_PROJECT_ID
              value: "your-gcp-project"
            - name: GOOGLE_APPLICATION_CREDENTIALS
              value: "/var/secrets/google/credentials.json"
            - name: ANTHROPIC_MODEL
              value: "claude-sonnet-4-5@20250929"
            - name: AGENT_MODE
              value: "daemon"
            - name: SERVER_PORT
              value: "8888"
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: cache
              mountPath: /app/.cache
            - name: gcp-credentials
              mountPath: /var/secrets/google
              readOnly: true
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8888
            initialDelaySeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8888
            initialDelaySeconds: 30
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}
        - name: gcp-credentials
          secret:
            secretName: gcp-credentials
      restartPolicy: OnFailure
EOF

# Create daemon SandboxClaim
cat <<EOF | kubectl apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: daemon-dev-agent
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-daemon-dev
EOF

# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=prodisco-agent-sandbox,mode=daemon --timeout=120s

# Port-forward to test
kubectl port-forward pod/daemon-dev-agent 8888:8888 &

# Test the daemon
curl http://localhost:8888/status
curl -X POST http://localhost:8888/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "List all pods in all namespaces"}'
```

## Demos

This agent supports two execution modes, each with its own use case:

| Mode | Use Case | Lifecycle |
|------|----------|-----------|
| **Single-Task (Ephemeral)** | One-off tasks, CI/CD pipelines | New pod per task, exits when done |
| **Daemon (Long-Running)** | Interactive use, multiple queries | HTTP API, stays running |

---

### Demo 1: Single-Task Mode (Ephemeral)

Each task creates a new sandbox pod that executes and exits. Best for:
- CI/CD pipelines
- Scheduled cluster audits
- One-off troubleshooting

```yaml
# k8s/demo-single-task.yaml
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: list-pods-task
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-vertex  # or prodisco-agent-sandbox for Anthropic API
  env:
    - name: AGENT_TASK
      value: "List all pods in the default namespace and identify any that are failing"
```

```bash
# Create the task
kubectl apply -f k8s/demo-single-task.yaml

# Watch the agent work
kubectl logs -f -l app=prodisco-agent-sandbox

# Pod exits when complete - check status
kubectl get sandboxclaim list-pods-task
```

#### More Single-Task Examples

**Troubleshoot Deployments:**
```yaml
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: troubleshoot-deployments
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-vertex
  env:
    - name: AGENT_TASK
      value: "Find any failing deployments and explain why they're failing"
    - name: MAX_ITERATIONS
      value: "20"
```

**Cluster Summary:**
```yaml
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: cluster-summary
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-vertex
  env:
    - name: AGENT_TASK
      value: "Provide a summary of all resources in the cluster including pod count, service count, and any issues"
```

---

### Demo 2: Daemon Mode (Long-Running HTTP API)

A long-running agent that accepts tasks via HTTP API. Best for:
- Interactive troubleshooting sessions
- Multiple queries without pod startup overhead
- Integration with external systems

This follows the [official agent-sandbox pattern](https://github.com/kubernetes-sigs/agent-sandbox/tree/main/examples/python-runtime-sandbox) with HTTP endpoints.

```yaml
# k8s/demo-daemon.yaml
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: prodisco-agent-daemon
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-vertex-daemon  # or prodisco-agent-sandbox-daemon
```

```bash
# Create the daemon
kubectl apply -f k8s/demo-daemon.yaml

# Wait for it to be ready
kubectl wait --for=condition=ready pod -l app=prodisco-agent-sandbox,mode=daemon --timeout=120s

# Port-forward to access the API locally
kubectl port-forward svc/prodisco-agent-daemon 8888:8888 &

# Send tasks via HTTP API (official agent-sandbox pattern)
curl -X POST http://localhost:8888/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "List all pods in the default namespace"}'
```

#### Daemon API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/healthz` | GET | Kubernetes health probe |
| `/status` | GET | Agent status and configuration |
| `/execute` | POST | Execute a task (official pattern) |

**Request format:**
```json
{
  "command": "Your task description here"
}
```

**Response format:**
```json
{
  "stdout": "Task result output",
  "stderr": "",
  "exit_code": 0
}
```

#### Using with Sandbox Router (Scalable Multi-Agent)

For production with multiple daemon agents, use the [Sandbox Router](https://github.com/kubernetes-sigs/agent-sandbox/tree/main/clients/python/agentic-sandbox-client/sandbox-router):

```bash
# Deploy the sandbox router
kubectl apply -f sandbox-router.yaml

# Send requests via router (routes by X-Sandbox-ID header)
curl -X POST http://<router-ip>:8080/execute \
  -H "Content-Type: application/json" \
  -H "X-Sandbox-ID: prodisco-agent-daemon" \
  -H "X-Sandbox-Namespace: default" \
  -H "X-Sandbox-Port: 8888" \
  -d '{"command": "Check for pods with high restart counts"}'
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add/update tests if applicable
5. Submit a pull request

## Related Projects

- [@prodisco/k8s-mcp](https://github.com/prodisco/k8s-mcp) - The upstream MCP server package
- [agent-sandbox](https://agent-sandbox.sigs.k8s.io/) - Kubernetes agent-sandbox project
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

## License

MIT

## Support

- **Issues**: [GitHub Issues](https://github.com/harpatil/prodisco-agent-sandbox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/harpatil/prodisco-agent-sandbox/discussions)
- **MCP Server Issues**: [@prodisco/k8s-mcp Issues](https://github.com/prodisco/k8s-mcp/issues)

## Acknowledgments

- Built on [Model Context Protocol](https://modelcontextprotocol.io/)
- Powered by [Anthropic Claude](https://www.anthropic.com/)
- Designed for [agent-sandbox](https://agent-sandbox.sigs.k8s.io/)

