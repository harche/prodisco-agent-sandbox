# Contributing to ProDisco Agent Sandbox

Thank you for your interest in contributing to ProDisco Agent Sandbox! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and considerate in all interactions. We aim to maintain a welcoming and inclusive environment.

## How to Contribute

### Reporting Issues

If you find a bug or have a feature request:

1. Check the [existing issues](https://github.com/your-org/prodisco-agent-sandbox/issues) to avoid duplicates
2. Create a new issue with a clear title and description
3. Include:
   - Steps to reproduce (for bugs)
   - Expected behavior
   - Actual behavior
   - Your environment (Node version, Kubernetes version, etc.)
   - Relevant logs or screenshots

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/prodisco-agent-sandbox.git
   cd prodisco-agent-sandbox
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Making Changes

1. **Write clean code**: Follow the existing code style
2. **Type safety**: Ensure all TypeScript code type-checks
3. **Comments**: Add comments for complex logic
4. **Commit messages**: Use clear, descriptive commit messages

### Testing Your Changes

```bash
# Type check
npm run typecheck

# Build
npm run build

# Test locally
npm run dev

# Build Docker image
docker build -t prodisco-agent-sandbox:test .
```

### Submitting a Pull Request

1. Push your changes to your fork
2. Create a pull request against the `main` branch
3. Fill out the PR template with:
   - Description of changes
   - Related issue numbers
   - Testing performed
   - Any breaking changes

4. Wait for review and address any feedback

## Development Guidelines

### TypeScript

- Use TypeScript strict mode
- Prefer interfaces over types for object shapes
- Avoid `any` - use `unknown` if type is truly unknown
- Document complex types with comments

### Error Handling

- Use try-catch for async operations
- Log errors with appropriate context
- Use structured logging (JSON) when possible

### Security

- Never commit secrets or API keys
- Follow principle of least privilege for RBAC
- Validate and sanitize inputs
- Keep dependencies updated

### Documentation

- Update README.md for user-facing changes
- Add inline comments for complex logic
- Include examples for new features
- Update CHANGELOG.md (if present)

## Project Structure

```
prodisco-agent-sandbox/
├── src/
│   └── agent.ts          # Main agent harness
├── k8s/                   # Kubernetes manifests
│   ├── rbac.yaml         # ServiceAccount, Role, RoleBinding
│   ├── sandbox-template.yaml  # SandboxTemplate
│   └── sandbox-claim.yaml     # SandboxClaim examples
├── .github/
│   └── workflows/        # CI/CD workflows
├── Dockerfile            # Container image definition
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md (if present)
3. Create a git tag: `git tag v0.x.x`
4. Push tag: `git push origin v0.x.x`
5. CI will automatically build and publish the image

## Important Notes

### About @prodisco/k8s-mcp

This repository **consumes** the `@prodisco/k8s-mcp` package as a dependency. If you need to make changes to the MCP server itself:

1. Contribute to the upstream [@prodisco/k8s-mcp](https://github.com/your-org/k8s-mcp) repository
2. Wait for a new version to be published to npm
3. Update the dependency version in this repository

### Scope of This Repository

This repository is focused on:
- Agent runtime and orchestration
- Kubernetes deployment configuration
- Integration with agent-sandbox
- Container image packaging

It is **not** responsible for:
- MCP server implementation (that's in @prodisco/k8s-mcp)
- Kubernetes API operations (handled by the MCP server)

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/your-org/prodisco-agent-sandbox/discussions)
- **Bugs**: Open an [Issue](https://github.com/your-org/prodisco-agent-sandbox/issues)
- **MCP Server**: Refer to [@prodisco/k8s-mcp](https://github.com/your-org/k8s-mcp)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing! 🎉

