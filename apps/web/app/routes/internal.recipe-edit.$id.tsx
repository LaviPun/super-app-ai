import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  Field,
  Select,
  Banner,
  PageHead,
  STORES,
  TEMPLATES,
  MODULES,
  moduleSpec,
} from '~/components/admin/page-kit';

export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  await requireInternalAdmin(request);
  const m = MODULES.find((x) => x.id === params.id) ?? null;
  return json({ module: m ? { id: m.id, name: m.name, store: m.store, storeId: m.storeId, version: m.version } : null, spec: m ? moduleSpec(m) : null });
}

export default function AdminRecipeEditDetail() {
  const { module: m, spec } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [valid, setValid] = useState<boolean | null>(null);

  const json = spec || '{}';
  const sourceOptions = ['All recipes (templates)'].concat(STORES.map((s) => s.name));
  const moduleOptions = (m ? [m.name] : []).concat(TEMPLATES.map((t) => t.name));

  return (
    <div className="page">
      <PageHead
        back={m ? { href: '/internal/modules/' + m.id, label: m.name } : { href: '/internal/recipe-edit', label: 'Recipe edit' }}
        title="Recipe edit"
        badge={<Badge tone="warning">Staff only · hidden from merchant</Badge>}
        sub="The internal RecipeSpec generated for this module. Merchants never see this JSON — only the rendered module. Validated with the Zod schema before save."
        actions={
          <>
            <Btn icon="check" onClick={() => setValid(true)}>
              Validate
            </Btn>
            <Btn variant="primary" icon="download" onClick={() => ctx.toast('Saved new version')}>
              Save version
            </Btn>
          </>
        }
      />
      {m && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info" title="Connected recipe">
            <span>
              This recipe is bound to <b>{m.name}</b> on{' '}
              <a href={'/internal/stores/' + m.storeId} className="cell-link">
                {m.store}
              </a>
              . It is the source of truth for how the module is generated — kept in the admin and invisible to the merchant.
            </span>
          </Banner>
        </div>
      )}
      <div className="filter-bar" style={{ border: 0, padding: 0, marginBottom: 16 }}>
        <div style={{ minWidth: 240 }}>
          <Field label="Source">
            <Select options={sourceOptions} value={m ? m.store : 'All recipes (templates)'} onChange={() => {}} />
          </Field>
        </div>
        <div style={{ minWidth: 240 }}>
          <Field label="Module / template">
            <Select options={moduleOptions} value={m ? m.name : moduleOptions[0]} onChange={() => {}} />
          </Field>
        </div>
      </div>
      {valid != null && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="success" title="Valid RecipeSpec" onDismiss={() => setValid(null)}>
            Schema validation passed. Safe to save as a new version or template override.
          </Banner>
        </div>
      )}
      <Card>
        <div className="card-head">
          <div className="t-h3">RecipeSpec JSON</div>
          <span className="t-xs t-muted t-mono">{m ? m.id + '.recipe.v' + m.version + '.json' : 'recipe_spec.v3.json'}</span>
        </div>
        <pre className="code-block" style={{ margin: 0, borderRadius: '0 0 12px 12px', maxHeight: 480 }} contentEditable suppressContentEditableWarning>
          {json}
        </pre>
      </Card>
    </div>
  );
}
