# Changelog

## [0.1.0] - 2026-04-03

### Added

- Initial release with 10 MCP tools (3 meta + 7 domain)
- SQLite + FTS5 database with schema for pests, treatments, IPM guidance, symptoms, approved products
- Symptom-based differential diagnosis with confidence scoring (diagnostic=3, suggestive=2, associated=1)
- Dual transport: stdio (npm) and Streamable HTTP (Docker)
- Jurisdiction validation (GB supported)
- Data freshness monitoring
- Docker image with non-root user, health check
- CI/CD: TypeScript build, lint, test, CodeQL, Gitleaks, GHCR image build
- Pesticide disclaimer and privacy statement
