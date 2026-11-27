import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest, refreshAccessToken, setAccessToken } from "../lib/api";

export interface SessionUser { id: string; name: string; email: string }
export interface SessionOrganization { id: string; name: string; slug: string }
interface SessionData { user: SessionUser; organization: SessionOrganization; role: string }
interface AuthContextValue extends SessionData {
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string, organizationName: string): Promise<void>;
  updateProfile(name: string): Promise<void>;
  signOut(): Promise<void>;
  signOutAll(): Promise<void>;
  switchOrganization(organizationId: string): Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refreshAccessToken();
        const profile = await apiRequest<SessionData>("/auth/me", { method: "GET" }, false);
        if (active) setSession(profile);
      } catch {
        setAccessToken(null);
        if (active) setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function signIn(email: string, password: string) {
    const result = await apiRequest<SessionData & { accessToken: string }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }, false);
    setAccessToken(result.accessToken);
    setSession({ user: result.user, organization: result.organization, role: result.role });
  }

  async function signUp(name: string, email: string, password: string, organizationName: string) {
    const result = await apiRequest<SessionData & { accessToken: string }>("/auth/register", {
      method: "POST", body: JSON.stringify({ name, email, password, organizationName }),
    }, false);
    setAccessToken(result.accessToken);
    setSession({ user: result.user, organization: result.organization, role: result.role });
  }

  async function updateProfile(name: string) {
    const result = await apiRequest<{ user: SessionUser }>("/auth/me", {
      method: "PATCH", body: JSON.stringify({ name }),
    });
    setSession(current => current ? { ...current, user: result.user } : null);
  }

  async function signOut() {
    try { await apiRequest("/auth/logout", { method: "POST" }, false); }
    finally { setAccessToken(null); setSession(null); }
  }

  async function switchOrganization(organizationId: string) {
    const result = await apiRequest<{ organization: SessionOrganization; role: string; accessToken: string }>("/auth/switch-organization", {
      method: "POST", body: JSON.stringify({ organizationId }),
    }, false);
    setAccessToken(result.accessToken);
    setSession(current => current ? { ...current, organization: result.organization, role: result.role } : null);
  }

  async function signOutAll() {
    try { await apiRequest("/auth/logout-all", { method: "POST" }, false); }
    finally { setAccessToken(null); setSession(null); }
  }

  const value = useMemo(() => ({
    ...(session ?? { user: { id: "", name: "", email: "" }, organization: { id: "", name: "", slug: "" }, role: "" }),
    loading, signIn, signUp, updateProfile, signOut, signOutAll, switchOrganization,
  }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
