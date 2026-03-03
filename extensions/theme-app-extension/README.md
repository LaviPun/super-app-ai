# Theme App Extension (generic)

This extension should ship a small set of blocks/embeds that render based on shop metafields written by the app.
This repo's `theme.banner` recipe currently deploys theme assets directly for preview/publish, but for long-term
safety you should also provide an app block that reads the same config.

Use Shopify CLI to create:
- blocks/banner.liquid reading metafield `shop.metafields.superapp.theme_banner`
