import {
  createComponent,
  createIntegration,
  FetchEventCallback,
  RuntimeContext,
} from "@gitbook/runtime";

type IntegrationContext = RuntimeContext;
type BlockProps = {};
type BlockState = { message: string };
type BlockAction = { action: "refresh" };

const handleFetchEvent: FetchEventCallback<IntegrationContext> = async (_request, context) => {
  const user = context.api.user.getAuthenticatedUser();
  return new Response(JSON.stringify(user), {
    headers: { "content-type": "application/json" },
  });
};

const docsBlock = createComponent<BlockProps, BlockState, BlockAction, IntegrationContext>({
  componentId: "ai-shopify-superapp-docs",
  initialState: () => ({ message: "SuperApp docs integration is active." }),
  action: async (element, action) => {
    if (action.action === "refresh") {
      return {
        state: {
          ...element.state,
          message: "Refreshed.",
        },
      };
    }
    return {};
  },
  render: async (element) => {
    return (
      <block>
        <markdown>{element.state.message}</markdown>
        <button label="Refresh" onPress={{ action: "refresh" }} />
      </block>
    );
  },
});

export default createIntegration({
  fetch: handleFetchEvent,
  components: [docsBlock],
  events: {},
});
