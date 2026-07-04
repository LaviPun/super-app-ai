import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { PrintAction } from './PrintAction';

const TARGET = 'admin.product-index.selection-print-action.render';

export default async function extension() {
  render(<PrintAction target={TARGET} />, document.body);
}
