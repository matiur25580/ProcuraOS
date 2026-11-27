import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Building2, ClipboardList, Copy, MailPlus, RefreshCw, Shield, Trash2, UserRound, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

type Member = { membershipId: string; userId: string; name: string; email: string; role: string; status: "active" | "suspended"; accountStatus: string; joinedAt: string };
type Invitation = { id: string; email: string; role: string; expiresAt: string; createdAt: string };
type AuditEvent = { id: string; action: string; targetType: string; actor: { name: string; email: string } | null; createdAt: string };
type Session = { id: string; current: boolean; userAgent: string; ipAddress: string | null; createdAt: string; expiresAt: string };
type Organization = { id: string; name: string; slug: string; status: string };\ntype MfaSetup = { secret: string; otpauthUrl: string };

const roles = ["admin", "procurement_manager", "procurement_officer", "finance_manager", "auditor"];
const roleLabel = (role: string) => role.replaceAll("_", " ");

export function OrganizationAdminPage() {
  const { organization: activeOrganization, role, user, updateProfile } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);\n  const [mfaEnabled, setMfaEnabled] = useState(false);\n  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);\n  const [mfaCode, setMfaCode] = useState("");\n  const [mfaPassword, setMfaPassword] = useState("");\n  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [name, setName] = useState(activeOrganization.name);
  const [profileName, setProfileName] = useState(user.name);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("procurement_officer");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage = role === "owner" || role === "admin";
  const canReadMembers = canManage || role === "procurement_manager";
  const canReadAudit = ["owner", "admin", "procurement_manager", "finance_manager", "auditor"].includes(role);
  const canEditOrganization = role === "owner" || role === "admin";
  const [tab, setTab] = useState<"members" | "audit" | "security" | "profile">(canReadMembers ? "members" : canReadAudit ? "audit" : "security");

  async function load() {
    setBusy(true); setError("");
    try {
      const [org, memberData, inviteData, auditData, sessionData, profileData] = await Promise.all([
        apiRequest<{ organization: Organization }>("/organization", { method: "GET" }),
        canReadMembers ? apiRequest<{ members: Member[] }>("/organization/members", { method: "GET" }) : Promise.resolve({ members: [] as Member[] }),
        canManage ? apiRequest<{ invitations: Invitation[] }>("/organization/invitations", { method: "GET" }) : Promise.resolve({ invitations: [] }),
        canReadAudit ? apiRequest<{ events: AuditEvent[] }>("/organization/audit-events?limit=30", { method: "GET" }) : Promise.resolve({ events: [] as AuditEvent[] }),
        apiRequest<{ sessions: Session[] }>("/auth/sessions", { method: "GET" }),\n        apiRequest<{ user: { mfaEnabled: boolean } }>("/auth/me", { method: "GET" }),
      ]);
      setOrganization(org.organization); setName(org.organization.name);
      setMembers(memberData.members); setInvitations(inviteData.invitations);
      setEvents(auditData.events); setSessions(sessionData.sessions); setMfaEnabled(profileData.user.mfaEnabled);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load organization settings");
    } finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  async function saveOrganization(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ organization: Organization }>("/organization", { method: "PATCH", body: JSON.stringify({ name }) });
      setOrganization(result.organization); setNotice("Organization details saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save organization"); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      await updateProfile(profileName);
      setNotice("Your profile has been updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update your profile"); }
  }

  async function invite(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setInviteUrl("");
    try {
      const result = await apiRequest<{ invitation: { id: string; invitationToken: string } }>("/organization/invitations", {
        method: "POST", body: JSON.stringify({ email, role: inviteRole }),
      });
      const url = new URL("/accept-invite", window.location.origin);
      url.hash = new URLSearchParams({ token: result.invitation.invitationToken }).toString();
      setInviteUrl(url.toString()); setEmail("");
      setNotice("Invitation created. Copy the secure link and share it with the invited person.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create invitation"); }
  }

  async function changeMember(member: Member, changes: { role?: string; status?: string }) {
    setError(""); setNotice("");
    try {
      await apiRequest(`/organization/members/${member.membershipId}`, { method: "PATCH", body: JSON.stringify(changes) });
      setNotice(`Updated access for ${member.name}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update member"); }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.name} from this organization?`)) return;
    try {
      await apiRequest(`/organization/members/${member.membershipId}`, { method: "DELETE" });
      setNotice("Member removed and their sessions in this organization revoked."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove member"); }
  }

  async function revokeInvitation(id: string) {
    try { await apiRequest(`/organization/invitations/${id}`, { method: "DELETE" }); setNotice("Invitation revoked."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to revoke invitation"); }
  }

  async function revokeSession(id: string) {
    try { await apiRequest(`/auth/sessions/${id}`, { method: "DELETE" }); setNotice("Session revoked."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to revoke session"); }
  }


  async function beginMfaSetup() {
    setError(""); setNotice(""); setRecoveryCodes([]);
    try { const result = await apiRequest<MfaSetup>("/auth/mfa/setup", { method: "POST" }); setMfaSetup(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start MFA setup"); }
  }
  async function confirmMfaSetup(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ mfaEnabled: boolean; recoveryCodes: string[] }>("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code: mfaCode }) });
      setMfaEnabled(result.mfaEnabled); setRecoveryCodes(result.recoveryCodes); setMfaSetup(null); setMfaCode("");
      setNotice("MFA is enabled. Save your recovery codes now; they will not be shown again.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to enable MFA"); }
  }
  async function turnOffMfa(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      await apiRequest("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password: mfaPassword, code: mfaCode }) });
      setMfaEnabled(false); setMfaPassword(""); setMfaCode(""); setRecoveryCodes([]); setNotice("MFA has been disabled."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to disable MFA"); }
  }
\n  async function copyInvite() {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setNotice("Invitation link copied."); }
    catch { setError("Clipboard access is unavailable. Select and copy the invitation link manually."); }
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="admin-back" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="admin-brand"><span className="brand-mark"><Building2 size={17} /></span> ProcuraOS</span>
        <span className="admin-user">{user.name} · {roleLabel(role)}</span>
      </header>
      <section className="admin-content">
        <div className="admin-heading">
          <div><span className="eyebrow">WORKSPACE GOVERNANCE</span><h1>Organization settings</h1><p>Manage your team, access policies and organization activity.</p></div>
          <button className="admin-refresh" onClick={() => void load()} disabled={busy}><RefreshCw size={15} /> Refresh</button>
        </div>
        {error && <div className="admin-alert error">{error}</div>}
        {notice && <div className="admin-alert success">{notice}</div>}
        <form className="org-summary" onSubmit={saveOrganization}>
          <div className="org-summary-icon"><Building2 size={21} /></div>
          <div className="org-summary-fields"><label>Organization name<input value={name} onChange={event => setName(event.target.value)} disabled={!canEditOrganization} /></label><span>Workspace slug · {organization?.slug ?? activeOrganization.slug}</span></div>
          {canEditOrganization && <button className="admin-primary" type="submit">Save changes</button>}
        </form>
        <div className="admin-tabs" role="tablist">
          {canReadMembers && <button className={tab === "members" ? "selected" : ""} onClick={() => setTab("members")}><Users size={16} /> Team & invitations</button>}
          {canReadAudit && <button className={tab === "audit" ? "selected" : ""} onClick={() => setTab("audit")}><ClipboardList size={16} /> Audit activity</button>}
          <button className={tab === "security" ? "selected" : ""} onClick={() => setTab("security")}><Shield size={16} /> My sessions</button>
          <button className={tab === "profile" ? "selected" : ""} onClick={() => setTab("profile")}><UserRound size={16} /> My profile</button>
        </div>
        {tab === "members" && canReadMembers && <>
          {canManage && <form className="invite-panel" onSubmit={invite}>
            <div className="panel-heading"><div className="panel-icon"><MailPlus size={18} /></div><div><h2>Invite a teammate</h2><p>Invitations expire after seven days and are restricted to the invited email address.</p></div></div>
            <div className="invite-fields"><label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="colleague@company.com" required /></label><label>Organization role<select value={inviteRole} onChange={event => setInviteRole(event.target.value)}>{roles.map(item => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label><button className="admin-primary" type="submit" disabled={busy}>Create invitation</button></div>
            {inviteUrl && <div className="invite-link"><input readOnly value={inviteUrl} aria-label="Invitation URL" /><button type="button" onClick={() => void copyInvite()}><Copy size={15} /> Copy link</button></div>}
          </form>}
          <section className="admin-panel">
            <div className="panel-title"><div><h2>Organization members</h2><p>{members.length} account(s) with a membership in this workspace</p></div><span className="count-pill">{members.length}</span></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Access</th>{canManage && <th>Actions</th>}</tr></thead><tbody>
              {members.map(member => <tr key={member.membershipId}><td><strong>{member.name}</strong><span>{member.email}</span></td><td>{member.role === "owner" ? <span className="role-owner">Owner</span> : canManage ? <select className="table-select" value={member.role} disabled={member.userId === user.id} onChange={event => void changeMember(member, { role: event.target.value })}>{roles.map(item => <option key={item} value={item}>{roleLabel(item)}</option>)}</select> : roleLabel(member.role)}</td><td><span className={member.status === "active" ? "status-active" : "status-suspended"}>{member.status}</span></td>{canManage && <td><div className="row-actions">{member.role !== "owner" && member.userId !== user.id && <><button onClick={() => void changeMember(member, { status: member.status === "active" ? "suspended" : "active" })}>{member.status === "active" ? "Suspend" : "Restore"}</button><button className="danger-action" onClick={() => void removeMember(member)} title="Remove member"><Trash2 size={14} /></button></>}</div></td>}</tr>)}
            </tbody></table></div>
          </section>
          {canManage && <section className="admin-panel"><div className="panel-title"><div><h2>Pending invitations</h2><p>Only active, unexpired invitations are shown.</p></div><span className="count-pill">{invitations.length}</span></div>{invitations.length ? <div className="invitation-list">{invitations.map(item => <div className="invitation-row" key={item.id}><div><strong>{item.email}</strong><span>{roleLabel(item.role)} · expires {new Date(item.expiresAt).toLocaleDateString()}</span></div><button className="danger-text" onClick={() => void revokeInvitation(item.id)}>Revoke</button></div>)}</div> : <p className="empty-state">No pending invitations.</p>}</section>}
        </>}
        {tab === "audit" && canReadAudit && <section className="admin-panel"><div className="panel-title"><div><h2>Organization audit trail</h2><p>Recent governance events for this tenant.</p></div></div>{events.length ? <div className="activity-list">{events.map(item => <div className="activity-row" key={item.id}><span className="activity-dot" /><div><strong>{item.action.replaceAll(".", " ")}</strong><span>{item.actor?.name ?? "System"} · {item.targetType}</span></div><time>{new Date(item.createdAt).toLocaleString()}</time></div>)}</div> : <p className="empty-state">No audit events recorded yet.</p>}</section>}
        {tab === "security" && <>
          <section className="admin-panel">
            <div className="panel-title"><div><h2>Multi-factor authentication</h2><p>Protect sign-ins with an authenticator app and one-time recovery codes.</p></div><span className={mfaEnabled ? "status-active" : "status-suspended"}>{mfaEnabled ? "Enabled" : "Not enabled"}</span></div>
            {!mfaEnabled && !mfaSetup && <button className="admin-primary" type="button" onClick={() => void beginMfaSetup()}>Set up authenticator</button>}
            {mfaSetup && <form className="mfa-setup" onSubmit={confirmMfaSetup}><p>Enter this secret into your authenticator app, or use the provisioning URI:</p><code>{mfaSetup.secret}</code><textarea readOnly value={mfaSetup.otpauthUrl} rows={2} aria-label="Authenticator provisioning URI" /><label>6-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={event => setMfaCode(event.target.value)} pattern="[0-9]{6}" maxLength={6} required /></label><button className="admin-primary" type="submit">Confirm and enable MFA</button></form>}
            {mfaEnabled && <form className="mfa-setup" onSubmit={turnOffMfa}><label>Account password<input type="password" autoComplete="current-password" value={mfaPassword} onChange={event => setMfaPassword(event.target.value)} required /></label><label>Authenticator or recovery code<input value={mfaCode} onChange={event => setMfaCode(event.target.value)} required /></label><button className="danger-text" type="submit">Disable MFA</button></form>}
            {recoveryCodes.length > 0 && <div className="recovery-codes"><strong>Save these recovery codes now</strong><p>Each code can be used once. Store them somewhere secure.</p><pre>{recoveryCodes.join("\\n")}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(recoveryCodes.join("\\n"))}>Copy recovery codes</button></div>}
          </section>
          <section className="admin-panel"><div className="panel-title"><div><h2>Active sessions</h2><p>Sessions associated with your current organization.</p></div></div>{sessions.length ? <div className="session-list">{sessions.map(item => <div className="session-row" key={item.id}><div><strong>{item.userAgent}</strong><span>{item.ipAddress ?? "IP unavailable"} · started {new Date(item.createdAt).toLocaleString()}</span></div><div className="session-actions">{item.current ? <span className="current-session">Current session</span> : <button className="danger-text" onClick={() => void revokeSession(item.id)}>Revoke</button>}</div></div>)}</div> : <p className="empty-state">No active sessions found.</p>}</section>
        </>}
        {tab === "profile" && <section className="admin-panel"><div className="panel-title"><div><h2>Personal profile</h2><p>Update the display name associated with your account.</p></div></div><form className="invite-fields" onSubmit={saveProfile}><label>Full name<input value={profileName} onChange={event => setProfileName(event.target.value)} minLength={2} maxLength={100} required /></label><label>Account email<input type="email" value={user.email} disabled /></label><button className="admin-primary" type="submit">Save profile</button></form></section>}
        <footer className="admin-footer">Organization data is scoped by your authenticated tenant membership. Current workspace: {activeOrganization.slug}.</footer>
      </section>
    </main>
  );
}
