-- Assistant action cards: persist derived, validated confirm-to-run proposals on
-- the assistant message row so they survive revalidation / reload. Nullable TEXT
-- holding a JSON array of ActionProposal objects; only ever set on assistant rows.
ALTER TABLE "InternalAiMessage" ADD COLUMN "actionsJson" TEXT;
