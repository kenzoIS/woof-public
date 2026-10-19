import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { AppProps } from "next/app";
import "../src/styles/index.css";
import { endDashboardSession, sessionHasEnded } from "../src/app/lib/sessionLifecycle";
import { hydrateSettingsPreferences } from "../src/app/lib/preferences";
import { Layout } from "../src/app/components/Layout";

async function getValidDashboardAuth() {
  if (sessionHasEnded()) {
    // Retry server revocation after an offline logout. Never restore the old UI
    // merely because an HttpOnly cookie still exists in a browser.
    await endDashboardSession('logout').catch(() => {});
    return { authenticated: false, mfaRequired: false };
  }
  // Keep auth checks same-origin with login so HttpOnly session cookies are
  // consistently attached in local development and production.
  const response = await fetch("/backend-api/auth/session", { credentials: "include", cache: "no-store" });
  if (!response.ok) return { authenticated: false, mfaRequired: false };
  const session = await response.json();
  if (session.email) sessionStorage.setItem("woofUserEmail", session.email);
  if (session.authenticated && !session.mfaRequired) {
    sessionStorage.setItem('woofSessionActive', 'true');
    await hydrateSettingsPreferences().catch(() => {});
  }
  return { authenticated: Boolean(session.authenticated), mfaRequired: Boolean(session.mfaRequired) };
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isPublicAuthRoute = router.pathname === "/login" || router.pathname === "/reset-password";
  const isMfaEnrollmentRoute = router.pathname === "/mfa-enroll";
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getValidDashboardAuth().then((auth) => {
      if (cancelled) return;
      setIsAuthenticated(auth.authenticated);
      setMfaRequired(auth.mfaRequired);
      setCheckedAuth(true);
      if (!auth.authenticated && !isPublicAuthRoute) router.replace("/login");
      if (auth.authenticated && auth.mfaRequired && !isMfaEnrollmentRoute && router.pathname !== "/reset-password") router.replace("/mfa-enroll");
      if (auth.authenticated && !auth.mfaRequired && (router.pathname === "/login" || isMfaEnrollmentRoute)) router.replace("/");
    }).catch(() => { setCheckedAuth(true); if (!isPublicAuthRoute) router.replace("/login"); });

    return () => { cancelled = true; };
    // The aggressive background prefetching loop was removed to prevent 
    // the development server from choking on concurrent compilations.
    // Next.js Link components handle prefetching natively.
  }, [router.pathname, isPublicAuthRoute, isMfaEnrollmentRoute]);

  if (!checkedAuth) {
    return null;
  }

  if (!isAuthenticated && !isPublicAuthRoute) {
    return null;
  }

  if (isAuthenticated && !mfaRequired && router.pathname === "/login") {
    return null;
  }

  if (isPublicAuthRoute || isMfaEnrollmentRoute) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
