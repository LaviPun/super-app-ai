import { getLlmClient } from '~/services/ai/llm.server';
import { getPrisma } from '~/db.server';

export type MappingSuggestion = {
  payloadMapping: Record<string, string>;
  notes: string[];
};

/**
 * AI-assisted mapping service.
 * Takes a stored sample response from a connector and asks the LLM to propose
 * dot-notation field mappings relevant to common Shopify webhook fields.
 */
export class MappingService {
  async suggestFromConnector(shopId: string, connectorId: string): Promise<MappingSuggestion> {
    const prisma = getPrisma();
    const connector = await prisma.connector.findFirst({
      where: { id: connectorId, shopId },
    });

    if (!connector?.sampleResponseJson) {
      return {
        payloadMapping: {},
        notes: ['No sample response stored. Run a connector test first to capture a sample response, then try again.'],
      };
    }

    let sampleSnippet: string;
    try {
      const parsed = JSON.parse(connector.sampleResponseJson);
      sampleSnippet = JSON.stringify(parsed, null, 2).slice(0, 3000);
    } catch {
      sampleSnippet = connector.sampleResponseJson.slice(0, 3000);
    }

    const prompt = `You are an integration mapping assistant for Shopify apps.

Given this API response sample from an external connector:
\`\`\`json
${sampleSnippet}
\`\`\`

Suggest a JSON payload mapping where:
- Keys are dot-notation paths in the SOURCE API response (e.g. "order.reference_number")
- Values are corresponding Shopify webhook field paths (e.g. "order_number")

Focus on common mappings: order IDs, customer info, product SKUs, prices, addresses.
Return ONLY valid JSON of the form: {"mappings": {"source.path": "shopify.field", ...}, "notes": ["..."]}.
If the sample has no recognizable fields, return {"mappings": {}, "notes": ["Unable to detect mappable fields."]}.`;

    const { client } = await getLlmClient(shopId);
    try {
      const { rawJson } = await client.generateRecipe(prompt);
      const parsed = JSON.parse(rawJson);
      const suggestion: MappingSuggestion = {
        payloadMapping: parsed.mappings ?? {},
        notes: Array.isArray(parsed.notes) ? parsed.notes : ['AI-suggested mapping — review before saving.'],
      };

      // Persist the suggestion so merchants can iterate without re-running AI.
      await prisma.connector.update({
        where: { id: connectorId },
        data: { mappingJson: JSON.stringify(suggestion.payloadMapping) },
      });

      return suggestion;
    } catch {
      return {
        payloadMapping: {},
        notes: ['AI mapping suggestion failed. You can map fields manually.'],
      };
    }
  }

  /** Save an accepted (manually edited) mapping back to the connector. */
  async saveMapping(shopId: string, connectorId: string, mapping: Record<string, string>): Promise<void> {
    const prisma = getPrisma();
    await prisma.connector.updateMany({
      where: { id: connectorId, shopId },
      data: { mappingJson: JSON.stringify(mapping) },
    });
  }

  /** Load the currently saved mapping for a connector. */
  async loadMapping(shopId: string, connectorId: string): Promise<Record<string, string>> {
    const prisma = getPrisma();
    const connector = await prisma.connector.findFirst({ where: { id: connectorId, shopId } });
    if (!connector?.mappingJson) return {};
    try {
      return JSON.parse(connector.mappingJson) as Record<string, string>;
    } catch {
      return {};
    }
  }

  /** Manual fallback — returns empty mapping with instructions. */
  suggest(): MappingSuggestion {
    return { payloadMapping: {}, notes: ['Use suggestFromConnector() with a stored sample response for AI-assisted mapping.'] };
  }
}
