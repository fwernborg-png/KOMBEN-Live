import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getBearerToken,
  isProtectedAppPath,
} from "./appAuthorization";

describe(
  "appbehörighet",
  () => {
    it(
      "läser bearer-token",
      () => {
        const request =
          new Request(
            "https://example.com/api/test",
            {
              headers: {
                Authorization:
                  "Bearer test-token",
              },
            },
          );

        expect(
          getBearerToken(
            request,
          ),
        ).toBe(
          "test-token",
        );
      },
    );

    it(
      "nekar tom eller felaktig auth-header",
      () => {
        expect(
          getBearerToken(
            new Request(
              "https://example.com",
            ),
          ),
        ).toBeNull();

        expect(
          getBearerToken(
            new Request(
              "https://example.com",
              {
                headers: {
                  Authorization:
                    "Basic abc",
                },
              },
            ),
          ),
        ).toBeNull();
      },
    );

    it(
      "skyddar appens Worker-rutter",
      () => {
        expect(
          isProtectedAppPath(
            "/atg/calendar/day/2026-08-04",
          ),
        ).toBe(true);

        expect(
          isProtectedAppPath(
            "/api/place-live/history",
          ),
        ).toBe(true);

        expect(
          isProtectedAppPath(
            "/run-now",
          ),
        ).toBe(true);

        expect(
          isProtectedAppPath(
            "/health",
          ),
        ).toBe(false);
      },
    );
  },
);
