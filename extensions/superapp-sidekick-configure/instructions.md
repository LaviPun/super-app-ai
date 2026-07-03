# Super App AI — Sidekick configure action

Use this action when the merchant wants to change an existing Super App AI module —
edit a popup's copy, a banner's threshold, a countdown's duration, an upsell's
offer, a Function's rules, and so on.

You need the module's id (`value`), which you can get from a `search_modules`
result. Optionally pass `instruction` describing the change to pre-fill in the
builder.

This opens the module's page inside Super App AI. The merchant makes the change and
saves it there themselves — this action does not modify the module automatically,
so don't describe it as if the change is already applied.
