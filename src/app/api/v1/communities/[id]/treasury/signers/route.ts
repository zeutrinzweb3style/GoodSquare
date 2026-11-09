import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  can,
  getCommunityBySlugOrId,
  getRole,
} from "@/lib/community/service";
import { addTreasurySignerSchema } from "@/lib/validation/schemas";
import {
  SpendingError,
  addTreasurySigner,
  getTreasuryByCommunity,
  listTreasurySigners,
} from "@/lib/treasury/service";
import { effectiveThreshold } from "@/lib/treasury/approvals";
import {
  badRequest,
  conflict,
  created,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/response";

/** The treasury's signers and its approval threshold. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/signers">,
) {
  const { id } = await ctx.params;
  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const session = await getSession();
    const role = await getRole(community.id, session?.sub);
    if (community.visibility === "private" && !role) {
      return notFound("Community not found");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return notFound("This community has no treasury yet");

    const signers = await listTreasurySigners(treasury.id);
    return ok({
      signers,
      approvalThreshold: treasury.approval_threshold,
      effectiveThreshold: effectiveThreshold(
        signers.length,
        treasury.approval_threshold,
      ),
    });
  } catch (error) {
    console.error("list treasury signers error", error);
    return serverError("Could not load treasury signers");
  }
}

/** Add a treasury signer. Requires treasury:manage. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/communities/[id]/treasury/signers">,
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = addTreasurySignerSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const community = await getCommunityBySlugOrId(id);
    if (!community) return notFound("Community not found");

    const role = await getRole(community.id, session.sub);
    if (!can(role, "treasury:manage")) {
      return forbidden("You cannot manage this community's treasury");
    }

    const treasury = await getTreasuryByCommunity(community.id);
    if (!treasury) return notFound("This community has no treasury yet");

    const signer = await addTreasurySigner({
      treasury,
      address: parsed.data.address,
      actor: session.sub,
    });
    return created(signer);
  } catch (error) {
    if (error instanceof SpendingError) {
      if (error.code === "conflict") return conflict(error.message);
      return badRequest(error.message);
    }
    console.error("add treasury signer error", error);
    return serverError("Could not add the signer");
  }
}
