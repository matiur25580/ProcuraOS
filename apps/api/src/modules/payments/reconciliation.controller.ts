import type { Request, Response } from "express";
import { getPaymentReport, importStatementLine, listStatementLines, matchStatementLine } from "./reconciliation.service.js";
function meta(req: Request) { return { ...(req.ip ? { ipAddress: req.ip } : {}), ...(req.get("user-agent") ? { userAgent: req.get("user-agent")! } : {}) }; }
export async function listReconciliationController(req: Request, res: Response) { res.status(200).json({ success: true, data: { statementLines: await listStatementLines(req.auth!.organizationId) } }); }
export async function importStatementLineController(req: Request, res: Response) { const line = await importStatementLine(req.auth!.organizationId, req.auth!.userId, req.body, meta(req)); res.status(201).json({ success: true, data: { statementLine: line } }); }
export async function matchStatementLineController(req: Request, res: Response) { const line = await matchStatementLine(req.auth!.organizationId, req.auth!.userId, String(req.params.lineId ?? ""), req.body.paymentId, meta(req)); res.status(200).json({ success: true, data: { statementLine: line } }); }
export async function paymentReportController(req: Request, res: Response) { res.status(200).json({ success: true, data: { report: await getPaymentReport(req.auth!.organizationId) } }); }
