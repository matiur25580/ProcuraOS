import { useState, type FormEvent } from "react";
import { ArrowRight, Boxes, LockKeyhole } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registrationSubmitted, setRegistrationSubmitted] = useState(false);

  if (user.id) return <Navigate to="/" replace />;
  if (isRegister && registrationSubmitted) return <main className="auth-layout"><section className="auth-form-panel"><div className="auth-form-wrap"><div className="auth-form-icon"><LockKeyhole size={20} /></div><span className="eyebrow">CHECK YOUR INBOX</span><h2>Verify your email</h2><p className="auth-subtitle">Your workspace has been created. Follow the verification link sent to your email address before signing in.</p><p className="auth-switch"><Link to="/login">Continue to sign in</Link></p></div></section></main>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isRegister) {
        await signUp(name, email, password, organizationName);
        setRegistrationSubmitted(true);
        return;
      }
      await signIn(email, password);
      const destination = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
      navigate(destination?.pathname ? `${destination.pathname}${destination.search ?? ""}` : "/", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to complete your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <a className="brand auth-brand" href="/"><span className="brand-mark"><Boxes size={21} /></span><span>procura<span className="brand-light">OS</span></span></a>
        <div className="auth-brand-copy">
          <span className="eyebrow light">ENTERPRISE PROCUREMENT, CONNECTED</span>
          <h1>Better decisions<br />start with trust.</h1>
          <p>A secure workspace for purchasing, supplier collaboration and accountable operations.</p>
        </div>
        <span className="auth-brand-foot">PROCURAOS · PROCUREMENT INTELLIGENCE</span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-form-icon"><LockKeyhole size={20} /></div>
          <span className="eyebrow">{isRegister ? "CREATE YOUR WORKSPACE" : "WELCOME BACK"}</span>
          <h2>{isRegister ? "Start with ProcuraOS" : "Sign in to your workspace"}</h2>
          <p className="auth-subtitle">{isRegister ? "Create your account and organization to get started." : "Enter your credentials to continue to your organization."}</p>
          <form onSubmit={submit} className="auth-form">
            {isRegister && <label>Full name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} required placeholder="Your name" /></label>}
            {isRegister && <label>Organization name<input value={organizationName} onChange={e => setOrganizationName(e.target.value)} minLength={2} maxLength={140} required placeholder="Acme Corporation" /></label>}
            <label>Work email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" /></label>
            <label>Password<input type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={isRegister ? 12 : 1} maxLength={128} required placeholder={isRegister ? "At least 12 characters" : "Your password"} /></label>
            {isRegister && <p className="password-hint">Use at least 12 characters with uppercase, lowercase and a number.</p>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : isRegister ? "Create secure workspace" : "Sign in"} <ArrowRight size={16} /></button>
          </form>
          {!isRegister && <p className="auth-switch"><Link to="/forgot-password">Forgot your password?</Link></p>}
          <p className="auth-switch">{isRegister ? "Already have an account?" : "New to ProcuraOS?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
        </div>
      </section>
    </main>
  );
}
