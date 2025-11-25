.PHONY: help install build clean test docker-build docker-push deploy deploy-rbac deploy-template deploy-claim logs delete-claim

# Configuration
IMAGE_REGISTRY ?= quay.io
IMAGE_ORG ?= harpatil
IMAGE_NAME ?= prodisco-agent-sandbox
IMAGE_TAG ?= latest
IMAGE_FULL = $(IMAGE_REGISTRY)/$(IMAGE_ORG)/$(IMAGE_NAME):$(IMAGE_TAG)

NAMESPACE ?= default

help: ## Show this help message
	@echo "ProDisco Agent Sandbox - Makefile"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm ci

build: ## Build TypeScript
	npm run build

clean: ## Clean build artifacts
	npm run clean

test: ## Run type checking
	npm run typecheck

docker-build: ## Build Docker image
	docker build -t $(IMAGE_FULL) .
	@echo ""
	@echo "Built image: $(IMAGE_FULL)"

docker-push: ## Push Docker image to registry
	docker push $(IMAGE_FULL)
	@echo ""
	@echo "Pushed image: $(IMAGE_FULL)"

docker-build-push: docker-build docker-push ## Build and push Docker image

deploy-rbac: ## Deploy RBAC resources (ServiceAccount, Role, RoleBinding)
	kubectl apply -f k8s/rbac.yaml -n $(NAMESPACE)
	@echo ""
	@echo "RBAC resources deployed to namespace: $(NAMESPACE)"

deploy-template: ## Deploy SandboxTemplate
	kubectl apply -f k8s/sandbox-template.yaml -n $(NAMESPACE)
	@echo ""
	@echo "SandboxTemplate deployed to namespace: $(NAMESPACE)"

deploy-claim: ## Deploy SandboxClaim
	kubectl apply -f k8s/sandbox-claim.yaml -n $(NAMESPACE)
	@echo ""
	@echo "SandboxClaim deployed to namespace: $(NAMESPACE)"

deploy: deploy-rbac deploy-template deploy-claim ## Deploy all resources (RBAC, Template, Claim)

delete-claim: ## Delete SandboxClaims
	kubectl delete -f k8s/sandbox-claim.yaml -n $(NAMESPACE) || true
	@echo ""
	@echo "SandboxClaims deleted from namespace: $(NAMESPACE)"

logs: ## Tail logs from agent pods
	@echo "Tailing logs from agent pods in namespace: $(NAMESPACE)"
	kubectl logs -l app=prodisco-agent-sandbox -n $(NAMESPACE) --follow

status: ## Show status of agent resources
	@echo "=== ServiceAccount ==="
	kubectl get serviceaccount prodisco-agent -n $(NAMESPACE) || true
	@echo ""
	@echo "=== Role ==="
	kubectl get role prodisco-agent-reader -n $(NAMESPACE) || true
	@echo ""
	@echo "=== RoleBinding ==="
	kubectl get rolebinding prodisco-agent-reader-binding -n $(NAMESPACE) || true
	@echo ""
	@echo "=== SandboxTemplates ==="
	kubectl get sandboxtemplate -n $(NAMESPACE) || true
	@echo ""
	@echo "=== SandboxClaims ==="
	kubectl get sandboxclaim -n $(NAMESPACE) || true
	@echo ""
	@echo "=== Pods ==="
	kubectl get pods -l app=prodisco-agent-sandbox -n $(NAMESPACE) || true

create-secret: ## Create Anthropic API key secret (requires ANTHROPIC_API_KEY env var)
	@if [ -z "$(ANTHROPIC_API_KEY)" ]; then \
		echo "ERROR: ANTHROPIC_API_KEY environment variable is not set"; \
		echo "Usage: ANTHROPIC_API_KEY=sk-ant-YOUR_KEY make create-secret"; \
		exit 1; \
	fi
	kubectl create secret generic anthropic-api-key \
		--from-literal=api-key=$(ANTHROPIC_API_KEY) \
		--namespace=$(NAMESPACE) \
		--dry-run=client -o yaml | kubectl apply -f -
	@echo ""
	@echo "Secret 'anthropic-api-key' created/updated in namespace: $(NAMESPACE)"

delete-secret: ## Delete Anthropic API key secret
	kubectl delete secret anthropic-api-key -n $(NAMESPACE) || true
	@echo ""
	@echo "Secret deleted from namespace: $(NAMESPACE)"

cleanup: delete-claim ## Cleanup all deployed resources
	kubectl delete -f k8s/sandbox-template.yaml -n $(NAMESPACE) || true
	kubectl delete -f k8s/rbac.yaml -n $(NAMESPACE) || true
	@echo ""
	@echo "All resources cleaned up from namespace: $(NAMESPACE)"

# Development targets
dev-install: ## Install all dependencies including dev
	npm install

dev-build: ## Build and watch for changes
	npm run build -- --watch

dev-run: build ## Build and run locally
	npm start

# CI targets
ci-test: install test build ## Run CI tests (install, typecheck, build)

version: ## Show version information
	@echo "Package version: $$(node -p "require('./package.json').version")"
	@echo "MCP server version: $$(node -p "require('./package.json').dependencies['@prodisco/k8s-mcp']")"
	@echo "Image: $(IMAGE_FULL)"

