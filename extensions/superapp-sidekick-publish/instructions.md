# Super App AI — Sidekick publish action

Use this action when the merchant wants to publish a Super App AI module — take its
latest draft live.

You need the module's id (`value`), which you can get from a `search_modules`
result.

This opens the module's page inside Super App AI with the publish flow surfaced.
Publishing runs the app's plan-gating and pre-publish validation, and for storefront
(theme) modules the merchant chooses a theme. The merchant confirms the publish
themselves — this action does not publish automatically, so don't tell the merchant
the module is already live.
