# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure
- Agent harness with three execution modes (single-task, interactive, daemon)
- Dockerfile with multi-stage build for optimized images
- Kubernetes manifests:
  - RBAC configuration (ServiceAccount, Role, RoleBinding)
  - SandboxTemplate definitions (task and daemon modes)
  - SandboxClaim examples
- GitHub Actions CI/CD workflows:
  - Automated testing
  - Multi-arch container image builds
  - Automated publishing to GHCR
- Comprehensive documentation:
  - README with quick start guide
  - Configuration reference
  - Troubleshooting guide
  - Examples
- Dependabot configuration for automated dependency updates
- Security hardening:
  - Non-root container user
  - Read-only root filesystem
  - Minimal RBAC permissions
  - Seccomp profile

### Dependencies
- `@prodisco/k8s-mcp`: ^0.1.2
- `@modelcontextprotocol/sdk`: ^1.0.0
- Node.js 20+

## [0.1.0] - 2024-01-XX

### Added
- Initial release
- Basic agent functionality with @prodisco/k8s-mcp integration
- agent-sandbox compatibility
- Container image with security best practices

[Unreleased]: https://github.com/your-org/prodisco-agent-sandbox/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/prodisco-agent-sandbox/releases/tag/v0.1.0

