declare module "gadget-server" {
  export type GadgetAPI = Record<string, any>;
  export type GadgetModel = Record<string, any>;
  export type GadgetPermissions = Record<string, any>;
  export type GadgetSettings = Record<string, any>;
  export type RouteHandler = (...args: any[]) => any;
  export type ActionRun = (...args: any[]) => any;
  export type ActionOptions = Record<string, any>;

  export function assert<T>(
    value: T | null | undefined,
    message?: string
  ): T;
}

declare module "gadget-server/shopify" {
  export function preventCrossShopDataAccess(
    params: unknown,
    record: unknown
  ): Promise<void>;
}
