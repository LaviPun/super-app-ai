import { z } from 'zod';

export const IntentNodeSchema = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  intentKey: z.string().min(1),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  recipeSpec: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type IntentNode = z.infer<typeof IntentNodeSchema>;

export const IntentEdgeSchema = z.object({
  id: z.string().min(1),
  fromIntentId: z.string().min(1),
  toIntentId: z.string().min(1),
  relation: z.enum(['depends_on', 'extends', 'conflicts_with']),
});

export type IntentEdge = z.infer<typeof IntentEdgeSchema>;

export interface IntentGraphStore {
  saveNode(node: IntentNode): Promise<void>;
  getNode(id: string): Promise<IntentNode | undefined>;
  listNodes(shopId: string): Promise<IntentNode[]>;
  saveEdge(edge: IntentEdge): Promise<void>;
  listEdges(intentId: string): Promise<IntentEdge[]>;
}

export class InMemoryIntentGraphStore implements IntentGraphStore {
  private readonly nodes = new Map<string, IntentNode>();
  private readonly edges = new Map<string, IntentEdge>();

  async saveNode(node: IntentNode): Promise<void> {
    this.nodes.set(node.id, IntentNodeSchema.parse(node));
  }

  async getNode(id: string): Promise<IntentNode | undefined> {
    return this.nodes.get(id);
  }

  async listNodes(shopId: string): Promise<IntentNode[]> {
    return [...this.nodes.values()].filter((node) => node.shopId === shopId);
  }

  async saveEdge(edge: IntentEdge): Promise<void> {
    this.edges.set(edge.id, IntentEdgeSchema.parse(edge));
  }

  async listEdges(intentId: string): Promise<IntentEdge[]> {
    return [...this.edges.values()].filter(
      (edge) => edge.fromIntentId === intentId || edge.toIntentId === intentId,
    );
  }
}
