# Gadget.dev option

This starter repo uses Remix + Prisma for clarity and portability.

If you choose Gadget.dev:
- Replace Prisma models with Gadget models: Shop, Module, ModuleVersion, Connector, AuditLog
- Use Gadget's built-in multi-tenant patterns to partition by `shopDomain`
- Move encryption utilities to Gadget server-side actions
- Keep the same Recipes architecture: validate RecipeSpec → compile → deploy

Suggested mapping:
- `Shop` ↔ Gadget model `Shop`
- `Module` ↔ Gadget model `Module` (hasMany ModuleVersion)
- `ModuleVersion` ↔ Gadget model `ModuleVersion`
- `Connector` ↔ Gadget model `Connector` (encrypted fields)
- `AuditLog` ↔ Gadget model `AuditLog` (append-only)

The rest of the code (compiler, plan gating, preview renderer) can remain nearly identical.
