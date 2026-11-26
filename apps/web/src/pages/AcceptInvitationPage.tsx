import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { switchOrganization } = useAuth();
  const [message, setMessage] = useState("Verifying your invitation…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const token = params.get("token");
    if (!token) { setFailed(true); setMessage("This invitation link is incomplete."); return; }
    (async () => {
      try {
        const result = await apiRequest<{ membership: { organization: { id: string } } }>("/organization/invitations/accept", {
          method: "POST", body: JSON.stringify({ token }),
        });
        if (!result.membership.organization) throw new Error("The organization is unavailable.");
        await switchOrganization(result.membership.organization.id);
        if (active) { setMessage("Your organization membership is active. Redirecting to your workspace…"); window.setTimeout(() => navigate("/", { replace: true }), 900); }
      } catch (cause) {
        if (active) { setFailed(true); setMessage(cause instanceof Error ? cause.message : "Unable to accept invitation."); }
      }
    })();
    return () => { active = false; };
  }, [params, navigate]);

  return <main className="invite-accept-page"><div className="invite-accept-card"><span className="auth-form-icon"><ShieldCheck size={22} /></span><span className="eyebrow">PROCURAOS ORGANIZATION ACCESS</span><h1>{failed ? "Invitation unavailable" : "Joining your team"}</h1><p>{message}</p>{failed && <button className="admin-primary" onClick={() => navigate("/", { replace: true })}>Return to workspace</button>}{!failed && <CheckCircle2 size={25} className="invite-progress" />}</div></main>;
}
