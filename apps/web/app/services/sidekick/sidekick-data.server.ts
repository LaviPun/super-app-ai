import { getPrisma } from '~/db.server';
import { getModulePerformanceSummary } from '~/services/analytics/module-performance.server';
import {
  SidekickDataToolInput,
  type SidekickDataToolName,
  type SidekickResourceLink,
} from './sidekick-tools.contract';

/**
 * Backend handlers for the Sidekick DATA extension (M12).
 *
 * The extension bundle (running in Shopify's sandbox) POSTs a validated tool
 * call here; these functions read our own DB (shop-scoped by the resolved
 * `shopId`) and return MCP Resource Links. Read-only — no mutations.
 *
 * Resource-link `mimeType` values match the action-link intent `type`s so
 * Sidekick can offer the matching action (configure / publish) on a result.
 */

/** mimeType shared with the actions extension's configure/publish intents. */
export const MODULE_MIME_TYPE = 'application/superapp-module-configure';

const MAX_RESULTS = 25;

export type SidekickToolResult = { results: SidekickResourceLink[] };

/** `search_modules` — list/search the shop's modules as resource links. */
export async function sidekickSearchModules(
  shopId: string,
  rawInput: unknown,
): Promise<SidekickToolResult> {
  const input = SidekickDataToolInput.search_modules.parse(rawInput ?? {});
  const prisma = getPrisma();

  const modules = await prisma.module.findMany({
    where: {
      shopId,
      ...(input.status && input.status !== 'ANY' ? { status: input.status } : {}),
      ...(input.query
        ? { name: { contains: input.query } }
        : {}),
    },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
    take: MAX_RESULTS,
  });

  const results: SidekickResourceLink[] = modules.map((m) => ({
    type: 'resource_link',
    // Bare tail (module id) is what Sidekick substitutes into a mapTo:"param"
    // URL placeholder; the gid:// prefix lets it strip the head.
    uri: `gid://application/superapp-module/${m.id}`,
    name: m.name,
    mimeType: MODULE_MIME_TYPE,
    _meta: {
      status: m.status,
      moduleType: m.type,
      category: m.category,
      latestVersion: m.versions[0]?.version ?? null,
      updatedAt: m.updatedAt.toISOString(),
    },
  }));

  return { results };
}

/**
 * `get_module_performance` — one resource link carrying the aggregated
 * performance summary in `_meta`. Reports `available:false` honestly when no
 * metrics have been recorded rather than emitting zeros as measured data.
 */
export async function sidekickModulePerformance(
  shopId: string,
  rawInput: unknown,
): Promise<SidekickToolResult> {
  const input = SidekickDataToolInput.get_module_performance.parse(rawInput ?? {});
  const prisma = getPrisma();

  const mod = await prisma.module.findFirst({
    where: { id: input.moduleId, shopId },
    select: { id: true, name: true, type: true, status: true },
  });
  if (!mod) return { results: [] };

  const summary = await getModulePerformanceSummary(shopId, input.moduleId, input.days);

  return {
    results: [
      {
        type: 'resource_link',
        uri: `gid://application/superapp-module/${mod.id}`,
        name: `${mod.name} — performance (${input.days}d)`,
        mimeType: MODULE_MIME_TYPE,
        _meta: {
          status: mod.status,
          moduleType: mod.type,
          ...summary,
        },
      },
    ],
  };
}

/** Route a validated data-tool call to its handler. */
export async function handleSidekickDataTool(
  shopId: string,
  tool: SidekickDataToolName,
  input: unknown,
): Promise<SidekickToolResult> {
  switch (tool) {
    case 'search_modules':
      return sidekickSearchModules(shopId, input);
    case 'get_module_performance':
      return sidekickModulePerformance(shopId, input);
  }
}
