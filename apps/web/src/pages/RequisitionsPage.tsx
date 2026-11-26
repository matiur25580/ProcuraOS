import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Check, ChevronRight, ClipboardList, Plus, RefreshCw, Send, ShieldCheck, Wallet, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";
import "./requisitions.css";

type Approver = { id: string; name: string; email: string; role: string };
type Approval = { approverId: string; level: number; status: string; comment: string; actedAt?: string; approver?: { id: string; name: string; email: string } | null };
type Requisition = {
  id: string; title: string; department: string; costCenter: string; justification: string; neededBy: string;
  currency: string; totalMinor: number; status: string; requesterId: string; requester?: { name: string; email: string } | null;
  currentApproverId?: string | null; budgetStatus: string; approvals: Approval[]; createdAt: string;
  items: { description: string; quantity: number; unit: string; unitPriceMinor: number }[];
};
type Budget = { costCenter: string; fiscalYear: number; currency: string; limitMinor: number; committedMinor?: number };
const money = (minor: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function RequisitionsPage() {
  const { user, role } = useAuth();
  const canCreate = ["owner", "admin", "procurement_manager", "procurement_officer"].includes(role);
  const canManageBudget = ["owner", "admin", "finance_manager"].includes(role);
  const [records, setRecords] = useState<Requisition[]>([]);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Operations");
  const [costCenter, setCostCenter] = useState("");
  const [justification, setJustification] = useState("");
  const [neededBy, setNeededBy] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("INR");
  const [items, setItems] = useState([{ description: "", quantity: 1, unit: "each", unitPrice: "0.00" }]);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [budgetCenter, setBudgetCenter] = useState("");
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());
  const [budgetCurrency, setBudgetCurrency] = useState("INR");
  const [budgetLimit, setBudgetLimit] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [requestData, budgetData] = await Promise.all([
        apiRequest<{ requisitions: Requisition[] }>("/requisitions"),
        apiRequest<{ budgets: Budget[] }>("/requisitions/budgets").catch(() => ({ budgets: [] })),
      ]);
      setRecords(requestData.requisitions); setBudgets(budgetData.budgets);
      if (canCreate) {
        const people = await apiRequest<{ approvers: Approver[] }>("/requisitions/approvers");
        setApprovers(people.approvers);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load requisitions"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const total = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0), [items]);

  async function createDraft(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/requisitions", { method: "POST", body: JSON.stringify({
        title, department, costCenter, justification, neededBy: new Date(neededBy + "T00:00:00.000Z").toISOString(), currency,
        items: items.map((item) => ({ description: item.description, quantity: Number(item.quantity), unit: item.unit, unitPriceMinor: Math.round(Number(item.unitPrice) * 100) })),
        approverIds: selectedApprovers,
      }) });
      setNotice("Draft requisition created. Review it below and submit when ready.");
      setShowForm(false); setTitle(""); setCostCenter(""); setJustification("");
      setItems([{ description: "", quantity: 1, unit: "each", unitPrice: "0.00" }]); setSelectedApprovers([]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create requisition"); }
    finally { setSaving(false); }
  }

  async function action(id: string, type: "submit" | "approve" | "reject" | "cancel") {
    let comment = "";
    if (type === "reject") { comment = window.prompt("Enter a clear rejection reason (required):") ?? ""; if (comment.trim().length < 5) return; }
    else if (type === "approve") comment = window.prompt("Optional approval comment:") ?? "";
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/requisitions/" + id + "/" + type, {
        method: "POST",
        ...(type === "reject" ? { body: JSON.stringify({ reason: comment }) } : type === "approve" ? { body: JSON.stringify({ comment }) } : {}),
      });
      setNotice(type === "submit" ? "Requisition submitted into the approval chain." : type === "approve" ? "Approval recorded." : type === "reject" ? "Requisition rejected with your reason." : "Draft cancelled.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Action could not be completed"); }
    finally { setSaving(false); }
  }

  async function saveBudget(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/requisitions/budgets/" + encodeURIComponent(budgetCenter), { method: "PUT", body: JSON.stringify({
        fiscalYear: Number(budgetYear), currency: budgetCurrency, limitMinor: Math.round(Number(budgetLimit) * 100),
      }) });
      setNotice("Cost-centre budget saved."); setBudgetLimit(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save budget"); }
    finally { setSaving(false); }
  }

  return <main className="req-page">
    <header className="req-topbar">
      <Link to="/" className="req-back"><ArrowLeft size={16} /> Workspace</Link>
      <div className="req-brand"><span className="brand-mark"><ClipboardList size={18} /></span> ProcuraOS <span>PROCUREMENT</span></div>
      <div className="req-user">{user.name} · {role.replaceAll("_", " ")}</div>
    </header>
    <div className="req-content">
      <div className="req-heading">
        <div><span className="req-eyebrow">SOURCE-TO-PAY · PHASE 03</span><h1>Purchase requisitions</h1><p>Create requests, route approvals and keep budget decisions auditable.</p></div>
        <div className="req-heading-actions"><button className="req-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>{canCreate && <button className="req-primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> New requisition</button>}</div>
      </div>
      {error && <div className="req-alert error" role="alert">{error}</div>}
      {notice && <div className="req-alert success" role="status">{notice}</div>}
      {showForm && canCreate && <form className="req-panel req-form" onSubmit={createDraft}>
        <div className="req-panel-heading"><div><h2>New purchase request</h2><p>Enter line-item prices in the selected currency.</p></div><button type="button" className="req-icon-button" onClick={() => setShowForm(false)} aria-label="Close form"><X size={17} /></button></div>
        <div className="req-form-grid">
          <label>Request title<input required minLength={3} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Engineering workstation refresh" /></label>
          <label>Department<input required value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} /></label>
          <label>Cost centre<input required value={costCenter} onChange={(e) => setCostCenter(e.target.value)} maxLength={80} placeholder="e.g. ENG-OPS" /></label>
          <label>Needed by<input required type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></label>
          <label>Currency<select value={currency} onChange={(e) => setCurrency(e.target.value)}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          <label className="req-span-two">Business justification<textarea required minLength={10} maxLength={2000} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Explain the business need, expected outcome and urgency." /></label>
        </div>
        <div className="req-items-heading"><h3>Line items</h3><button type="button" className="req-text-button" onClick={() => setItems((rows) => [...rows, { description: "", quantity: 1, unit: "each", unitPrice: "0.00" }])}><Plus size={14} /> Add item</button></div>
        {items.map((item, index) => <div className="req-item-row" key={index}>
          <label>Description<input required value={item.description} onChange={(e) => setItems((rows) => rows.map((row, i) => i === index ? { ...row, description: e.target.value } : row))} /></label>
          <label>Qty<input required type="number" min="1" step="1" value={item.quantity} onChange={(e) => setItems((rows) => rows.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) } : row))} /></label>
          <label>Unit<input required value={item.unit} onChange={(e) => setItems((rows) => rows.map((row, i) => i === index ? { ...row, unit: e.target.value } : row))} /></label>
          <label>Unit price<input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItems((rows) => rows.map((row, i) => i === index ? { ...row, unitPrice: e.target.value } : row))} /></label>
          {items.length > 1 && <button type="button" className="req-remove" onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))} aria-label="Remove line item"><X size={15} /></button>}
        </div>)}
        <div className="req-total">Estimated request total <strong>{money(Math.round(total * 100), currency)}</strong></div>
        <div className="req-approvers"><h3>Sequential approval chain</h3><p>Approvers act in the order selected. The requester cannot approve their own request.</p>
          {approvers.length === 0 ? <div className="req-empty">No other active organization members are available as approvers. Invite or activate a teammate first.</div> :
            <div className="req-approver-list">{approvers.map((person) => <label key={person.id}><input type="checkbox" checked={selectedApprovers.includes(person.id)} onChange={(e) => setSelectedApprovers((current) => e.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} /><span><strong>{person.name}</strong><small>{person.email} · {person.role.replaceAll("_", " ")}</small></span></label>)}</div>}
        </div>
        <div className="req-form-actions"><button className="req-primary" type="submit" disabled={saving || !selectedApprovers.length}><ClipboardList size={15} /> {saving ? "Saving…" : "Save draft"}</button></div>
      </form>}
      {canManageBudget && <section className="req-panel req-budget-panel">
        <div className="req-panel-heading"><div><h2><Wallet size={17} /> Cost-centre budgets</h2><p>Configure annual limits used during requisition submission.</p></div></div>
        <form className="req-budget-form" onSubmit={saveBudget}>
          <label>Cost centre<input required value={budgetCenter} onChange={(e) => setBudgetCenter(e.target.value)} placeholder="e.g. ENG-OPS" /></label>
          <label>Fiscal year<input required type="number" min="2000" max="2200" value={budgetYear} onChange={(e) => setBudgetYear(Number(e.target.value))} /></label>
          <label>Currency<select value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value)}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          <label>Annual limit<input required type="number" min="0" step="0.01" value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} placeholder="0.00" /></label>
          <button className="req-secondary" disabled={saving}>Save budget</button>
        </form>
        {budgets.length > 0 && <div className="req-budget-list">{budgets.map((budget) => <span key={budget.costCenter + budget.fiscalYear}>{budget.costCenter} · {budget.fiscalYear}: <strong>{money(budget.committedMinor ?? 0, budget.currency)} / {money(budget.limitMinor, budget.currency)}</strong></span>)}</div>}
      </section>}
      <section className="req-list-heading"><div><span className="req-eyebrow">WORK QUEUE</span><h2>Requisition register</h2></div><span>{records.length} records · newest first</span></section>
      {loading ? <div className="req-loading">Loading organization requisitions…</div> : records.length === 0 ? <div className="req-panel req-empty"><ClipboardList size={25} /><strong>No requisitions yet</strong><span>Create the first purchase request to start an approval workflow.</span></div> :
        <div className="req-record-list">{records.map((record) => {
          const canAct = record.status === "pending_approval" && record.currentApproverId === user.id;
          const canEdit = record.status === "draft" && record.requesterId === user.id;
          const current = record.approvals.find((step) => step.status === "pending");
          return <article className="req-record" key={record.id}>
            <div className="req-record-main"><div className="req-record-icon"><ClipboardList size={19} /></div><div className="req-record-copy">
              <div className="req-record-title">{record.title}<span className={"req-status " + record.status}>{record.status.replaceAll("_", " ")}</span></div>
              <p>{record.department} · {record.costCenter} · Requested by {record.requester?.name ?? "Organization member"}</p>
              <div className="req-record-meta"><span>Needed by {date(record.neededBy)}</span><span>{record.items.length} line item{record.items.length === 1 ? "" : "s"}</span><span className={"req-budget-status " + record.budgetStatus}>{record.budgetStatus.replaceAll("_", " ")}</span></div>
              <div className="req-approval-track">{record.approvals.map((step) => <span key={step.approverId} className={"req-step " + step.status} title={step.approver?.name ?? "Approver"}>{step.level}. {step.approver?.name ?? "Approver"} {step.status === "approved" ? "✓" : step.status === "rejected" ? "×" : "·"}</span>)}</div>
            </div></div>
            <div className="req-record-side"><strong>{money(record.totalMinor, record.currency)}</strong><small>{date(record.createdAt)}</small>
              {canEdit && <div className="req-record-actions"><button className="req-secondary" disabled={saving} onClick={() => void action(record.id, "submit")}><Send size={13} /> Submit</button><button className="req-danger" disabled={saving} onClick={() => void action(record.id, "cancel")}>Cancel</button></div>}
              {canAct && <div className="req-record-actions"><button className="req-primary" disabled={saving} onClick={() => void action(record.id, "approve")}><Check size={13} /> Approve</button><button className="req-danger" disabled={saving} onClick={() => void action(record.id, "reject")}>Reject</button></div>}
              {current && !canAct && <small className="req-awaiting">Awaiting {current.approver?.name ?? "next approver"}</small>}
            </div>
            <details className="req-details"><summary>View approval history <ChevronRight size={14} /></summary><div>{record.approvals.map((step) => <p key={step.approverId}><strong>Level {step.level} · {step.approver?.name ?? "Approver"}</strong> — {step.status}{step.comment ? ": " + step.comment : ""}</p>)}</div></details>
          </article>;
        })}</div>}
      <footer className="req-footer"><span><ShieldCheck size={14} /> Tenant-isolated workflow · audited decisions</span><span>ProcuraOS · Procurement operations</span></footer>
    </div>
  </main>;
}
