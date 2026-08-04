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

export function installAuthenticatedWorkerFetch() {
  if (
    installed ||
    typeof window === "undefined"
  ) {
    return;
  }

  installed = true;

  const originalFetch =
    window.fetch.bind(window);

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

        const {
          data,
        } =
          await supabase.auth
            .getSession();

        const token =
          data.session
            ?.access_token;

        if (!token) {
          return originalFetch(
            input,
            init,
          );
        }

        const headers =
          mergedHeaders(
            input,
            init,
          );

        headers.set(
          "Authorization",
          `Bearer ${token}`,
        );

        if (
          input instanceof Request
        ) {
          return originalFetch(
            new Request(
              input,
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

  window.fetch =
    authenticatedFetch;
}
