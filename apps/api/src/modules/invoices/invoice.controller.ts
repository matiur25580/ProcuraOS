import type { Request, Response } from "express";
import { approveSupplierInvoice, listSupplierInvoices, rejectSupplierInvoice, submitSupplierInvoice } from "./invoice.service.js";
function meta(req: Request) { return { ...(req.ip ? { ipAddress: req.ip } : {}), ...(req.get("user-agent") ? { userAgent: req.get("user-agent")! } : {}) }; }
export async function listInvoicesController(req: Request, res: Response) { res.status(200).json({ success: true, data: { invoices: await listSupplierInvoices(req.auth!.organizationId) } }); }
export async function submitInvoiceController(req: Request, res: Response) { const invoice = await submitSupplierInvoice(req.auth!.organizationId, req.auth!.userId, req.body, meta(req)); res.status(201).json({ success: true, data: { invoice } }); }
export async function approveInvoiceController(req: Request, res: Response) { const invoice = await approveSupplierInvoice(req.auth!.organizationId, req.auth!.userId, String(req.params.invoiceId ?? ""), meta(req)); res.status(200).json({ success: true, data: { invoice } }); }
export async function rejectInvoiceController(req: Request, res: Response) { const invoice = await rejectSupplierInvoice(req.auth!.organizationId, req.auth!.userId, String(req.params.invoiceId ?? ""), req.body.reason, meta(req)); res.status(200).json({ success: true, data: { invoice } }); }
