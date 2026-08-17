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

async function getFreshAccessToken() {
  const {
    data,
    error,
  } =
    await supabase.auth
      .getSession();

  if (
    error ||
    !data.session
  ) {
    return null;
  }

  return (
    data.session.access_token ??
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
         * Worker-401 får aldrig försöka rotera eller
         * ändra användarens Supabase-session.
         * Supabase sköter token-refresh själv.
         */
        if (
          response.status ===
          401
        ) {
          console.warn(
            "Worker svarade 401. Befintlig Supabase-session lämnas orörd.",
          );
        }

        return response;
      };

  window.fetch =
    authenticatedFetch;
}
