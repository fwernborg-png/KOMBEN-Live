import type {
  SupabaseClient,
} from "@supabase/supabase-js";

export type AppAuthorizationResult =
  | {
      ok: true;
      userId: string;
      email: string;
    }
  | {
      ok: false;
      status: 401 | 503;
      error: string;
    };

export function getBearerToken(
  request: Request,
) {
  const authorization =
    request.headers.get(
      "Authorization",
    );

  if (!authorization) {
    return null;
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  const token =
    match?.[1]?.trim() ??
    "";

  return token ||
    null;
}

export function isProtectedAppPath(
  pathname: string,
) {
  return (
    pathname === "/atg" ||
    pathname.startsWith(
      "/atg/",
    ) ||
    pathname === "/api" ||
    pathname.startsWith(
      "/api/",
    ) ||
    pathname === "/run-now"
  );
}

export async function authorizeAppRequest(
  args: {
    request: Request;
    supabase: SupabaseClient;
  },
): Promise<AppAuthorizationResult> {
  const {
    request,
    supabase,
  } = args;

  const token =
    getBearerToken(request);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error:
        "Inloggning krävs",
    };
  }

  const {
    data,
    error,
  } =
    await supabase.auth
      .getUser(token);

  const email =
    data.user?.email
      ?.trim()
      .toLowerCase() ??
    "";

  if (
    error ||
    !data.user ||
    !email
  ) {
    return {
      ok: false,
      status: 401,
      error:
        "Ogiltig eller utgången inloggning",
    };
  }

  const {
    data: allowedUser,
    error: allowedUserError,
  } =
    await supabase
      .from(
        "app_allowed_users",
      )
      .select(
        "email,active",
      )
      .eq(
        "email",
        email,
      )
      .eq(
        "active",
        true,
      )
      .maybeSingle();

  if (allowedUserError) {
    console.warn(
      "Could not verify app access:",
      allowedUserError.message,
    );

    return {
      ok: false,
      status: 503,
      error:
        "Behörighetskontrollen är tillfälligt otillgänglig",
    };
  }

  if (!allowedUser) {
    return {
      ok: false,
      status: 401,
      error:
        "Kontot saknar åtkomst",
    };
  }

  return {
    ok: true,
    userId:
      data.user.id,
    email,
  };
}
