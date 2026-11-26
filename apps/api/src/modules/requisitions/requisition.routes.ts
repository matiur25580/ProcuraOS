import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validateBody } from "../../middleware/validate.js";
import {
  approveRequisitionController, cancelRequisitionController, createRequisitionController, getRequisitionController,
  listApproversController, listBudgetsController, listRequisitionsController, rejectRequisitionController,
  submitRequisitionController, updateRequisitionController, upsertBudgetController,
} from "./requisition.controller.js";
import { budgetSchema, createRequisitionSchema, decisionSchema, rejectionSchema, updateRequisitionSchema } from "./requisition.schemas.js";

export const requisitionRouter = Router();
requisitionRouter.use(authenticate);
requisitionRouter.get("/approvers", requirePermission("procurement:write"), listApproversController);
requisitionRouter.get("/budgets", requirePermission("finance:read"), listBudgetsController);
requisitionRouter.put("/budgets/:costCenter", requirePermission("finance:approve"), validateBody(budgetSchema), upsertBudgetController);
requisitionRouter.get("/", requirePermission("procurement:read"), listRequisitionsController);
requisitionRouter.post("/", requirePermission("procurement:write"), validateBody(createRequisitionSchema), createRequisitionController);
requisitionRouter.get("/:requisitionId", requirePermission("procurement:read"), getRequisitionController);
requisitionRouter.patch("/:requisitionId", requirePermission("procurement:write"), validateBody(updateRequisitionSchema), updateRequisitionController);
requisitionRouter.post("/:requisitionId/submit", requirePermission("procurement:write"), submitRequisitionController);
requisitionRouter.post("/:requisitionId/approve", requirePermission("procurement:read"), validateBody(decisionSchema), approveRequisitionController);
requisitionRouter.post("/:requisitionId/reject", requirePermission("procurement:read"), validateBody(rejectionSchema), rejectRequisitionController);
requisitionRouter.post("/:requisitionId/cancel", requirePermission("procurement:write"), cancelRequisitionController);
