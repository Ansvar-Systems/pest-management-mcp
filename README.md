# Pest Management MCP

[![CI](https://github.com/ansvar-systems/pest-management-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ansvar-systems/pest-management-mcp/actions/workflows/ci.yml)
[![GHCR](https://github.com/ansvar-systems/pest-management-mcp/actions/workflows/ghcr-build.yml/badge.svg)](https://github.com/ansvar-systems/pest-management-mcp/actions/workflows/ghcr-build.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

UK pest, disease, and weed management via the [Model Context Protocol](https://modelcontextprotocol.io). Identify crop threats, get treatment options, IPM guidance, and run symptom-based differential diagnosis -- all from your AI assistant.

Part of [Ansvar Open Agriculture](https://ansvar.eu/open-agriculture).

## Why This Exists

Farmers and agronomists need quick access to pest identification, treatment options, and IPM thresholds. This information is published by AHDB and HSE but is scattered across knowledge libraries, PDFs, and the CRD pesticide database. This MCP server brings it all together in a searchable, structured format.

## Quick Start

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pest-management": {
      "command": "npx",
      "args": ["-y", "@ansvar/pest-management-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add pest-management npx @ansvar/pest-management-mcp
```

### Streamable HTTP (remote)

```
https://mcp.ansvar.eu/pest-management/mcp
```

### Docker (self-hosted)

```bash
docker run -p 3000:3000 ghcr.io/ansvar-systems/pest-management-mcp:latest
```

### npm (stdio)

```bash
npx @ansvar/pest-management-mcp
```

## Example Queries

Ask your AI assistant:

- "What diseases affect winter wheat?"
- "I see yellow patches on my wheat leaves with dark spots -- what could it be?"
- "What are the treatment options for blackgrass?"
- "Show me IPM guidance for septoria in winter wheat"
- "What products contain prothioconazole approved for wheat?"
- "What are all the pests and weeds that attack barley?"

## Stats

| Metric | Value |
|--------|-------|
| Tools | 10 (3 meta + 7 domain) |
| Jurisdiction | GB |
| Data sources | AHDB Knowledge Library, HSE CRD Pesticide Register, AHDB IPM Guidance |
| License (data) | Open Government Licence v3 |
| License (code) | Apache-2.0 |
| Transport | stdio + Streamable HTTP |

## Tools

| Tool | Description |
|------|-------------|
| `about` | Server metadata and links |
| `list_sources` | Data sources with freshness info |
| `check_data_freshness` | Staleness status and refresh command |
| `search_pests` | FTS5 search across pest, disease, and weed data |
| `get_pest_details` | Full pest profile with symptoms and identification |
| `get_treatments` | Chemical, cultural, and biological treatment options |
| `get_ipm_guidance` | IPM thresholds, monitoring, and decision guides |
| `search_crop_threats` | All threats affecting a specific crop |
| `identify_from_symptoms` | Symptom-based differential diagnosis with confidence scoring |
| `get_approved_products` | UK CRD-approved pesticide products |

See [TOOLS.md](TOOLS.md) for full parameter documentation.

## Security Scanning

This repository runs 6 security checks on every push:

- **CodeQL** -- static analysis for JavaScript/TypeScript
- **Gitleaks** -- secret detection across full history
- **Dependency review** -- via Dependabot
- **Container scanning** -- via GHCR build pipeline

See [SECURITY.md](SECURITY.md) for reporting policy.

## Disclaimer

Pesticide data is for reference only. **Always check the current HSE CRD register before applying any product.** This tool is not professional pest management advice. See [DISCLAIMER.md](DISCLAIMER.md).

## Contributing

Issues and pull requests welcome. For security vulnerabilities, email security@ansvar.eu (do not open a public issue).

## License

Apache-2.0. Data sourced under Open Government Licence v3.
