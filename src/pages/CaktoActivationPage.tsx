import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Mail, UserRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VeloLogo } from "@/components/VeloLogo";

const CaktoActivationPage = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [actionLink, setActionLink] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setExistingAccount(false);
    setLoading(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("cakto-activation", {
        body: { name: name.trim(), email: email.trim().toLowerCase() },
      });

      if (invokeError || data?.error) {
        const code = data?.code;
        if (code === "ACCOUNT_ALREADY_EXISTS" || code === "ALREADY_ACTIVATED") {
          setExistingAccount(true);
        }
        throw new Error(data?.error || invokeError?.message || "Não foi possível validar sua compra.");
      }

      if (!data?.actionLink) throw new Error("Não recebemos o link seguro de ativação. Tente novamente.");
      setSelectedPlan(data.plan || "");
      setActionLink(data.actionLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07090e] px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-blue-600/[0.13] blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-260px] right-[-100px] h-[440px] w-[440px] rounded-full bg-violet-600/[0.10] blur-[120px]" />

      <section className="relative z-10 w-full max-w-[470px] rounded-[28px] border border-white/[0.09] bg-[#10141d]/95 p-7 shadow-[0_32px_100px_rgba(0,0,0,0.55)] sm:p-10">
        <div className="mb-9 flex justify-center">
          <VeloLogo size="lg" variant="light" />
        </div>

        {actionLink ? (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <CheckCircle2 size={27} />
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Compra localizada</p>
            <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-white">Seu acesso está quase pronto.</h1>
            <p className="mx-auto mt-3 max-w-[340px] text-sm leading-6 text-white/55">
              {selectedPlan ? `Confirmamos sua compra do plano ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}.` : "Confirmamos sua compra."} Continue para criar uma senha pessoal e acessar sua conta.
            </p>
            <button
              type="button"
              onClick={() => {
                try { window.sessionStorage.setItem("cakto_activation_flow", "1"); } catch { /* storage indisponível */ }
                window.location.assign(actionLink);
              }}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#397eea] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#4c8df5]"
            >
              Criar minha senha <ArrowRight size={17} />
            </button>
            <p className="mt-4 text-xs leading-5 text-white/35">O link de segurança é individual e expira após um período limitado.</p>
          </div>
        ) : (
          <>
            <div className="mb-7 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10 text-blue-300">
                <ShieldCheck size={27} />
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300">Fornece Cloud</p>
              <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-white">Ative seu acesso</h1>
              <p className="mx-auto mt-3 max-w-[350px] text-sm leading-6 text-white/50">
                Informe seu nome e o e-mail utilizado na compra. Vamos localizar seu pagamento aprovado e liberar a criação da senha.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-xs font-medium text-white/65"><UserRound size={14} /> Seu nome completo</span>
                <input
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como podemos te chamar?"
                  className="w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-blue-400/50 focus:bg-white/[0.055]"
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-xs font-medium text-white/65"><Mail size={14} /> E-mail usado na compra</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@email.com"
                  className="w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-blue-400/50 focus:bg-white/[0.055]"
                />
              </label>

              {error ? (
                <div className="rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-xs leading-5 text-red-200">
                  {error}
                  {existingAccount ? (
                    <Link to="/login" state={{ email }} className="mt-2 block font-semibold text-white underline underline-offset-4">
                      Ir para o login
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || !name.trim() || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#397eea] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#4c8df5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Verificando compra...</> : <>Verificar e continuar <ArrowRight size={17} /></>}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <LockKeyhole size={16} className="mt-0.5 shrink-0 text-white/40" />
              <p className="text-[11px] leading-5 text-white/40">
                Seus dados são usados apenas para localizar a compra. A senha é definida em uma etapa protegida do Supabase e não é exibida nem enviada por e-mail.
              </p>
            </div>
          </>
        )}

        <div className="mt-8 border-t border-white/[0.07] pt-5 text-center">
          <Link to="/login" className="text-xs font-medium text-white/45 transition hover:text-white/80">Já tem acesso? Entrar na plataforma</Link>
        </div>
      </section>
    </main>
  );
};

export default CaktoActivationPage;
