import type { Request, Response } from "express";
import {
  activateContract, createContract, getContract, getContractSummary, listContracts,
  reviewContract, submitContract, terminateContract, updateObligation
} from "./contract.service.js";
import { listContractsSchema } from "./contract.schemas.js";

function meta(req: Request) {
  return { ...(req.ip ? { ipAddress: req.ip } : {}), ...(req.get("user-agent") ? { userAgent: req.get("user-agent")! } : {}) };
}
export async function listContractsController(req: Request, res: Response) {
  const query = listContractsSchema.parse(req.query);
  res.status(200).json({ success: true, data: await listContracts(req.auth!.organizationId, query) });
}
export async function contractSummaryController(req: Request, res: Response) {
  res.status(200).json({ success: true, data: await getContractSummary(req.auth!.organizationId) });
}
export async function createContractController(req: Request, res: Response) {
  const contract = await createContract(req.auth!.organizationId, req.auth!.userId, req.body, meta(req));
  res.status(201).json({ success: true, data: { contract } });
}
export async function getContractController(req: Request, res: Response) {
  const contract = await getContract(req.auth!.organizationId, String(req.params.contractId ?? ""));
  res.status(200).json({ success: true, data: { contract } });
}
export async function submitContractController(req: Request, res: Response) {
  const contract = await submitContract(req.auth!.organizationId, req.auth!.userId, String(req.params.contractId ?? ""), meta(req));
  res.status(200).json({ success: true, data: { contract } });
}
export async function reviewContractController(req: Request, res: Response) {
  const { decision, reason } = req.body as { decision: "approve" | "reject"; reason: string };
  const contract = await reviewContract(req.auth!.organizationId, req.auth!.userId, String(req.params.contractId ?? ""), decision, reason, meta(req));
  res.status(200).json({ success: true, data: { contract } });
}
export async function activateContractController(req: Request, res: Response) {
  const contract = await activateContract(req.auth!.organizationId, req.auth!.userId, String(req.params.contractId ?? ""), meta(req));
  res.status(200).json({ success: true, data: { contract } });
}
export async function terminateContractController(req: Request, res: Response) {
  const { reason } = req.body as { reason: string };
  const contract = await terminateContract(req.auth!.organizationId, req.auth!.userId, String(req.params.contractId ?? ""), reason, meta(req));
  res.status(200).json({ success: true, data: { contract } });
}
export async function updateContractObligationController(req: Request, res: Response) {
  const { status, resolutionNote } = req.body as { status: "completed" | "waived"; resolutionNote: string };
  const contract = await updateObligation(req.auth!.organizationId, req.auth!.userId, String(req.params.contractId ?? ""), String(req.params.obligationId ?? ""), status, resolutionNote, meta(req));
  res.status(200).json({ success: true, data: { contract } });
}
