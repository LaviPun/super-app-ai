import type { GadgetPermissions } from "gadget-server";

/**
 * Access control for the vault Gadget app.
 * Grants not defined here default to false.
 */
export const permissions: GadgetPermissions = {
  type: "gadget/permissions/v1",
  roles: {
    "shopify-app-users": {
      storageKey: "Role-Shopify-App",
      models: {
        shopifyReturn: {
          read: {
            filter: "accessControl/filters/shopify/shopifyReturn.gelly",
          },
          actions: {
            create: true,
            update: true,
          },
        },
        shopifyReturnLineItem: {
          read: {
            filter:
              "accessControl/filters/shopify/shopifyReturnLineItem.gelly",
          },
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        shopifyShop: {
          read: {
            filter: "accessControl/filters/shopify/shopifyShop.gelly",
          },
          actions: {
            install: true,
            reinstall: true,
            uninstall: true,
            update: true,
            recordThemeProfile: true,
          },
        },
      },
    },
    unauthenticated: {
      storageKey: "unauthenticated",
      models: {
        shopifyReturn: {
          read: false,
          actions: {
            create: false,
            update: false,
          },
        },
        shopifyReturnLineItem: {
          read: false,
          actions: {
            create: false,
            delete: false,
            update: false,
          },
        },
      },
    },
    "shopify-storefront-customers": {
      storageKey: "Role-Shopify-Storefront-Customer",
      models: {
        shopifyReturn: {
          read: false,
          actions: {
            create: false,
            update: false,
          },
        },
        shopifyReturnLineItem: {
          read: false,
          actions: {
            create: false,
            delete: false,
            update: false,
          },
        },
      },
    },
    "signed-in": {
      storageKey: "signed-in",
      models: {
        shopifyReturn: {
          read: false,
          actions: {
            create: false,
            update: false,
          },
        },
        shopifyReturnLineItem: {
          read: false,
          actions: {
            create: false,
            delete: false,
            update: false,
          },
        },
      },
    },
  },
};
