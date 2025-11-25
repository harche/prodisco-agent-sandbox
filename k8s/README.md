# Kubernetes Manifests

This directory contains Kubernetes manifests for deploying the ProDisco Agent Sandbox.

## Authentication Options

ProDisco Agent Sandbox supports two authentication methods for Claude:

| Method | Use Case | Security | Setup Complexity |
|--------|----------|----------|------------------|
| **Anthropic API Key** | Direct API access | Good | Simple |
| **Google Vertex AI** | Enterprise GCP integration | Highest | Medium |

### Quick Comparison

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Anthropic API Key                    │ Google Vertex AI                 │
├─────────────────────────────────────────────────────────────────────────┤
│ ✅ Simple setup                      │ ✅ No API key management         │
│ ✅ Works anywhere                    │ ✅ Enterprise security (WI)      │
│ ⚠️  Manual key rotation             │ ✅ Auto credential rotation      │
│                                      │ ✅ Centralized GCP billing       │
│                                      │ ✅ Regional deployment           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Files

### rbac.yaml
- **ServiceAccount**: `prodisco-agent` - Dedicated service account for agent pods
- **Role**: `prodisco-agent-reader` - Read-only permissions for Kubernetes resources
- **RoleBinding**: Links the ServiceAccount to the Role

**Permissions granted:**
- Read-only access to Pods, Services, ConfigMaps, Deployments, etc.
- Scoped to the namespace (default: `default`)

**To grant additional permissions:**
Edit the `Role` rules section and add more resources/verbs.

**For cluster-wide access:**
Uncomment the `ClusterRole` and `ClusterRoleBinding` sections.

**For GKE Workload Identity:**
Uncomment the `iam.gke.io/gcp-service-account` annotation in the ServiceAccount.

### secret-example.yaml
Example Secret manifests for authentication.

**Contains two secret examples:**
1. `anthropic-api-key` - For direct Anthropic API authentication
2. `gcp-credentials` - For Google Vertex AI authentication

**⚠️ SECURITY WARNING**: Never commit actual secrets to git!

### sandbox-template.yaml
SandboxTemplate definitions for the agent sandbox.

**Contains templates for different authentication methods:**

| Template Name | Auth Method | Mode |
|---------------|-------------|------|
| `prodisco-agent-sandbox` | Anthropic API | Single-task |
| `prodisco-agent-sandbox-daemon` | Anthropic API | Daemon |
| `prodisco-agent-sandbox-vertex` | Vertex AI | Single-task |
| `prodisco-agent-sandbox-vertex-daemon` | Vertex AI | Daemon |
| `prodisco-agent-sandbox-gke-workload-identity` | Workload Identity | Single-task |

### sandbox-claim.yaml
SandboxClaim examples for creating agent instances.

---

## Option 1: Anthropic API Key Setup

The simplest approach - use a direct Anthropic API key.

### Step 1: Create the Secret

```bash
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=sk-ant-YOUR_KEY_HERE \
  --namespace=default
```

### Step 2: Deploy

```bash
kubectl apply -f rbac.yaml
kubectl apply -f sandbox-template.yaml
kubectl apply -f sandbox-claim.yaml
```

### Step 3: Verify

```bash
kubectl get pods -l app=prodisco-agent-sandbox
kubectl logs -l app=prodisco-agent-sandbox --follow
```

---

## Option 2: Google Vertex AI Setup

Enterprise-grade authentication via Google Cloud. Choose the sub-option that matches your environment.

### Prerequisites

1. GCP Project with Vertex AI API enabled
2. Access to Claude models via Vertex AI (contact Google/Anthropic for access)
3. GCP Service Account with `roles/aiplatform.user` permission

### Option 2A: Workload Identity (GKE Production - Recommended)

The most secure method for GKE clusters. No JSON keys needed!

**How it works:**
- GKE automatically provides credentials via the metadata server
- Kubernetes ServiceAccount is linked to a GCP Service Account
- Credentials are short-lived and auto-rotated

**Step 1: Create GCP Service Account**

```bash
# Create the GCP service account
gcloud iam service-accounts create prodisco-agent \
  --project=YOUR_GCP_PROJECT \
  --display-name="ProDisco Agent Sandbox"

# Grant Vertex AI permissions
gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT \
  --member="serviceAccount:prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

**Step 2: Create Workload Identity Binding**

```bash
# Bind K8s ServiceAccount to GCP ServiceAccount
gcloud iam service-accounts add-iam-policy-binding \
  prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:YOUR_GCP_PROJECT.svc.id.goog[default/prodisco-agent]"
```

**Step 3: Update RBAC with Workload Identity Annotation**

Edit `rbac.yaml` and uncomment the annotation:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prodisco-agent
  namespace: default
  annotations:
    # Uncomment for GKE Workload Identity
    iam.gke.io/gcp-service-account: prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com
```

**Step 4: Update Template with Your Project ID**

Edit `sandbox-template.yaml` and update `ANTHROPIC_VERTEX_PROJECT_ID`:

```yaml
- name: ANTHROPIC_VERTEX_PROJECT_ID
  value: "YOUR_GCP_PROJECT"
```

**Step 5: Deploy**

```bash
kubectl apply -f rbac.yaml
kubectl apply -f sandbox-template.yaml

# Create a claim using the Workload Identity template
cat <<EOF | kubectl apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: my-task
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-gke-workload-identity
  env:
    - name: AGENT_TASK
      value: "List all pods in the cluster"
EOF
```

### Option 2B: Service Account JSON Key (kind/minikube/non-GKE)

Use this for local development or non-GKE clusters.

**Step 1: Create Service Account and Key**

```bash
# Create service account
gcloud iam service-accounts create prodisco-agent \
  --project=YOUR_GCP_PROJECT \
  --display-name="ProDisco Agent Sandbox"

# Grant Vertex AI permissions
gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT \
  --member="serviceAccount:prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Create JSON key
gcloud iam service-accounts keys create prodisco-agent-key.json \
  --iam-account=prodisco-agent@YOUR_GCP_PROJECT.iam.gserviceaccount.com
```

**Step 2: Create Kubernetes Secret**

```bash
kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=prodisco-agent-key.json \
  --namespace=default

# Delete local key for security
rm prodisco-agent-key.json
```

**Step 3: Update Template with Your Project ID**

Edit `sandbox-template.yaml` and update `ANTHROPIC_VERTEX_PROJECT_ID`:

```yaml
- name: ANTHROPIC_VERTEX_PROJECT_ID
  value: "YOUR_GCP_PROJECT"
```

**Step 4: Deploy**

```bash
kubectl apply -f rbac.yaml
kubectl apply -f sandbox-template.yaml

# Create a claim using the Vertex AI template
cat <<EOF | kubectl apply -f -
apiVersion: extensions.agents.x-k8s.io/v1alpha1
kind: SandboxClaim
metadata:
  name: my-task
spec:
  sandboxTemplateRef:
    name: prodisco-agent-sandbox-vertex
  env:
    - name: AGENT_TASK
      value: "List all pods in the cluster"
EOF
```

### Option 2C: Application Default Credentials (Local Dev)

Use your local gcloud credentials for development.

**Step 1: Authenticate with gcloud**

```bash
# Login and set quota project
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_QUOTA_PROJECT
```

**Step 2: Create Secret from ADC**

```bash
kubectl create secret generic gcp-credentials \
  --from-file=credentials.json=$HOME/.config/gcloud/application_default_credentials.json \
  --namespace=default
```

**Step 3: Deploy using Vertex AI template**

Same as Option 2B Step 4.

---

## Environment Variables Reference

### Anthropic API Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `ANTHROPIC_MODEL` | No | Model name (default: `claude-sonnet-4-5-20250514`) |

### Google Vertex AI Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_USE_VERTEX` | Yes | Set to `1` to enable Vertex AI |
| `CLOUD_ML_REGION` | Yes | GCP region (e.g., `us-east5`) |
| `ANTHROPIC_VERTEX_PROJECT_ID` | Yes | Your GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Maybe | Path to credentials file (not needed with Workload Identity) |
| `ANTHROPIC_MODEL` | No | Model name (default: `claude-sonnet-4-5@20250929`) |

**Available Vertex AI Regions:**
- `us-east5` (US)
- `europe-west1` (EU)
- `asia-southeast1` (APAC)

---

## Deployment Order

1. **RBAC** (required first):
   ```bash
   kubectl apply -f rbac.yaml
   ```

2. **Secret** (required before SandboxClaim):
   
   For Anthropic API:
   ```bash
   kubectl create secret generic anthropic-api-key \
     --from-literal=api-key=YOUR_KEY \
     --namespace=default
   ```
   
   For Vertex AI (non-GKE):
   ```bash
   kubectl create secret generic gcp-credentials \
     --from-file=credentials.json=YOUR_KEY_FILE.json \
     --namespace=default
   ```

3. **SandboxTemplate**:
   ```bash
   kubectl apply -f sandbox-template.yaml
   ```

4. **SandboxClaim** (creates the actual agent pod):
   ```bash
   kubectl apply -f sandbox-claim.yaml
   ```

---

## Namespace Configuration

By default, all resources are deployed to the `default` namespace. To use a different namespace:

1. Update the namespace in all manifests
2. Update the `K8S_NAMESPACE` environment variable in the SandboxTemplate
3. Ensure RBAC permissions cover the target namespace
4. For Workload Identity, update the IAM binding with the correct namespace

---

## Resource Limits

Default resource limits:
- **Requests**: 100m CPU, 256Mi memory
- **Limits**: 500m CPU, 512Mi memory (single-task), 1Gi (daemon)

Adjust based on your workload requirements.

---

## Security Considerations

- All containers run as non-root (UID 1001)
- Read-only root filesystem
- All capabilities dropped
- Seccomp profile enabled
- RBAC follows least-privilege principle
- For production: Use Workload Identity over JSON keys

---

## Troubleshooting

### Pod won't start
```bash
kubectl describe sandboxclaim <name>
kubectl get pods -l app=prodisco-agent-sandbox
kubectl describe pod <pod-name>
```

### RBAC errors
```bash
kubectl auth can-i get pods --as=system:serviceaccount:default:prodisco-agent
kubectl get role prodisco-agent-reader -o yaml
```

### Secret not found

For Anthropic API:
```bash
kubectl get secret anthropic-api-key -n default
```

For Vertex AI:
```bash
kubectl get secret gcp-credentials -n default
```

### Vertex AI Authentication Issues

**Verify secret exists and has correct key:**
```bash
kubectl get secret gcp-credentials -n default -o jsonpath='{.data.credentials\.json}' | base64 -d | jq .
```

**Verify environment variables:**
```bash
kubectl exec <pod-name> -- env | grep -E '(CLOUD_ML_REGION|ANTHROPIC_VERTEX_PROJECT_ID|GOOGLE_APPLICATION_CREDENTIALS|CLAUDE_CODE_USE_VERTEX)'
```

**Verify credentials file is mounted:**
```bash
kubectl exec <pod-name> -- ls -la /var/secrets/google/
```

**Test GKE Workload Identity:**
```bash
kubectl exec <pod-name> -- curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email
```

### Common Vertex AI Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Permission denied` | Missing `roles/aiplatform.user` | Grant IAM role to service account |
| `Project not found` | Wrong project ID | Check `ANTHROPIC_VERTEX_PROJECT_ID` |
| `Model not found` | Wrong model name or no access | Use correct Vertex AI model name format |
| `Quota exceeded` | API quota limit | Request quota increase |

---

## References

- [agent-sandbox Documentation](https://agent-sandbox.sigs.k8s.io/)
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Vertex AI Claude](https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude)
