import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import {
  acceptInvitationController, createInvitationController, listAuditEventsController, listInvitationsController,
  listMembersController, removeMemberController, revokeInvitationController, updateMemberController,
  updateOrganizationController,
} from "./organization.controller.js";
import {
  acceptInvitationSchema, createInvitationSchema, updateMemberSchema, updateOrganizationSchema,
} from "./organization.schemas.js";

export const organizationRouter = Router();
organizationRouter.use(authenticate);

organizationRouter.patch("/", requirePermission("organization:update"), validateBody(updateOrganizationSchema), updateOrganizationController);
organizationRouter.get("/members", requirePermission("members:read"), listMembersController);
organizationRouter.patch("/members/:membershipId", requirePermission("members:manage"), validateBody(updateMemberSchema), updateMemberController);
organizationRouter.delete("/members/:membershipId", requirePermission("members:manage"), removeMemberController);

organizationRouter.get("/invitations", requirePermission("members:read"), listInvitationsController);
organizationRouter.post("/invitations", requirePermission("members:manage"), validateBody(createInvitationSchema), createInvitationController);
organizationRouter.delete("/invitations/:invitationId", requirePermission("members:manage"), revokeInvitationController);
organizationRouter.post("/invitations/accept", validateBody(acceptInvitationSchema), acceptInvitationController);

organizationRouter.get("/audit-events", requirePermission("audit:read"), listAuditEventsController);
