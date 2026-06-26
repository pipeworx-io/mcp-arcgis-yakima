interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * City of Yakima GIS — Yakima, Washington open geospatial data (ArcGIS).
 *
 * City of Yakima GIS (ArcGIS org drBwGNA3YMS2QPJd): parcels, zoning, public works & city services. search_datasets finds layers (each
 * with a Feature Service url) -> query_layer runs SQL-like queries -> layer_info
 * returns the schema. Keyless.
 */


const HUB = 'https://hub.arcgis.com/api/v3/datasets';
const UA = 'pipeworx-mcp-arcgis-yakima/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_datasets',
    description: 'Search City of Yakima GIS open geospatial datasets (parcels, zoning, public works & city services) by keyword. Returns each dataset\'s name, summary, record_count, owner/org, and its Feature Service `url` — pass that url to query_layer / layer_info.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword(s), e.g. "parcels", "crime", "flood zones".' },
        org_id: { type: 'string', description: 'Optional ArcGIS orgId to override the default (City of Yakima GIS).' },
        limit: { type: 'number', description: 'Max datasets (1-50, default 20).' },
      },
    },
  },
  {
    name: 'query_layer',
    description: 'Query an ArcGIS Feature Service / Map Service layer by its url (from search_datasets). SQL-like `where`, comma-separated `out_fields`, `order_by`, `limit`, `offset`. Returns attribute rows (and geometry). Use where="1=1" + out_fields="*" to sample.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Feature/Map Service layer url ending in /FeatureServer/<n> or /MapServer/<n>.' },
        where: { type: 'string', description: 'SQL where clause, e.g. "STATE = \'CA\' AND YEAR >= 2020". Default "1=1".' },
        out_fields: { type: 'string', description: 'Comma-separated field names, or "*" for all (default).' },
        order_by: { type: 'string', description: 'e.g. "POP DESC".' },
        limit: { type: 'number', description: 'Max features (1-2000, default 50).' },
        offset: { type: 'number', description: 'Pagination offset.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'layer_info',
    description: 'Get an ArcGIS Feature/Map Service layer\'s schema by url: fields (name + type), geometry type, total record count, and capabilities.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Feature/Map Service layer url, e.g. ".../FeatureServer/0".' } },
      required: ['url'],
    },
  },
];

const ORG = 'drBwGNA3YMS2QPJd';

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_datasets': {
      const q = typeof args.query === 'string' ? args.query.trim() : '';
      const org = (typeof args.org_id === 'string' && args.org_id.trim()) || ORG;
      const size = clamp(numArg(args.limit, 20), 1, 50);
      const p = new URLSearchParams({ 'page[size]': String(size) });
      if (q) p.set('q', q);
      if (org) p.set('filter[orgId]', org);
      const res = await fetch(`${HUB}?${p}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (!res.ok) throw new Error(`ArcGIS Hub: ${res.status}`);
      const body = (await res.json()) as { data?: Array<{ id?: string; attributes?: Record<string, unknown> }>; meta?: { stats?: { totalCount?: number } } };
      return {
        total: body.meta?.stats?.totalCount ?? null,
        count: body.data?.length ?? 0,
        datasets: (body.data ?? []).map((d) => {
          const a = d.attributes ?? {};
          return {
            id: d.id,
            name: a.name,
            summary: typeof a.snippet === 'string' ? a.snippet : (typeof a.description === 'string' ? a.description.slice(0, 200) : undefined),
            org: a.source,
            org_id: a.orgId,
            record_count: a.recordCount,
            type: a.type,
            url: a.url,
          };
        }),
      };
    }
    case 'query_layer': {
      const url = layerUrl(args.url);
      const p = new URLSearchParams({
        where: typeof args.where === 'string' && args.where.trim() ? String(args.where) : '1=1',
        outFields: typeof args.out_fields === 'string' && args.out_fields.trim() ? String(args.out_fields) : '*',
        resultRecordCount: String(clamp(numArg(args.limit, 50), 1, 2000)),
        f: 'json',
      });
      if (args.order_by) p.set('orderByFields', String(args.order_by));
      if (args.offset != null) p.set('resultOffset', String(Math.max(0, numArg(args.offset, 0))));
      const res = await fetch(`${url}/query?${p}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (!res.ok) throw new Error(`ArcGIS query: ${res.status}`);
      return res.json();
    }
    case 'layer_info': {
      const url = layerUrl(args.url);
      const res = await fetch(`${url}?f=json`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (!res.ok) throw new Error(`ArcGIS layer_info: ${res.status}`);
      return res.json();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Restrict to public https ArcGIS Feature/Map Service layer URLs (a light SSRF
// guard — only lets the tool hit real Esri layer-query endpoints, not arbitrary
// hosts/ports/IPs).
function layerUrl(v: unknown): string {
  const url = String(v ?? '').trim();
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('Pass a valid Feature/Map Service layer url (https).'); }
  if (u.protocol !== 'https:') throw new Error('url must be https.');
  if (/^(\d+\.\d+\.\d+\.\d+|localhost|\[)/.test(u.hostname) || u.port) throw new Error('url must be a public ArcGIS host.');
  if (!/\/(FeatureServer|MapServer)\/\d+\/?$/i.test(u.pathname)) throw new Error('url must end in /FeatureServer/<n> or /MapServer/<n>.');
  return url.replace(/\/$/, '');
}

function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
