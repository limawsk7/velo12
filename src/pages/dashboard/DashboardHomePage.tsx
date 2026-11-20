import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgePercent, Check, LayoutTemplate, PlayCircle, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAtlasChat } from "@/contexts/AtlasChatContext";
import { useAuth } from "@/contexts/AuthContext";
import AtlasHistoryMenu from "@/components/dashboard/AtlasHistoryMenu";
import { getPremiumActionButtonStyle } from "@/components/PremiumActionButton";
import AtlasAvatarIcon from "@/components/dashboard/AtlasAvatarIcon";
import { ENTRADA_POS_ONBOARDING, hasPlayedDashboardIntro, markDashboardIntroAsPlayed } from "@/lib/dashboardIntro";
import { ONBOARDING_COMPLETED_EVENT, shouldShowOnboarding } from "@/components/onboarding/OnboardingModal";
import { veloToast } from "@/components/ui/velo-toast";
import { supabase } from "@/integrations/supabase/client";
import { startMercadoLivreOAuth } from "@/lib/mercadoLivreOAuth";
import dashboardHomeBase from "@/assets/dashboard-home-base.png";
import mercadoLivreLogo from "@/assets/mercado-livre-logo.png.asset.json";
import MobileHome from "@/components/dashboard/MobileHome";
import VideoTutorialModal from "@/components/dashboard/VideoTutorialModal";
import { Button } from "@/components/ui/button";

import { useIsMobile } from "@/hooks/use-mobile";

type AtlasMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  product_data?: AtlasMessageData | null;
};

type AtlasNavigationAction = {
  type: "navigation";
  label: string;
  route: string;
  /** "primary" usa o Botão Pilot (fundo escuro sólido). */
  variant?: "primary";
  reason?: string;
};

type AtlasProductCardAction = {
  type: "product_card";
  product_id: string;
  reason?: string;
  product?: {
    id?: string;
    title?: string;
    image_url?: string | null;
    margin_percent?: number | null;
    suggested_price?: number | null;
    route?: string;
  };
};

type AtlasQuickReplyAction = {
  type: "quick_reply";
  label: string;
  message: string;
};

type AtlasConnectMlAction = {
  type: "connect_ml";
  label: string;
};

type AtlasAction =
  | AtlasNavigationAction
  | AtlasProductCardAction
  | AtlasQuickReplyAction
  | AtlasConnectMlAction;

type AtlasMessageData = {
  actions?: AtlasAction[];
};

type OnboardingStatus = {
  mlConnected: boolean;
  hasPublication: boolean;
};

const IMAGE_WIDTH = 1536;
const CONTENT_SLICE_TOP = 300;
const CONTENT_OFFSET = 100;
const HERO_OFFSET = 45;
const CHAT_SUGGESTIONS = [
  "Crie um anúncio de produto",
  "Ajude-me a encontrar produtos",
  "Ajude-me a começar",
  "Gere imagens para um produto",
  "Escreva uma descrição de produto",
  "Ajude-me a encontrar uma ideia de negócio",
];
const CHAT_PROMPT_SUGGESTIONS = [
  "Ajude-me a começar",
  "Encontre produtos vencedores",
  "Crie um anúncio para meu produto",
  "Gere imagens para meu produto",
  "Escreva uma descrição persuasiva",
  "Me dê uma ideia de negócio",
];

const TUTORIAL_INICIO = {
  src: "https://player.vimeo.com/video/1226153949?badge=0&autopause=0&player_id=0&app_id=58479",
  aspectPadding: "62.5%",
  title: "Tutorial de início",
  description: "Veja como dar os primeiros passos na Velo.",
} as const;

// Coreografia da introdução, em segundos. Os blocos entram enquanto o título ainda
// está subindo: a sobreposição é o que faz a sequência ler como um movimento só,
// em vez de uma fila de elementos esperando a vez.
const INTRO = {
  // Desaceleração suave, sem a cauda longa do ease-out exponencial.
  travelEase: [0.32, 0.72, 0, 1] as const,
  revealEase: [0.22, 1, 0.36, 1] as const,
  titleFade: 0.66,
  titleTravelDelay: 0.56,
  titleTravel: 1.05,
  revealDuration: 0.9,
  // O chat vem logo depois do título; o atalho do tutorial entra junto dos cards.
  chatDelay: 1.28,
  promoDelay: 1.5,
  // As faixas são o que descobre os cards de baixo: é aqui que mais se percebia
  // a pressa. Fade mais longo e mais espaço entre elas, para revelarem em cascata
  // em vez de quase juntas.
  bandDuration: 1,
  bandDelays: [1.4, 1.68, 1.96],
};

// Todo o layout desta tela é dimensionado em cqw (relativo à largura do
// container), então sem um teto ele cresce junto com o monitor e no desktop
// fica desproporcional. Travamos a largura do canvas: acima disso o conteúdo
// para de inflar e apenas ganha margem lateral (do mesmo #F5F4F1 do fundo).
// Abaixo desse valor o comportamento responsivo continua exatamente o mesmo.
// Este é o único número a mexer para calibrar a escala geral da página.
const MAX_CANVAS_WIDTH = 1280;

const x = (value: number) => `${(value / IMAGE_WIDTH) * 100}%`;
const y = (value: number) => `${(value / IMAGE_WIDTH) * 100}cqw`;
const fs = (value: number) => `${(value / IMAGE_WIDTH) * 100}cqw`;

const AssistantAvatar = () => (
  <AtlasAvatarIcon style={{ display: "block", width: "100%", height: "100%" }} />
);

const AnimatedPromptText = ({
  text,
  reduceMotion,
}: {
  text: string;
  reduceMotion: boolean;
}) => {
  const containerVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: {
          opacity: 1,
          transition: { staggerChildren: 0.008, staggerDirection: -1 },
        },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.012 },
        },
      };
  const letterVariants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, filter: "blur(5px)" },
        visible: { opacity: 1, filter: "blur(0px)" },
      };

  return (
    <motion.span
      aria-hidden="true"
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={containerVariants}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        color: "rgba(0,0,0,0.56)",
        fontSize: fs(18),
        fontWeight: 400,
        lineHeight: 1,
        overflow: "hidden",
        pointerEvents: "none",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        willChange: "opacity, filter",
      }}
    >
      {Array.from(text).map((letter, index) => (
        <motion.span
          key={`${text}-${index}`}
          variants={letterVariants}
          transition={{
            duration: reduceMotion ? 0.14 : 0.22,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ display: "inline-block", whiteSpace: letter === " " ? "pre" : "normal" }}
        >
          {letter}
        </motion.span>
      ))}
    </motion.span>
  );
};

const isAtlasAction = (action: unknown): action is AtlasAction => {
  if (!action || typeof action !== "object") return false;
  const candidate = action as Record<string, unknown>;
  if (candidate.type === "navigation") {
    return typeof candidate.label === "string" && typeof candidate.route === "string";
  }
  if (candidate.type === "product_card") {
    return typeof candidate.product_id === "string";
  }
  if (candidate.type === "quick_reply") {
    return typeof candidate.label === "string" && typeof candidate.message === "string";
  }
  if (candidate.type === "connect_ml") {
    return typeof candidate.label === "string";
  }
  return false;
};

const normalizeAtlasActions = (value: unknown): AtlasAction[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isAtlasAction).slice(0, 12);
};

const DashboardHomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    enviar: enviarParaAtlas,
    mensagens: chatMessages,
    threadId,
    abrirConversa,
    aoApagarConversa,
  } = useAtlasChat();
  const reduceMotion = useReducedMotion();
  const introDecisionMade = useRef<string | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const welcomeChatRef = useRef<HTMLDivElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  // "waiting": o onboarding está na frente da home. A intro fica guardada para
  // tocar quando ele fecha — antes ela rodava escondida atrás do modal e a pessoa
  // caía numa tela já parada.
  const [introState, setIntroState] = useState<"pending" | "waiting" | "play" | "done">("pending");
  const [chatActive, setChatActive] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);

  /**
   * Existe conversa anterior para mostrar no histórico?
   *
   * A contagem é de mensagens, não de threads, de propósito: abrir o chat em
   * tela cheia cria uma thread vazia, e uma lista só de "Nova conversa" não é
   * histórico nenhum. Se a pessoa já escreveu alguma coisa, aí sim tem o que
   * reabrir. Só consulta quando o chat abre — antes disso o botão nem existe.
   */
  const { data: temHistorico = false } = useQuery({
    queryKey: ["atlas-tem-historico", user?.id],
    enabled: Boolean(user?.id) && chatActive,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("atlas_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      return (count ?? 0) > 0;
    },
  });
  const [conectandoMl, setConectandoMl] = useState(false);
  
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  // Inicia o OAuth do Mercado Livre a partir do próprio chat. O helper só
  // redireciona para auth.mercadolivre.com, então uma resposta adulterada da
  // função não consegue mandar o usuário para outro domínio.
  const conectarMercadoLivre = async () => {
    if (conectandoMl) return;
    setConectandoMl(true);
    try {
      // Nova aba: o guia do Atlas continua aberto enquanto o usuário conecta.
      await startMercadoLivreOAuth({ novaAba: true });
      setConectandoMl(false);
    } catch (erro) {
      setConectandoMl(false);
      veloToast.error(erro instanceof Error ? erro.message : "Não foi possível abrir a conexão com o Mercado Livre");
    }
  };

  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(null);
  const [promptSuggestionIndex, setPromptSuggestionIndex] = useState(0);

  useLayoutEffect(() => {
    const userId = user?.id;
    if (!userId || introDecisionMade.current === userId) return;

    // Decidido uma vez por montagem/usuário: navegar dentro do app e voltar para a
    // home não repete a introdução, mas recarregar o site ou reentrar na conta sim.
    introDecisionMade.current = userId;

    if (user && shouldShowOnboarding(user)) {
      setIntroState("waiting");
      return;
    }

    const shouldPlay = !reduceMotion && !hasPlayedDashboardIntro(userId);
    if (shouldPlay) markDashboardIntroAsPlayed(userId);

    setIntroState(shouldPlay ? "play" : "done");
  }, [reduceMotion, user]);

  useEffect(() => {
    if (introState !== "waiting" || !user?.id) return;
    const userId = user.id;
    let timer: number | undefined;
    const aoConcluirOnboarding = () => {
      // Espera o modal começar a desbotar para a home entrar por baixo dele.
      timer = window.setTimeout(() => {
        markDashboardIntroAsPlayed(userId);
        setIntroState(reduceMotion ? "done" : "play");
      }, reduceMotion ? 0 : ENTRADA_POS_ONBOARDING.homeStart * 1000);
    };
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, aoConcluirOnboarding);
    return () => {
      window.removeEventListener(ONBOARDING_COMPLETED_EVENT, aoConcluirOnboarding);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [introState, reduceMotion, user?.id]);

  useEffect(() => {
    if (!chatActive) return;

    const focusTimer = window.setTimeout(() => chatInputRef.current?.focus(), reduceMotion ? 0 : 180);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && chatMessages.length === 0) {
        setChatActive(false);
        setChatInput("");
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [chatActive, chatMessages.length, reduceMotion]);

  useEffect(() => {
    if (!chatActive || chatMessages.length > 0) return;

    const closeWelcomeChat = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        welcomeChatRef.current?.contains(target) ||
        historyMenuRef.current?.contains(target) ||
        suggestionListRef.current?.contains(target)
      ) return;

      setChatActive(false);
      setChatInput("");
      setHoveredSuggestion(null);
      chatInputRef.current?.blur();
    };

    window.addEventListener("pointerdown", closeWelcomeChat);
    return () => window.removeEventListener("pointerdown", closeWelcomeChat);
  }, [chatActive, chatMessages.length]);

  useEffect(() => {
    if (chatActive || chatInput.trim()) return;

    const suggestionTimer = window.setInterval(() => {
      setPromptSuggestionIndex((current) => (current + 1) % CHAT_PROMPT_SUGGESTIONS.length);
    }, 2600);

    return () => window.clearInterval(suggestionTimer);
  }, [chatActive, chatInput]);

  useEffect(() => {
    if (!user?.id) {
      setOnboardingStatus(null);
      return;
    }

    let cancelled = false;

    const loadOnboardingStatus = async () => {
      const [integrationResult, publicationsResult] = await Promise.all([
        supabase
          .from("user_integrations")
          .select("id,access_token")
          .eq("user_id", user.id)
          .eq("platform", "mercadolivre")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("user_publications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      if (cancelled) return;

      if (integrationResult.error || publicationsResult.error) {
        setOnboardingStatus(null);
        return;
      }

      setOnboardingStatus({
        mlConnected: Boolean(integrationResult.data?.access_token),
        hasPublication: (publicationsResult.count ?? 0) > 0,
      });
    };

    void loadOnboardingStatus();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const scrollArea = conversationScrollRef.current;
    if (!scrollArea) return;
    if (scrollArea.scrollHeight <= scrollArea.clientHeight) return;

    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: "auto",
    });
  }, [chatMessages.length]);

  const playIntro = introState === "play";
  const introTitleOffset = typeof window === "undefined"
    ? 240
    : Math.max(190, Math.min(window.innerHeight * 0.3, 300));
  // O blur de saída suaviza o fade: sem ele a opacidade sozinha lê como um "liga/desliga".
  const revealProps = (delay: number, distance = 12) => playIntro
    ? {
        initial: { opacity: 0, y: distance, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        transition: { delay, duration: INTRO.revealDuration, ease: INTRO.revealEase },
      }
    : {
        // Sem introdução não há blur a desfazer — evita criar camada de composição à toa.
        initial: false as const,
        animate: { opacity: 1, y: 0 },
      };

  const go = (path: string) => () => navigate(path);
  const onboardingProgress = onboardingStatus
    ? Math.round(
        ([onboardingStatus.mlConnected, onboardingStatus.hasPublication].filter(Boolean).length / 2) * 100,
      )
    : null;
  const nextStepCopy = !onboardingStatus
    ? "Consulte suas integrações e continue a configuração da sua conta."
    : !onboardingStatus.mlConnected
      ? "Conecte o Mercado Livre para publicar produtos e receber seus pedidos na Velo."
      : !onboardingStatus.hasPublication
        ? "Sua conta está conectada. Agora escolha um produto e faça a primeira publicação."
        : "Tudo pronto: acompanhe seus anúncios publicados e continue expandindo o catálogo.";
  const nextStepLabel = !onboardingStatus
    ? "Ver integrações"
    : !onboardingStatus.mlConnected
      ? "Conectar agora"
      : !onboardingStatus.hasPublication
        ? "Escolher produto"
        : "Ver publicações";
  const handleNextStep = () => {
    if (!onboardingStatus) {
      // Este passo é sobre o Mercado Livre, que mora nas configurações —
      // /dashboard/integracoes é a tela de lojas Shopify.
      navigate("/dashboard/configuracoes?tab=Integrações");
      return;
    }
    if (!onboardingStatus.mlConnected) {
      void conectarMercadoLivre();
      return;
    }
    navigate(onboardingStatus.hasPublication ? "/dashboard/publicacoes" : "/dashboard/catalogo");
  };
  // Toda a conversa (mensagens, ações, envio) vive no AtlasChatProvider e é
  // desenhada pelo AtlasDockPanel. Aqui sobrou só disparar a primeira mensagem.
  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chatActive) {
      setChatActive(true);
      return;
    }
    const texto = chatInput.trim();
    if (!texto) return;
    setChatInput("");
    void enviarParaAtlas(texto);
  };

  const textStyle = (
    left: number,
    top: number,
    size: number,
    width?: number,
    extra?: CSSProperties,
  ): CSSProperties => ({
    position: "absolute",
    left: x(left),
    top: y(top),
    width: width ? x(width) : undefined,
    fontSize: fs(size),
    ...extra,
  });

  const buttonStyle = (
    left: number,
    top: number,
    width: number,
    height: number,
    size: number,
    extra?: CSSProperties,
  ): CSSProperties => ({
    position: "absolute",
    left: x(left),
    top: y(top),
    width: x(width),
    height: y(height),
    border: 0,
    background: "transparent",
    cursor: "pointer",
    fontSize: fs(size),
    display: "flex",
    alignItems: "center",
    lineHeight: 1,
    padding: 0,
    ...extra,
  });


  const welcomeScreen = (
    <main className="-m-5 sm:-m-6 lg:-m-7 flex min-h-[calc(100dvh-4rem)] w-auto flex-1 items-center justify-center overflow-y-auto bg-[#090B10] px-5 py-16 text-[#F3F4F6]">
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-8 text-center">
        <motion.div
          initial={playIntro ? { opacity: 0, y: 18, filter: "blur(5px)" } : false}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: playIntro ? 0.75 : 0, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-3"
        >
          <p className="text-sm font-medium tracking-[0.12em] text-[#8B95A7] uppercase">
            Bem-vindo à Fornece Cloud
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">
            Por onde você quer começar?
          </h1>
        </motion.div>

        <motion.div
          ref={welcomeChatRef}
          data-dashboard-tour="home-atlas-chat"
          role="search"
          aria-label="Assistente de IA"
          aria-expanded={chatActive}
          onClick={() => setChatActive(true)}
          initial={playIntro ? { opacity: 0, y: 14 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: playIntro ? 0.18 : 0, duration: playIntro ? 0.7 : 0, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-white/[0.10] bg-[#11151F] px-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)] transition-colors focus-within:border-blue-500/60 sm:px-5"
        >
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1D293B] p-1.5">
            <AssistantAvatar />
          </span>
          <form onSubmit={handleChatSubmit} className="flex min-w-0 flex-1 items-center">
            <input
              ref={chatInputRef}
              value={chatInput}
              onFocus={() => setChatActive(true)}
              onChange={(event) => setChatInput(event.target.value)}
              aria-label="Mensagem para a IA"
              placeholder="Digite aqui para conversar com a IA..."
              className="h-12 w-full min-w-0 border-0 bg-transparent text-[15px] text-white outline-none placeholder:text-[#7D8798] focus:ring-0 sm:text-base"
            />
          </form>
          <button
            type="button"
            aria-label="Enviar mensagem"
            disabled={!chatInput.trim()}
            onClick={(event) => {
              event.stopPropagation();
              const texto = chatInput.trim();
              if (!texto) return;
              setChatInput("");
              void enviarParaAtlas(texto);
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-[#252D3A] disabled:text-[#687386]"
          >
            <ArrowRight size={19} strokeWidth={2.2} />
          </button>
        </motion.div>
        <p className="text-xs text-[#697386]">Sua assistente está pronta para ajudar.</p>
      </div>
    </main>
  );

  if (introState === "pending" || introState === "waiting") {
    return <main aria-hidden="true" className="-m-5 sm:-m-6 lg:-m-7 min-h-[calc(100dvh-4rem)] bg-[#090B10]" />;
  }

  return welcomeScreen;
};

// No celular a home volta ao estilo marketplace (busca, categorias e grade de
// produtos), mais simples e direto do que o painel de onboarding do desktop.
const DashboardHomeRoute = () => {
  const isMobile = useIsMobile();

  if (isMobile) return <MobileHome />;

  return <DashboardHomePage />;
};

export default DashboardHomeRoute;
