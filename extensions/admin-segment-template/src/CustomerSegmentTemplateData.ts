/**
 * SuperApp Customer Segment Templates — runnable data extension.
 *
 * Target: admin.customers.segmentation-templates.data. Returns an array of segment
 * templates into the segment editor's template gallery. The templates come from the
 * published admin.segmentTemplate module config: we read superapp.admin/
 * segment_template_refs (list.metaobject_reference, API 2026-04+) via the admin GraphQL
 * endpoint and return each `{ title, description, query }` verbatim, adding the
 * `queryToInsert` + `createdOn` props the Customer Segment Template API expects.
 *
 * No UI — this is a headless data target. On any failure it returns `[]` so the segment
 * editor simply shows no SuperApp templates rather than erroring.
 */

type SegmentTemplate = {
  title: string;
  description: string;
  query: string;
};

type SegmentTemplateResult = {
  title: string;
  description: string;
  query: string;
  queryToInsert: string;
  createdOn: string;
};

const METAFIELD_QUERY = `{
  shop {
    segmentTemplateRefs: metafield(namespace: "superapp.admin", key: "segment_template_refs") {
      references(first: 64) {
        nodes {
          ... on Metaobject {
            configJson: field(key: "config_json") { value }
          }
        }
      }
    }
  }
}`;

type MetaobjectNode = { configJson?: { value: string } | null };
type QueryData = {
  shop?: {
    segmentTemplateRefs?: { references?: { nodes: MetaobjectNode[] } } | null;
  };
};

function parseTemplates(raw: string | null | undefined): SegmentTemplate[] {
  if (!raw) return [];
  try {
    const cfg = JSON.parse(raw) as { templates?: unknown };
    if (!Array.isArray(cfg.templates)) return [];
    return cfg.templates
      .filter((t): t is SegmentTemplate => !!t && typeof (t as SegmentTemplate).query === 'string')
      .map((t) => ({
        title: String(t.title ?? 'Segment'),
        description: String(t.description ?? ''),
        query: String(t.query),
      }));
  } catch {
    return [];
  }
}

const CREATED_ON = new Date('2026-01-01').toISOString();

export default async function extension(): Promise<SegmentTemplateResult[]> {
  try {
    const res = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: METAFIELD_QUERY }),
    });
    const { data } = (await res.json()) as { data?: QueryData };
    const nodes = data?.shop?.segmentTemplateRefs?.references?.nodes ?? [];
    const templates = nodes.flatMap((n) => parseTemplates(n.configJson?.value));
    return templates.map((t) => ({
      title: t.title,
      description: t.description,
      query: t.query,
      // No cursor placeholder is inserted for app-provided templates.
      queryToInsert: t.query,
      createdOn: CREATED_ON,
    }));
  } catch {
    return [];
  }
}
