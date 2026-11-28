import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, FilePlus2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, requestStepUpToken } from "../lib/api";
import "./contracts.css";

type Supplier = { _id: string; displayName: string; status: string };
type Contract = {
  _id: string; contractNumber: string; title: string; contractType: string; status: string;
  currency: string; valueMinor: number; startDate: string; endDate: string; isExpired: boolean;
  daysToExpiry: number; supplierId: { displayName: string } | string;
  obligations: { _id: string; title: string; dueAt: string; status: string }[];
  rejectionReason?: string;
};
type Summary = { active: number; pendingApproval: number; expiring30Days: number; expiring90Days: number; contractsWithOverdueObligations: number };
const money=(minor:number,currency:string)=>new Intl.NumberFormat(undefined,{style:"currency",currency}).format(minor/100);
const date=(value:string)=>new Date(value).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
const supplierName=(value:Contract["supplierId"])=>typeof value==="string"?"Supplier":value.displayName;

export function ContractsPage() {
  const { user, role } = useAuth();
  const [contracts,setContracts]=useState<Contract[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [summary,setSummary]=useState<Summary>({active:0,pendingApproval:0,expiring30Days:0,expiring90Days:0,contractsWithOverdueObligations:0});
  const [showForm,setShowForm]=useState(false);
  const [supplierId,setSupplierId]=useState("");
  const [title,setTitle]=useState("");
  const [contractType,setContractType]=useState("master_services");
  const [scope,setScope]=useState("");
  const [startDate,setStartDate]=useState(new Date().toISOString().slice(0,10));
  const [endDate,setEndDate]=useState("");
  const [amount,setAmount]=useState("");
  const [currency,setCurrency]=useState("USD");
  const [obligationTitle,setObligationTitle]=useState("");
  const [obligationDue,setObligationDue]=useState("");
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const canWrite=["owner","admin","procurement_manager","procurement_officer"].includes(role);
  const canApprove=["owner","admin","finance_manager"].includes(role);

  async function load(){
    setLoading(true);setError("");
    try{
      const [list,totals,supplierData]=await Promise.all([
        apiRequest<{contracts:Contract[]}>("/contracts"),
        apiRequest<Summary>("/contracts/summary"),
        apiRequest<{suppliers:Supplier[]}>("/suppliers?status=approved")
      ]);
      setContracts(list.contracts);setSummary(totals);setSuppliers(supplierData.suppliers);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load contract workspace");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  async function create(e:FormEvent){
    e.preventDefault();
    const valueMinor=Math.round(Number(amount)*100);
    if(!Number.isSafeInteger(valueMinor)||valueMinor<0){setError("Enter a valid contract value.");return;}
    if(!endDate||endDate<=startDate){setError("Contract end date must be after its start date.");return;}
    setSaving(true);setError("");setNotice("");
    try{
      await apiRequest("/contracts",{method:"POST",body:JSON.stringify({
        supplierId,title,contractType,scope,startDate:new Date(startDate+"T00:00:00.000Z").toISOString(),
        endDate:new Date(endDate+"T23:59:59.000Z").toISOString(),valueMinor,currency,ownerUserId:user.id,
        obligations:obligationTitle.trim()&&obligationDue?[{title:obligationTitle,dueAt:new Date(obligationDue+"T23:59:59.000Z").toISOString()}]:[]
      })});
      setNotice("Contract draft created. Submit it for independent finance approval when ready.");
      setShowForm(false);setTitle("");setScope("");setAmount("");setObligationTitle("");setObligationDue("");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to create contract");}
    finally{setSaving(false);}
  }

  async function action(contract:Contract, name:"submit"|"review"|"activate"|"terminate"){
    let body:Record<string,string>|undefined;
    if(name==="review"){
      const decision=window.confirm("Approve this contract? Choose Cancel to reject it.")?"approve":"reject";
      const reason=decision==="reject"?(window.prompt("Reason for rejection:")??""):"";
      if(decision==="reject"&&reason.trim().length<5)return;
      body={decision,reason};
    }
    if(name==="terminate"){
      const reason=window.prompt("Reason for terminating this contract:")??"";
      if(reason.trim().length<5)return;
      body={reason};
    }
    setSaving(true);setError("");setNotice("");
    try{
      const sensitive=["review","activate","terminate"].includes(name);
      const token=sensitive?await requestStepUpToken():null;
      if(sensitive&&!token)return;
      await apiRequest("/contracts/"+contract._id+"/"+name,{method:"POST",...(body?{body:JSON.stringify(body)}:{}),...(token?{headers:{"x-step-up-token":token}}:{})});
      setNotice(name==="submit"?"Contract submitted for independent approval.":name==="review"?"Contract review decision recorded.":name==="activate"?"Contract activated.":"Contract terminated with a recorded reason.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Contract action failed");}
    finally{setSaving(false);}
  }

  async function updateObligation(contract:Contract, obligationId:string){
    setSaving(true);setError("");setNotice("");
    try{
      await apiRequest("/contracts/"+contract._id+"/obligations/"+obligationId,{method:"PATCH",body:JSON.stringify({status:"completed",resolutionNote:"Completed and verified by contract owner."})});
      setNotice("Contract obligation marked complete.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to update obligation");}
    finally{setSaving(false);}
  }

  return <main className="contract-page">
    <header className="contract-topbar"><Link to="/"><ArrowLeft size={16}/> Workspace</Link><strong>ProcuraOS <span>· CONTRACT GOVERNANCE</span></strong><span>{user.name} · {role.replaceAll("_"," ")}</span></header>
    <div className="contract-content">
      <div className="contract-heading"><div><span className="contract-eyebrow">SOURCE-TO-PAY · CONTRACTS</span><h1>Contract lifecycle management</h1><p>Govern supplier agreements, financial approvals, renewal windows and contractual obligations.</p></div><div className="contract-actions"><button className="contract-secondary" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button>{canWrite&&<button className="contract-primary" onClick={()=>setShowForm(v=>!v)}><FilePlus2 size={15}/> New contract</button>}</div></div>
      {error&&<div className="contract-alert error" role="alert">{error}</div>}{notice&&<div className="contract-alert success" role="status">{notice}</div>}
      <section className="contract-metrics">
        <article><span>Active agreements</span><strong>{summary.active}</strong></article>
        <article><span>Awaiting approval</span><strong>{summary.pendingApproval}</strong></article>
        <article><span>Expiring in 30 days</span><strong>{summary.expiring30Days}</strong></article>
        <article><span>Contracts with overdue obligations</span><strong>{summary.contractsWithOverdueObligations}</strong></article>
      </section>
      {showForm&&<form className="contract-panel contract-form" onSubmit={create}>
        <div className="contract-form-title"><span className="contract-eyebrow">NEW AGREEMENT</span><h2>Create contract draft</h2><p>New contracts start as drafts and require an independent finance decision before activation.</p></div>
        <label>Contract title<input required minLength={3} maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Enterprise managed services agreement"/></label>
        <label>Approved supplier<select required value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Select supplier</option>{suppliers.map(s=><option key={s._id} value={s._id}>{s.displayName}</option>)}</select></label>
        <label>Contract type<select value={contractType} onChange={e=>setContractType(e.target.value)}><option value="master_services">Master services</option><option value="statement_of_work">Statement of work</option><option value="software_license">Software license</option><option value="supply">Supply agreement</option><option value="consulting">Consulting</option><option value="non_disclosure">Non-disclosure</option><option value="other">Other</option></select></label>
        <label>Currency<input required minLength={3} maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
        <label>Contract value<input required type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="25000.00"/></label>
        <label>Effective date<input required type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>End date<input required type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label className="contract-wide">Scope of services<textarea required minLength={10} maxLength={5000} value={scope} onChange={e=>setScope(e.target.value)} placeholder="Describe deliverables, service boundaries and acceptance criteria."/></label>
        <label>Initial obligation (optional)<input value={obligationTitle} onChange={e=>setObligationTitle(e.target.value)} maxLength={180} placeholder="Quarterly security review"/></label>
        <label>Obligation due date<input type="date" value={obligationDue} onChange={e=>setObligationDue(e.target.value)}/></label>
        <div className="contract-wide contract-form-footer"><button className="contract-primary" disabled={saving||!supplierId}>{saving?"Saving…":"Create draft"}</button><button type="button" className="contract-secondary" onClick={()=>setShowForm(false)}>Cancel</button></div>
      </form>}
      <div className="contract-list-heading"><div><span className="contract-eyebrow">AGREEMENT REGISTER</span><h2>Supplier contracts</h2></div><span>{contracts.length} records</span></div>
      {loading?<div className="contract-panel contract-empty">Loading contract register…</div>:contracts.length===0?<div className="contract-panel contract-empty"><FilePlus2 size={28}/><strong>No contracts registered</strong><span>Create a supplier agreement to start tracking approvals, dates and obligations.</span></div>:
      <section className="contract-list">{contracts.map(contract=><article className="contract-panel contract-card" key={contract._id}>
        <div className="contract-card-main"><div className="contract-card-title"><h3>{contract.title}</h3><span className={"contract-status "+contract.status}>{contract.status.replaceAll("_"," ")}</span></div><p>{contract.contractNumber} · {supplierName(contract.supplierId)} · {contract.contractType.replaceAll("_"," ")}</p><div className="contract-meta"><span>{money(contract.valueMinor,contract.currency)}</span><span>{date(contract.startDate)} – {date(contract.endDate)}</span><span className={contract.daysToExpiry<=30?"expiry-warning":""}>{contract.isExpired?"Expired":contract.daysToExpiry+" days to expiry"}</span></div>
        {contract.rejectionReason&&<small className="contract-rejection">Review note: {contract.rejectionReason}</small>}
        {contract.obligations.length>0&&<div className="contract-obligations"><strong>Obligations</strong>{contract.obligations.map(o=><div key={o._id}><span>{o.title} · due {date(o.dueAt)} · {o.status}</span>{contract.status==="active"&&o.status==="open"&&canWrite&&<button disabled={saving} onClick={()=>void updateObligation(contract,o._id)}>Mark complete</button>}</div>)}</div>}
        </div><div className="contract-card-actions">
          {contract.status==="draft"&&canWrite&&<button disabled={saving} onClick={()=>void action(contract,"submit")}>Submit</button>}
          {contract.status==="pending_approval"&&canApprove&&<button disabled={saving} onClick={()=>void action(contract,"review")}><ShieldCheck size={14}/> Review</button>}
          {contract.status==="approved"&&canWrite&&<button disabled={saving} onClick={()=>void action(contract,"activate")}><CheckCircle2 size={14}/> Activate</button>}
          {contract.status==="active"&&canApprove&&<button className="danger" disabled={saving} onClick={()=>void action(contract,"terminate")}><XCircle size={14}/> Terminate</button>}
        </div>
      </article>)}</section>}
      <footer className="contract-footer"><span><CalendarClock size={14}/> Expiry and obligation indicators are derived from saved contract dates.</span><span>PROCURAOS · CONTRACT GOVERNANCE</span></footer>
    </div>
  </main>;
}
