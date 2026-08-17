import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type {
  Session,
} from "@supabase/supabase-js";

import {
  supabase,
} from "../lib/supabase";

import "./auth.css";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({
  children,
}: AuthGateProps) {
  const [
    session,
    setSession,
  ] = useState<Session | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    signingIn,
    setSigningIn,
  ] = useState(false);

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    let active = true;

    void supabase.auth
      .getSession()
      .then(
        ({
          data,
        }) => {
          if (!active) {
            return;
          }

          setSession(
            data.session,
          );

          setLoading(false);
        },
      )
      .catch(() => {
        if (!active) {
          return;
        }

        setSession(null);
        setLoading(false);
      });

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          nextSession,
        ) => {
          if (!active) {
            return;
          }

          /*
           * Nollställ endast sessionen vid ett
           * riktigt SIGNED_OUT-event.
           *
           * Vid hård browser-refresh kan ett
           * INITIAL_SESSION-event tillfälligt
           * sakna session medan getSession()
           * fortfarande läser lagringen.
           */
          if (event === "SIGNED_OUT") {
            setSession(null);
            setLoading(false);
            return;
          }

          if (nextSession) {
            setSession(
              nextSession,
            );

            setLoading(false);
          }
        },
      );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !normalizedEmail ||
      !password
    ) {
      setErrorMessage(
        "Fyll i e-post och lösenord.",
      );

      return;
    }

    setSigningIn(true);
    setErrorMessage("");

    const {
      error,
    } =
      await supabase.auth
        .signInWithPassword({
          email:
            normalizedEmail,

          password,
        });

    if (error) {
      setErrorMessage(
        "Fel e-postadress eller lösenord.",
      );

      setSigningIn(false);
      return;
    }

    setPassword("");
    setSigningIn(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setPassword("");
    setErrorMessage("");
  }

  if (loading) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-loading-card">
          <div className="auth-spinner" />
          <p>Kontrollerar inloggning…</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="auth-logo">
            K
          </div>

          <p className="auth-eyebrow">
            PRIVAT APP
          </p>

          <h1>
            KOMBEN LIVE
          </h1>

          <p className="auth-description">
            Logga in för att öppna
            marknadsanalysen.
          </p>

          <form
            className="auth-form"
            onSubmit={
              handleLogin
            }
          >
            <label htmlFor="auth-email">
              E-post
            </label>

            <input
              id="auth-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={
                (event) =>
                  setEmail(
                    event.target.value,
                  )
              }
              disabled={
                signingIn
              }
              required
            />

            <label htmlFor="auth-password">
              Lösenord
            </label>

            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={
                (event) =>
                  setPassword(
                    event.target.value,
                  )
              }
              disabled={
                signingIn
              }
              required
            />

            {errorMessage ? (
              <p
                className="auth-error"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}

            <button
              className="auth-submit"
              type="submit"
              disabled={
                signingIn
              }
            >
              {signingIn
                ? "LOGGAR IN…"
                : "LOGGA IN"}
            </button>
          </form>

          <p className="auth-private-note">
            Endast godkända konton
            har åtkomst.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className="auth-app-shell">
      {children}

      <button
        className="auth-logout-button"
        type="button"
        onClick={
          () => {
            void handleLogout();
          }
        }
      >
        Logga ut
      </button>
    </div>
  );
}
