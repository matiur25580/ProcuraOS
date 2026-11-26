import { Activity, ArrowUpRight, Boxes, Building2, ClipboardCheck, ShieldCheck, Truck } from "lucide-react";

const capabilities = [
  { icon: ClipboardCheck, title: "Guided purchasing", description: "A traceable path from purchase request to approved order." },
  { icon: Building2, title: "Supplier collaboration", description: "A shared workspace for onboarding, quotations and fulfillment." },
  { icon: ShieldCheck, title: "Governed approvals", description: "Role-aware decisions with a clear audit history." },
  { icon: Activity, title: "Operational intelligence", description: "Actionable visibility into spend, delivery and exceptions." },
];

export default function App() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ProcuraOS home">
          <span className="brand-mark"><Boxes size={21} /></span>
          <span>procura<span className="brand-light">OS</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace"><Building2 size={17} /><span>Demo organization</span><span className="workspace-dot" /></div>
        <nav className="navigation" aria-label="Primary navigation">
          <span className="nav-heading">OVERVIEW</span>
          <a className="nav-link active" href="#overview"><Activity size={17} /> Overview</a>
          <a className="nav-link" href="#requests"><ClipboardCheck size={17} /> Requisitions</a>
          <a className="nav-link" href="#suppliers"><Truck size={17} /> Suppliers</a>
          <a className="nav-link" href="#controls"><ShieldCheck size={17} /> Controls</a>
        </nav>
        <div className="sidebar-footer"><span className="status-indicator" /> Foundation environment</div>
      </aside>

      <section className="main-panel" id="overview">
        <header className="topbar">
          <div><span className="eyebrow">PROCUREMENT OPERATIONS</span><div className="page-title">Workspace overview</div></div>
          <div className="avatar" aria-label="Demo user">P</div>
        </header>

        <section className="welcome">
          <div className="welcome-copy">
            <span className="eyebrow light">ENTERPRISE PROCUREMENT, CONNECTED</span>
            <h1>Make every purchase<br />a smarter decision.</h1>
            <p>Bring requests, suppliers, approvals and financial controls together in one trusted workspace.</p>
            <a className="welcome-link" href="#capabilities">Explore the platform <ArrowUpRight size={16} /></a>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="orbit-core"><Boxes size={42} /></div>
            <div className="orbit-node node-one"><ClipboardCheck size={18} /></div>
            <div className="orbit-node node-two"><Truck size={18} /></div>
            <div className="orbit-node node-three"><ShieldCheck size={18} /></div>
          </div>
        </section>

        <section className="section-heading" id="capabilities">
          <div><span className="eyebrow">PLATFORM FOUNDATION</span><h2>One connected procurement lifecycle</h2></div>
          <span className="phase-pill">Phase 01 · Foundation</span>
        </section>
        <section className="capability-grid">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <article className="capability-card" key={title}>
              <span className="capability-icon"><Icon size={20} /></span>
              <h3>{title}</h3><p>{description}</p>
              <span className="card-arrow"><ArrowUpRight size={16} /></span>
            </article>
          ))}
        </section>
        <footer className="footer-note"><span>PROCURAOS</span><span>Built for transparent, accountable procurement.</span></footer>
      </section>
    </main>
  );
}
