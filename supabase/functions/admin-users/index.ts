import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown> | unknown[], status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getProfileUserId = (profile: Record<string, any>) => profile.user_id ?? profile.id;

async function isAdmin(adminClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

const randomPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") + "aA9!";
};

const normalizePlan = (value: unknown) => {
  const plan = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (!["gratis", "base", "pro", "business"].includes(plan)) throw new Error("Plano inválido.");
  return plan;
};

async function loadUsers(adminClient: ReturnType<typeof createClient>) {
  const authUsers: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    authUsers.push(...(data.users ?? []));
    if (!data.users || data.users.length < 1000) break;
  }

  const [profilesRes, integrationsRes, ordersRes, sessionsRes] = await Promise.all([
    adminClient.from("profiles").select("id,user_id,display_name,email,avatar_url,plano,created_at"),
    adminClient.from("user_integrations").select("user_id,platform").eq("platform", "mercadolivre"),
    adminClient.from("orders").select("user_id"),
    adminClient.from("user_sessions").select("user_id,last_seen_at").order("last_seen_at", { ascending: false }),
  ]);
  for (const result of [profilesRes, integrationsRes, ordersRes, sessionsRes]) {
    if (result.error) throw result.error;
  }

  const profiles = new Map<string, any>();
  for (const profile of profilesRes.data ?? []) profiles.set(getProfileUserId(profile), profile);
  const mlUsers = new Set((integrationsRes.data ?? []).map((item: any) => item.user_id));
  const orderCounts = new Map<string, number>();
  for (const order of ordersRes.data ?? []) {
    if (order.user_id) orderCounts.set(order.user_id, (orderCounts.get(order.user_id) ?? 0) + 1);
  }
  const lastSeen = new Map<string, string>();
  for (const session of sessionsRes.data ?? []) {
    if (session.user_id && !lastSeen.has(session.user_id)) lastSeen.set(session.user_id, session.last_seen_at);
  }

  return authUsers.map((authUser) => {
    const profile = profiles.get(authUser.id);
    const plan = profile?.plano ?? "gratis";
    const segment = plan === "gratis" ? "sem_plano" : "ativos";
    return {
      user_id: authUser.id,
      name: profile?.display_name ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? authUser.email ?? null,
      email: authUser.email ?? profile?.email ?? null,
      avatar_url: profile?.avatar_url ?? authUser.user_metadata?.avatar_url ?? null,
      plan,
      subscription_status: plan === "gratis" ? "inactive" : "active",
      segment,
      created_at: authUser.created_at || profile?.created_at || new Date().toISOString(),
      ml_connected: mlUsers.has(authUser.id),
      orders_count: orderCounts.get(authUser.id) ?? 0,
      last_seen_at: lastSeen.get(authUser.id) ?? null,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("DB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Configuração do servidor incompleta." }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida. Entre novamente." }, 401);
    if (!(await isAdmin(adminClient, userData.user.id))) return json({ error: "Acesso restrito a administradores." }, 403);

    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Parâmetros inválidos." }, 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "JSON inválido." }, 400);
    }

    if (body.action === "create") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      let plan: string;
      try { plan = normalizePlan(body.plan); } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Plano inválido." }, 400);
      }
      if (name.length < 2 || name.length > 120) return json({ error: "Informe o nome completo do cliente." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "E-mail inválido." }, 400);

      const password = randomPassword();
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name, created_by_admin: true },
      });
      if (createError || !created.user) {
        const message = createError?.message ?? "Não foi possível criar a conta.";
        return json({ error: message.includes("already been registered") ? "Este e-mail já possui uma conta." : message }, 400);
      }

      const { error: profileError } = await adminClient.from("profiles").upsert({
        user_id: created.user.id,
        email,
        display_name: name,
        plano: plan,
      }, { onConflict: "user_id" });

      if (profileError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }

      return json({ success: true, user_id: created.user.id, email, initial_password: password, plan });
    }

    if (body.action === "counts") {
      const users = await loadUsers(adminClient);
      const counts = { todos: users.length, online: 0, ativos: 0, risco: 0, vencida: 0, sem_plano: 0 };
      const onlineCutoff = Date.now() - 2 * 60 * 1000;
      for (const user of users) {
        if (user.last_seen_at && new Date(user.last_seen_at).getTime() >= onlineCutoff) counts.online++;
        if (user.segment === "sem_plano") counts.sem_plano++;
        else counts.ativos++;
      }
      return json(counts);
    }

    if (Array.isArray(body.user_ids)) {
      const ids = body.user_ids.filter((id): id is string => typeof id === "string");
      if (!ids.length || ids.length > 2000 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: "IDs inválidos." }, 400);
      const authUsers: any[] = [];
      const found = await Promise.all(ids.map(async (id) => {
        const { data } = await adminClient.auth.admin.getUserById(id);
        return data?.user ?? null;
      }));
      authUsers.push(...found.filter(Boolean));
      const users = await loadUsers(adminClient);
      const wanted = new Set(authUsers.map((user) => user.id));
      return json(users.filter((user) => wanted.has(user.user_id)));
    }

    const page = Number(body.page ?? 1);
    const size = Number(body.size ?? 25);
    const search = typeof body.search === "string" ? body.search.trim().toLowerCase() : "";
    const tab = typeof body.tab === "string" ? body.tab : "ativos";
    if (!Number.isInteger(page) || page < 1 || page > 1000000) return json({ error: "Página inválida." }, 400);
    if (![10, 25, 50].includes(size)) return json({ error: "Tamanho de página inválido." }, 400);
    if (search.length > 200) return json({ error: "Busca inválida." }, 400);
    if (!["ativos", "risco", "vencida", "sem_plano", "todos"].includes(tab)) return json({ error: "Filtro inválido." }, 400);

    let users = await loadUsers(adminClient);
    if (search) users = users.filter((user) => String(user.name ?? "").toLowerCase().includes(search) || String(user.email ?? "").toLowerCase().includes(search));
    if (tab !== "todos") users = users.filter((user) => user.segment === tab);
    users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = users.length;
    const start = (page - 1) * size;
    return json({ users: users.slice(start, start + size), total, page, size });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin-users] error:", message);
    return json({ error: message || "Erro interno ao carregar usuários." }, 500);
  }
});
