# Deployment Guide

This guide provides detailed instructions for deploying ProDisco Agent Sandbox to Kubernetes.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [Configuration](#configuration)
4. [Verification](#verification)
5. [Production Considerations](#production-considerations)
6. [Upgrading](#upgrading)

## Prerequisites

### Required

- **Kubernetes cluster** (v1.28 or later)
- **kubectl** configured to access your cluster
- **agent-sandbox** installed on the cluster
- **Anthropic API key**

### Recommended

- **Helm** (if using Helm charts in the future)
- **Container registry access** (GHCR, Docker Hub, ECR, GCR, etc.)
- **Cluster admin access** (for RBAC setup)

## Installation Steps

### Step 1: Install agent-sandbox

If not already installed:

```bash
# Install agent-sandbox CRDs and controller
kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/latest/download/install.yaml

# Verify installation
kubectl get deployment -n agent-sandbox-system
kubectl get crd | grep agents.x-k8s.io
```

Expected CRDs:
- `sandboxtemplates.extensions.agents.x-k8s.io`
- `sandboxclaims.extensions.agents.x-k8s.io`

### Step 2: Create Namespace (Optional)

If deploying to a custom namespace:

```bash
# Create namespace
kubectl create namespace prodisco-agents

# Set as default for subsequent commands
kubectl config set-context --current --namespace=prodisco-agents
```

### Step 3: Deploy RBAC Resources

```bash
# Deploy ServiceAccount, Role, and RoleBinding
kubectl apply -f k8s/rbac.yaml

# Verify
kubectl get serviceaccount prodisco-agent
kubectl get role prodisco-agent-reader
kubectl get rolebinding prodisco-agent-reader-binding
```

### Step 4: Create API Key Secret

**Option A: From command line (recommended)**

```bash
# Create secret
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=sk-ant-YOUR_API_KEY_HERE

# Verify (should show 1 data item)
kubectl get secret anthropic-api-key
```

**Option B: From file**

```bash
# Save key to file
echo -n "sk-ant-YOUR_API_KEY_HERE" > api-key.txt

# Create secret from file
kubectl create secret generic anthropic-api-key \
  --from-file=api-key=api-key.txt

# Remove the file
rm api-key.txt
```

**Option C: Using external secret manager**

For production, consider using:
- [External Secrets Operator](https://external-secrets.io/)
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)
- Cloud provider secret managers

### Step 5: Build and Push Container Image

**Option A: Using pre-built image (Recommended)**

The public image is already configured in `k8s/sandbox-template.yaml`:

```yaml
image: quay.io/harpatil/prodisco-agent-sandbox:latest
```

**Option B: Build your own**

```bash
# Build
docker build -t prodisco-agent-sandbox:latest .

# Tag for your registry
docker tag prodisco-agent-sandbox:latest \
  quay.io/youruser/prodisco-agent-sandbox:latest

# Push
docker push quay.io/youruser/prodisco-agent-sandbox:latest
```

**Option C: Using Makefile**

```bash
# Set variables
export IMAGE_REGISTRY=quay.io
export IMAGE_ORG=youruser
export IMAGE_TAG=v0.1.0

# Build and push
make docker-build-push
```

### Step 6: Update Image Reference (if using custom image)

Edit `k8s/sandbox-template.yaml` and update the image reference:

```yaml
spec:
  podTemplate:
    spec:
      containers:
        - name: agent
          image: quay.io/youruser/prodisco-agent-sandbox:latest  # Your image
```

### Step 7: Deploy SandboxTemplate

```bash
# Deploy
kubectl apply -f k8s/sandbox-template.yaml

# Verify
kubectl get sandboxtemplate
kubectl get sandboxtemplate prodisco-agent-sandbox -o yaml
```

### Step 8: Create a SandboxClaim

```bash
# Deploy the example claim
kubectl apply -f k8s/sandbox-claim.yaml

# Verify
kubectl get sandboxclaim
kubectl get sandboxclaim prodisco-agent-task-1
```

### Step 9: Monitor Execution

```bash
# Check claim status
kubectl get sandboxclaim prodisco-agent-task-1 -o yaml

# Find the pod
kubectl get pods -l app=prodisco-agent-sandbox

# View logs
kubectl logs -l app=prodisco-agent-sandbox --follow

# Or use Make
make logs
```

## Configuration

### Customizing the Task

Edit `k8s/sandbox-claim.yaml` to customize the task:

```yaml
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: my-custom-task
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox
  env:
    - name: AGENT_TASK
      value: "Your custom task description here"
    - name: MAX_ITERATIONS
      value: "20"
```

### Adjusting Resource Limits

Edit `k8s/sandbox-template.yaml`:

```yaml
resources:
  requests:
    cpu: "200m"      # Increase for better performance
    memory: "512Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"
```

### Multi-Namespace Access

To allow the agent to access multiple namespaces:

1. Edit `k8s/rbac.yaml`
2. Uncomment the `ClusterRole` and `ClusterRoleBinding` sections
3. Apply the changes:
   ```bash
   kubectl apply -f k8s/rbac.yaml
   ```

### Using a Custom Kubeconfig

For scenarios where in-cluster auth is not suitable:

1. Create a kubeconfig Secret:
   ```bash
   kubectl create secret generic custom-kubeconfig \
     --from-file=config=/path/to/kubeconfig
   ```

2. Mount it in `sandbox-template.yaml`:
   ```yaml
   volumeMounts:
     - name: kubeconfig
       mountPath: /etc/kubeconfig
   volumes:
     - name: kubeconfig
       secret:
         secretName: custom-kubeconfig
   env:
     - name: KUBECONFIG
       value: /etc/kubeconfig/config
   ```

## Verification

### Health Checks

```bash
# Check all components
make status

# Or manually
kubectl get serviceaccount prodisco-agent
kubectl get role prodisco-agent-reader
kubectl get rolebinding prodisco-agent-reader-binding
kubectl get sandboxtemplate
kubectl get sandboxclaim
kubectl get pods -l app=prodisco-agent-sandbox
```

### Test Execution

Create a simple test claim:

```yaml
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: test-list-pods
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox
  env:
    - name: AGENT_TASK
      value: "List all pods in this namespace"
    - name: MAX_ITERATIONS
      value: "5"
```

```bash
kubectl apply -f test-claim.yaml
kubectl logs -l app=prodisco-agent-sandbox --follow
```

### Troubleshooting Failed Deployments

```bash
# Check events
kubectl get events --sort-by='.lastTimestamp'

# Describe the claim
kubectl describe sandboxclaim <name>

# Check pod status
kubectl get pods -l app=prodisco-agent-sandbox
kubectl describe pod <pod-name>

# Check RBAC permissions
kubectl auth can-i get pods \
  --as=system:serviceaccount:default:prodisco-agent

# Check secret
kubectl get secret anthropic-api-key
kubectl describe secret anthropic-api-key
```

## Production Considerations

### Security

1. **Namespace Isolation**: Deploy to dedicated namespaces
2. **RBAC**: Use least-privilege principle
3. **Secrets**: Use external secret management
4. **Network Policies**: Restrict network access
5. **Pod Security**: Enable Pod Security Standards

### Scalability

1. **Resource Limits**: Set appropriate limits based on workload
2. **Node Selectors**: Use node pools for AI workloads
3. **Horizontal Scaling**: Multiple SandboxClaims for parallel execution

### Monitoring

1. **Logs**: Ship logs to central logging system
2. **Metrics**: Export metrics for monitoring
3. **Alerting**: Set up alerts for failures

### High Availability

1. **Multiple Replicas**: For daemon mode
2. **Pod Disruption Budgets**: Prevent disruptions
3. **Anti-Affinity**: Spread across nodes

## Upgrading

### Upgrading the MCP Server Version

1. Update `package.json`:
   ```json
   {
     "dependencies": {
       "@prodisco/k8s-mcp": "^0.2.0"
     }
   }
   ```

2. Rebuild and push image:
   ```bash
   npm install
   npm run build
   make docker-build-push IMAGE_TAG=v0.2.0
   ```

3. Update SandboxTemplate:
   ```bash
   kubectl set image sandboxtemplate/prodisco-agent-sandbox \
     agent=quay.io/harpatil/prodisco-agent-sandbox:v0.2.0
   ```

4. Verify:
   ```bash
   kubectl get sandboxtemplate prodisco-agent-sandbox -o yaml
   ```

### Rolling Updates

For daemon mode deployments:

1. Update the image in SandboxTemplate
2. Delete existing claims: `kubectl delete sandboxclaim <name>`
3. Recreate claims: `kubectl apply -f k8s/sandbox-claim.yaml`

## Using the Makefile

The included Makefile simplifies common operations:

```bash
# Deploy everything
make deploy NAMESPACE=prodisco-agents

# Create API key secret
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY make create-secret

# View status
make status

# View logs
make logs

# Cleanup
make cleanup
```

## Next Steps

- Review [Configuration Reference](./CONFIGURATION.md)
- See [Examples](../README.md#examples)
- Check [Troubleshooting Guide](../README.md#troubleshooting)
- Read [Security Best Practices](./SECURITY.md)

