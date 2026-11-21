import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  let appUrl = (
    Deno.env.get("VITE_PUBLIC_APP_URL") ||
    Deno.env.get("PUBLIC_APP_URL") ||
    Deno.env.get("APP_URL") ||
    "https://velo-web-production-10c44cdf.up.railway.app"
  ).replace(/\\/+$/, "");
  const dashboardUrl = `${appUrl}/dashboard/configuracoes`;

  // O Mercado Livre pode devolver error/error_description sem code/state.
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  const oauthErrorSubtype = url.searchParams.get("error_subtype");
  const oauthErrorUri = url.searchParams.get("error_uri");

  console.log("[ml-callback] retorno iniciado", {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasOauthError: Boolean(oauthError),
    queryKeys: [...url.searchParams.keys()],
  });

  if (oauthError) {
    console.warn("[ml-callback] erro OAuth retornado pelo Mercado Livre", {
      error: oauthError.slice(0, 120),
      error_subtype: oauthErrorSubtype?.slice(0, 120) ?? null,
      error_description: oauthErrorDescription?.slice(0, 300) ?? null,
      error_uri: oauthErrorUri?.slice(0, 300) ?? null,
    });
    const params = new URLSearchParams({
      ml_error: "authorization_denied",
      ml_error_code: oauthError.slice(0, 120),
    });
    if (oauthErrorDescription) params.set("ml_error_description", oauthErrorDescription.slice(0, 300));
    if (oauthErrorSubtype) params.set("ml_error_subtype", oauthErrorSubtype.slice(0, 120));
    return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?${params.toString()}` } });
  }

  if (!code || !state) {
    console.error("[ml-callback] retorno sem parâmetros OAuth", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      queryKeys: [...url.searchParams.keys()],
    });
    return new Response(null, {
      status: 302,
      headers: { Location: `${dashboardUrl}?ml_error=missing_params` },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const dbUrl = Deno.env.get("DB_URL") ?? supabaseUrl;
  const dbKey = Deno.env.get("DB_SERVICE_ROLE_KEY") ?? serviceRoleKey;
  const supabase = createClient(dbUrl, dbKey);

  const { data: oauthState, error: stateError } = await supabase
    .from("ml_oauth_states")
    .select("state,user_id,expires_at,consumed_at")
    .eq("state", state)
    .maybeSingle();

  if (stateError || !oauthState || oauthState.consumed_at || new Date(oauthState.expires_at).getTime() <= Date.now()) {
    console.error("[ml-callback] invalid state:", stateError?.message ?? "state ausente, consumido ou expirado");
    return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?ml_error=invalid_state` } });
  }

  const { error: consumeError } = await supabase
    .from("ml_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state)
    .is("consumed_at", null);

  if (consumeError) {
    console.error("[ml-callback] state consume error:", consumeError.message);
    return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?ml_error=invalid_state` } });
  }

  let tokens: Record<string, any>;
  try {
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: Deno.env.get("ML_CLIENT_ID")!,
        client_secret: Deno.env.get("ML_CLIENT_SECRET")!,
        code,
        redirect_uri: Deno.env.get("ML_REDIRECT_URI")!,
      }),
    });
    tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("[ml-callback] falha na troca do token", {
        status: tokenRes.status,
        error: tokens?.error ?? null,
        message: tokens?.message ?? null,
        cause: Array.isArray(tokens?.cause) ? tokens.cause.slice(0, 3) : null,
      });
      return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?ml_error=token_failed` } });
    }
  } catch (err) {
    console.error("[ml-callback] erro de rede na troca do token", String(err));
    return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?ml_error=token_failed` } });
  }

  if (!tokens?.access_token) {
    console.error("[ml-callback] resposta de token sem access_token", {
      error: tokens?.error ?? null,
      message: tokens?.message ?? null,
    });
    return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?ml_error=token_failed` } });
  }

  let nickname: string | null = null;
  try {
    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      nickname = typeof me?.nickname === "string" ? me.nickname : null;
    }
  } catch (err) {
    console.warn("[ml-callback] users/me falhou", String(err));
  }

  const { error } = await supabase.from("user_integrations").upsert(
    {
      user_id: oauthState.user_id,
      platform: "mercadolivre",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      ml_user_id: tokens.user_id ?? null,
      ml_nickname: nickname,
      ml_nickname_updated_at: nickname ? new Date().toISOString() : null,
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 21600) * 1000).toISOString(),
      refresh_failed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform" }
  );

  if (error) {
    console.error("[ml-callback] Supabase upsert error:", error.message);
    return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?ml_error=db_failed` } });
  }

  console.log("[ml-callback] conexão concluída", { user_id: oauthState.user_id, ml_user_id: tokens.user_id ?? null });
  return new Response(null, { status: 302, headers: { Location: `${dashboardUrl}?ml_connected=true` } });
});
