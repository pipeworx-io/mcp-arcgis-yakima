# mcp-arcgis-yakima

City of Yakima GIS — Yakima, Washington open geospatial data (ArcGIS).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_datasets` | Search City of Yakima GIS open geospatial datasets (parcels, zoning, public works & city services) by keyword. Returns each dataset's name, summary, record_count, owner/org, and its Feature Service `url` — pass that url to query_layer / layer_info. |
| `query_layer` | Query an ArcGIS Feature Service / Map Service layer by its url (from search_datasets). SQL-like `where`, comma-separated `out_fields`, `order_by`, `limit`, `offset`. Returns attribute rows (and geometry). Use where="1=1" + out_fields="*" to sample. |
| `layer_info` | Get an ArcGIS Feature/Map Service layer's schema by url: fields (name + type), geometry type, total record count, and capabilities. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "arcgis-yakima": {
      "url": "https://gateway.pipeworx.io/arcgis-yakima/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Arcgis Yakima data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
