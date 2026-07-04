import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useAdminBlocks } from '../hooks/useAdminBlocks';
import { AdminBlockRenderer } from '../components/AdminBlockRenderer';

const TARGET = 'admin.customer-details.block.render';

function CustomerDetailsBlock() {
  const state = useAdminBlocks(TARGET);

  if (state.status === 'loading') return <s-text color="subdued">Loading...</s-text>;
  if (state.status === 'hidden') return (
    <s-admin-block heading="SuperApp">
      <s-text color="subdued">No admin blocks configured for customers. Publish an admin.block module from the SuperApp to display content here.</s-text>
    </s-admin-block>
  );
  if (state.status !== 'ready') return null;

  return (
    <s-admin-block heading="SuperApp">
      <s-stack gap="base">
        {state.blocks.map((block, i) => (
          <AdminBlockRenderer key={i} block={block} />
        ))}
      </s-stack>
    </s-admin-block>
  );
}

export default async function extension() {
  render(<CustomerDetailsBlock />, document.body);
}
