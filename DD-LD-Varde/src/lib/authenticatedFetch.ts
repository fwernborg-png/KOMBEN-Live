import {
  supabase,
} from "./supabase";

const WORKER_ORIGIN =
  new URL(
    "https://dd-ld-varde-place-live-worker.fredde-platsmodell-live.workers.dev",
  ).origin;

let installed = false;

function inputUrl(
  input:
    RequestInfo | URL,
) {
  if (
    input instanceof Request
  ) {
    return input.url;
  }

  if (
    input instanceof URL
  ) {
    return input.href;
  }

  return String(input);
}

function mergedHeaders(
  input:
    RequestInfo | URL,

  init:
    RequestInit | undefined,
) {
  const headers =
    new Headers(
      input instanceof Request
        ? input.headers
        : undefined,
    );

  const initHeaders =
    new Headers(
      init?.headers,
    );

  initHeaders.forEach(
    (
      value,
      key,
    ) => {
      headers.set(
        key,
        value,
      );
    },
  );

  return headers;
}

async function getFreshAccessToken(
  forceRefresh = false,
) {
  if (forceRefresh) {
    const {
      data,
      error,
    } =
      await supabase.auth
        .refreshSession();

    if (
      error ||
      !data.session
    ) {
      return null;
    }

    return (
      data.session
        .access_token ??
      null
    );
  }

  const {
    data,
  } =
    await supabase.auth
      .getSession();

  const session =
    data.session;

  if (!session) {
    return null;
  }

  const expiresAtMs =
    session.expires_at
      ? session.expires_at *
        1_000
      : null;

  /*
   * Förnya redan innan token faktiskt
   * går ut. Då slipper vi att ett anrop
   * hamnar precis över gränsen.
   */
  if (
    expiresAtMs !== null &&
    expiresAtMs -
      Date.now() <
      60_000
  ) {
    const {
      data: refreshed,
      error,
    } =
      await supabase.auth
        .refreshSession();

    if (
      !error &&
      refreshed.session
    ) {
      return (
        refreshed.session
          .access_token ??
        null
      );
    }
  }

  return (
    session.access_token ??
    null
  );
}

export function installAuthenticatedWorkerFetch() {
  if (
    installed ||
    typeof window ===
      "undefined"
  ) {
    return;
  }

  installed = true;

  const originalFetch =
    window.fetch.bind(
      window,
    );

  const authenticatedFetch:
    typeof window.fetch =
      async (
        input,
        init,
      ) => {
        const target =
          new URL(
            inputUrl(input),
            window.location.href,
          );

        if (
          target.origin !==
          WORKER_ORIGIN
        ) {
          return originalFetch(
            input,
            init,
          );
        }

        const performRequest =
          async (
            token:
              string | null,
          ) => {
            const headers =
              mergedHeaders(
                input,
                init,
              );

            if (token) {
              headers.set(
                "Authorization",
                `Bearer ${token}`,
              );
            }

            if (
              input instanceof
              Request
            ) {
              return originalFetch(
                new Request(
                  input.clone(),
                  {
                    ...init,
                    headers,
                  },
                ),
              );
            }

            return originalFetch(
              input,
              {
                ...init,
                headers,
              },
            );
          };

        let token =
          await getFreshAccessToken();

        let response =
          await performRequest(
            token,
          );

        /*
         * Om workern ändå säger 401:
         * tvinga fram en ny Supabase-token
         * och försök exakt en gång till.
         */
        if (
          response.status ===
          401
        ) {
          const refreshedToken =
            await getFreshAccessToken(
              true,
            );

          if (
            refreshedToken
          ) {
            token =
              refreshedToken;

            response =
              await performRequest(
                token,
              );
          } else {
            /*
             * Ett tillfälligt 401/refresh-fel får
             * aldrig logga ut användaren automatiskt.
             * AuthGate/Supabase avgör sessionens
             * verkliga status separat.
             */
            console.warn(
              "Kunde inte förnya Worker-token. Behåller befintlig session.",
            );
          }
        }

        return response;
      };

  window.fetch =
    authenticatedFetch;
}
