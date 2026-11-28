import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireStepUp } from "../../middleware/require-step-up.js";
import { validateBody } from "../../middleware/validate.js";
import {
  activateContractController, contractSummaryController, createContractController,
  getContractController, listContractsController, reviewContractController,
  submitContractController, terminateContractController, updateContractObligationController
} from "./contract.controller.js";
import {
  createContractSchema, obligationUpdateSchema, reviewContractSchema, terminateContractSchema
} from "./contract.schemas.js";

export const contractRouter = Router();
contractRouter.use(authenticate);
contractRouter.get("/summary", requirePermission("procurement:read"), contractSummaryController);
contractRouter.get("/", requirePermission("procurement:read"), listContractsController);
contractRouter.post("/", requirePermission("procurement:write"), validateBody(createContractSchema), createContractController);
contractRouter.get("/:contractId", requirePermission("procurement:read"), getContractController);
contractRouter.post("/:contractId/submit", requirePermission("procurement:write"), submitContractController);
contractRouter.post("/:contractId/review", requirePermission("finance:approve"), requireStepUp, validateBody(reviewContractSchema), reviewContractController);
contractRouter.post("/:contractId/activate", requirePermission("procurement:write"), requireStepUp, activateContractController);
contractRouter.post("/:contractId/terminate", requirePermission("finance:approve"), requireStepUp, validateBody(terminateContractSchema), terminateContractController);
contractRouter.patch("/:contractId/obligations/:obligationId", requirePermission("procurement:write"), validateBody(obligationUpdateSchema), updateContractObligationController);
