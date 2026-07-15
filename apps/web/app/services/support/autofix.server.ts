import { RecipeSpecSchema } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { modifyRecipeSpecOptions } from '~/services/ai/llm.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { recordTicketEvent } from '~/services/support/ticket-events.server';

/**
 * Phase G — AI auto-fix pipeline (human-approved).
 *
 * These helpers wrap the existing AI modify chain so an internal admin can, from
 * a support ticket, (1) ask the AI to propose corrected module recipes, then
 * (2) approve/apply or reject each proposal. Applying never publishes — it only
 * creates a DRAFT ModuleVersion; the merchant still publishes manually.
 *
 * Every function is intentionally never-throw: failures surface as
 * `{ ok: false, error }` so the calling route can render a toast instead of a 500.
 */

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Generate corrected-module proposals for a ticket and persist each as a
 * SupportFixProposal. Requires the ticket to be linked to a module.
 */
export async function proposeTicketFix(
  ticketId: string,
): Promise<{ ok: true; proposals: number } | { ok: false; error: string }> {
  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, shopId: true, moduleId: true, subject: true, description: true, aiSummary: true },
    });
    if (!ticket) return { ok: false, error: 'Ticket not found' };
    if (!ticket.moduleId) return { ok: false, error: 'Ticket has no linked module to fix' };

    // Load the module's current spec the same way api.ai.modify-module.tsx does:
    // prefer the DRAFT, then the active version, then the newest version.
    const moduleService = new ModuleService();
    const mod = await moduleService.getModuleByShopId(ticket.shopId, ticket.moduleId);
    if (!mod) return { ok: false, error: 'Module not found for this ticket' };
    const draft = mod.versions.find((v) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
    if (!draft) return { ok: false, error: 'No module version found to modify' };

    const currentSpec = new RecipeService().parse(draft.specJson);

    const instruction =
      'A merchant reported this issue with the module. Produce a corrected module that resolves it while keeping the module type unchanged.\n\n' +
      `Subject: ${ticket.subject}\n\n` +
      `Description: ${ticket.description}` +
      (ticket.aiSummary ? `\n\nTriage summary: ${ticket.aiSummary}` : '');

    const options = await modifyRecipeSpecOptions(currentSpec, instruction, {
      shopId: ticket.shopId,
      maxAttempts: 2,
    });

    const proposalIds: string[] = [];
    for (const opt of options) {
      const created = await prisma.supportFixProposal.create({
        data: {
          ticketId: ticket.id,
          moduleId: ticket.moduleId,
          status: 'PROPOSED',
          explanation: opt.explanation,
          recipeJson: JSON.stringify(opt.recipe),
          validationJson: opt.qaSummary ? JSON.stringify(opt.qaSummary) : null,
        },
      });
      proposalIds.push(created.id);
    }

    await recordTicketEvent(ticketId, 'FIX_PROPOSED', 'AI', { proposalIds, count: proposalIds.length });
    return { ok: true, proposals: proposalIds.length };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/**
 * Approve a proposal: parse its recipe, create a DRAFT ModuleVersion, mark the
 * proposal APPLIED, and post a merchant-visible system message. Publish stays
 * manual — this only prepares a draft.
 */
export async function applyFixProposal(
  proposalId: string,
): Promise<{ ok: true; versionId: string } | { ok: false; error: string }> {
  try {
    const prisma = getPrisma();
    const proposal = await prisma.supportFixProposal.findUnique({
      where: { id: proposalId },
      include: { ticket: { select: { id: true, shopId: true, shop: { select: { shopDomain: true } } } } },
    });
    if (!proposal) return { ok: false, error: 'Proposal not found' };
    if (proposal.status !== 'PROPOSED') {
      return { ok: false, error: `Proposal is ${proposal.status}, not PROPOSED` };
    }
    const shopDomain = proposal.ticket?.shop?.shopDomain;
    if (!shopDomain) return { ok: false, error: 'Shop not found for this proposal' };

    let spec;
    try {
      spec = RecipeSpecSchema.parse(JSON.parse(proposal.recipeJson));
    } catch (err) {
      return { ok: false, error: `Invalid RecipeSpec: ${errMsg(err)}` };
    }

    const newVersion = await new ModuleService().createNewVersion(shopDomain, proposal.moduleId, spec);

    await prisma.supportFixProposal.update({
      where: { id: proposalId },
      data: { status: 'APPLIED', appliedVersionId: newVersion.id },
    });

    await recordTicketEvent(proposal.ticketId, 'FIX_APPLIED', 'INTERNAL_ADMIN', {
      proposalId,
      versionId: newVersion.id,
    });

    await prisma.supportTicketMessage.create({
      data: {
        ticketId: proposal.ticketId,
        role: 'system',
        internal: false,
        body: 'A fix has been prepared and applied to your module as a new draft version. Review and publish it from the module page.',
      },
    });

    return { ok: true, versionId: newVersion.id };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Reject a proposal: mark REJECTED and record the flow event. */
export async function rejectFixProposal(
  proposalId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const prisma = getPrisma();
    const proposal = await prisma.supportFixProposal.findUnique({
      where: { id: proposalId },
      select: { id: true, ticketId: true, status: true },
    });
    if (!proposal) return { ok: false, error: 'Proposal not found' };
    if (proposal.status !== 'PROPOSED') {
      return { ok: false, error: `Proposal is ${proposal.status}, not PROPOSED` };
    }

    await prisma.supportFixProposal.update({ where: { id: proposalId }, data: { status: 'REJECTED' } });
    await recordTicketEvent(proposal.ticketId, 'FIX_REJECTED', 'INTERNAL_ADMIN', { proposalId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
