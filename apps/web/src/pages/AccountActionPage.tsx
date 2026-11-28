import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api";

type Mode = "verify" | "forgot" | "reset";
export function AccountActionPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "verify") return;
    const token = params.get("token");
    if (!token) { setError("The verification link is missing its token."); return; }
    setBusy(true);
    apiRequest<{ verified: boolean }>("/auth/verify-email", {
      method: "POST", body: JSON.stringify({ token }),
    }, false).then(() => setMessage("Your email address is verified. You can now sign in."))
      .catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Unable to verify this email address."))
      .finally(() => setBusy(false));
  }, [mode, params]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    try {
      if (mode === "forgot") {
        await apiRequest("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }, false);
        setMessage("If an account exists for that address, reset instructions have been sent.");
      } else if (mode === "reset") {
        const token = params.get("token");
        if (!token) throw new Error("The reset link is missing its token.");
        await apiRequest("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }, false);
        setMessage("Your password has been changed and existing sessions have been revoked. Sign in again.");
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Unable to complete your request.");
    } finally { setBusy(false); }
  }

  const title = mode === "verify" ? "Verify your email" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  return <main className="auth-layout"><section className="auth-brand-panel"><a className="brand auth-brand" href="/"><span className="brand-mark">P</span><span>procura<span className="brand-light">OS</span></span></a><div className="auth-brand-copy"><span className="eyebrow light">ACCOUNT SECURITY</span><h1>Identity you<br/>can trust.</h1><p>Secure access for your procurement workspace.</p></div></section><section className="auth-form-panel"><div className="auth-form-wrap"><div className="auth-form-icon">🔐</div><span className="eyebrow">PROCURAOS ACCOUNT</span><h2>{title}</h2><p className="auth-subtitle">{mode === "verify" ? "We are checking your one-time verification link." : mode === "forgot" ? "Enter your account email. We will send a secure, single-use reset link if the account exists." : "Enter a new password with at least 12 characters, including uppercase, lowercase and a number."}</p>{mode !== "verify" && <form className="auth-form" onSubmit={submit}>{mode === "forgot" ? <label>Work email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label> : <label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required/></label>}<button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : "Update password"}</button></form>}{busy && mode === "verify" && <p className="auth-subtitle">Verifying…</p>}{message && <div className="auth-success" role="status">{message}</div>}{error && <div className="auth-error" role="alert">{error}</div>}<p className="auth-switch"><Link to="/login">Return to sign in</Link></p></div></section></main>;
}
