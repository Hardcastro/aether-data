"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Grupo, GrupoInfo, Peca } from "@/lib/manifesto";
import { pecasPorGrupo, posicaoMundo } from "@/lib/manifesto";
import {
  clampZoom,
  enquadrar,
  transformDoMundo,
  zoomEmTornoDoCursor,
  type Camera,
} from "@/lib/camera";
import { faseDoSlug } from "@/lib/hash";
import { flutuacao, passoMagnetismo, passoParallaxeBarra, type OffsetTela } from "@/lib/movimento";
import { useMatchMedia, useModoPlano } from "@/lib/useMatchMedia";
import { Cartao } from "@/components/Cartao";
import { BarraControles } from "@/components/BarraControles";
import { PainelPeca } from "@/components/PainelPeca";

type GsapInstance = typeof import("gsap")["gsap"];
type GsapTween = ReturnType<GsapInstance["to"]>;

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const QUERY_REDUZIDO = "(prefers-reduced-motion: reduce)";
const LIMIAR_ARRASTO = 4;
const IDLE_MS = 2000;

type MotionState = {
  faseOffset: number;
  periodo: number;
  magnet: OffsetTela;
  scaleRecuo: { v: number };
  scaleEntrada: { v: number };
};

type Props = {
  pecas: Peca[];
  grupos: GrupoInfo[];
  pecaAberta: Peca | null;
  contato: { email: string | null; whatsapp: string | null };
};

/**
 * Posição de mundo do título de um grupo — acima-esquerda do bloco de
 * cartões, com folga fixa (não escalada por FATOR_ESCALA_MUNDO) reservada
 * para até duas linhas de título + apoio.
 */
function posicaoGrupo(pecasDoGrupo: Peca[]) {
  const posicoes = pecasDoGrupo.map(posicaoMundo);
  const minX = Math.min(...posicoes.map((p) => p.x));
  const minY = Math.min(...posicoes.map((p) => p.y));
  return { x: minX - 8, y: minY - 140 };
}

export function Plano({ pecas, grupos, pecaAberta, contato }: Props) {
  const router = useRouter();

  const modoPlano = useModoPlano();
  const reduzido = useMatchMedia(QUERY_REDUZIDO);
  const modo: "lista" | "plano" = modoPlano ? "plano" : "lista";

  const [grupoAtivo, setGrupoAtivo] = useState<Grupo | null>(null);
  const [pecaExibida, setPecaExibida] = useState<Peca | null>(pecaAberta);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mundoRef = useRef<HTMLDivElement | null>(null);
  const barraRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null);
  const painelRef = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef<Map<string, HTMLAnchorElement>>(new Map());

  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const motionRef = useRef<Map<string, MotionState>>(new Map());
  const cursorRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const barraOffsetRef = useRef<OffsetTela>({ x: 0, y: 0 });
  const suprimidoRef = useRef<Set<string>>(new Set());
  const painelAbertoRef = useRef(false);
  const origemFocoRef = useRef<string | null>(null);

  const dragRef = useRef({
    ativo: false,
    ponteiroId: -1,
    inicioX: 0,
    inicioY: 0,
    camInicioX: 0,
    camInicioY: 0,
    arrastou: false,
  });
  const pinchRef = useRef<{
    ativo: boolean;
    distInicio: number;
    kInicio: number;
    ponteiros: Map<number, { x: number; y: number }>;
  }>({ ativo: false, distInicio: 0, kInicio: 1, ponteiros: new Map() });

  const rafRef = useRef<number | null>(null);
  const ultimaAtividadeRef = useRef(0);
  const gsapRef = useRef<GsapInstance | null>(null);
  const cameraTweenRef = useRef<GsapTween | null>(null);

  // Fase/período de flutuação de cada peça — determinístico, uma vez só.
  useEffect(() => {
    for (const p of pecas) {
      if (!motionRef.current.has(p.slug)) {
        const { offset, periodo } = faseDoSlug(p.slug);
        motionRef.current.set(p.slug, {
          faseOffset: offset,
          periodo,
          magnet: { x: 0, y: 0 },
          scaleRecuo: { v: 1 },
          scaleEntrada: { v: 1 },
        });
      }
    }
  }, [pecas]);

  useEffect(() => {
    setPecaExibida(pecaAberta);
  }, [pecaAberta]);

  const registrarCardEl = useCallback((slug: string, el: HTMLAnchorElement | null) => {
    if (el) cardEls.current.set(slug, el);
    else cardEls.current.delete(slug);
  }, []);

  const marcarAtividade = useCallback(() => {
    ultimaAtividadeRef.current = performance.now();
    if (rafRef.current === null && modo === "plano") {
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const tick = useCallback(
    (agora: number) => {
      const viewport = viewportRef.current;
      const mundo = mundoRef.current;
      if (!viewport || !mundo) {
        rafRef.current = null;
        return;
      }
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const cam = camRef.current;
      const { tx, ty, k } = transformDoMundo(cam, vw, vh);
      mundo.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;

      const painelAberto = painelAbertoRef.current;
      const cursor = cursorRef.current;
      const arrastando = dragRef.current.ativo || pinchRef.current.ativo;

      let algoEmMovimento = false;

      for (const peca of pecas) {
        const el = cardEls.current.get(peca.slug);
        const motion = motionRef.current.get(peca.slug);
        if (!el || !motion) continue;

        const suprimido = painelAberto || suprimidoRef.current.has(peca.slug) || arrastando;

        let floatX = 0;
        let floatY = 0;
        let floatRot = 0;
        if (!reduzido && !suprimido) {
          const f = flutuacao(agora, motion.faseOffset, motion.periodo);
          floatX = f.x;
          floatY = f.y;
          floatRot = f.rot;
          algoEmMovimento = true;
        }

        let magnetX = 0;
        let magnetY = 0;
        if (!reduzido) {
          const posMundo = posicaoMundo(peca);
          const cartaoTelaX = tx + posMundo.x * k;
          const cartaoTelaY = ty + posMundo.y * k;
          motion.magnet = passoMagnetismo(
            motion.magnet,
            cartaoTelaX,
            cartaoTelaY,
            cursor.x,
            cursor.y,
            suprimido
          );
          magnetX = motion.magnet.x / k;
          magnetY = motion.magnet.y / k;
          if (Math.abs(motion.magnet.x) > 0.02 || Math.abs(motion.magnet.y) > 0.02) {
            algoEmMovimento = true;
          }
        }

        const escala = motion.scaleRecuo.v * motion.scaleEntrada.v;
        el.style.transform = `translate(${(floatX + magnetX).toFixed(2)}px, ${(floatY + magnetY).toFixed(2)}px) rotate(${floatRot.toFixed(2)}deg) scale(${escala.toFixed(3)})`;
      }

      if (!reduzido && barraRef.current) {
        const centroX = vw / 2;
        const centroY = 44;
        barraOffsetRef.current = passoParallaxeBarra(
          barraOffsetRef.current,
          centroX,
          centroY,
          cursor.x,
          cursor.y
        );
        barraRef.current.style.transform = `translate(-50%, 0) translate(${barraOffsetRef.current.x.toFixed(2)}px, ${barraOffsetRef.current.y.toFixed(2)}px)`;
        if (Math.abs(barraOffsetRef.current.x) > 0.02 || Math.abs(barraOffsetRef.current.y) > 0.02) {
          algoEmMovimento = true;
        }
      }

      if (zoomLabelRef.current) {
        zoomLabelRef.current.textContent = `${Math.round(k * 100)}%`;
      }

      const parado = agora - ultimaAtividadeRef.current > IDLE_MS;
      if (reduzido && parado && !cameraTweenRef.current?.isActive() && !algoEmMovimento) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [pecas, reduzido]
  );

  // Enquadramento inicial e arranque/parada do loop conforme o modo — sem animação de entrada.
  useIsoLayoutEffect(() => {
    if (modo !== "plano") {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (mundoRef.current) mundoRef.current.style.transform = "";
      for (const el of cardEls.current.values()) el.style.transform = "";
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vw = viewport.clientWidth || window.innerWidth;
    const vh = viewport.clientHeight || window.innerHeight;
    camRef.current = enquadrar(
      pecas.map(posicaoMundo),
      vw,
      vh
    );
    ultimaAtividadeRef.current = performance.now();
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [modo]);

  // GSAP só é importado dentro do modo plano — nunca no modo lista, nunca com reduced-motion.
  useEffect(() => {
    if (modo !== "plano" || reduzido) return;
    let cancelado = false;
    import("gsap").then(({ gsap }) => {
      if (!cancelado) gsapRef.current = gsap;
    });
    return () => {
      cancelado = true;
    };
  }, [modo, reduzido]);

  const enquadrarGrupo = useCallback(
    (grupo: Grupo | null) => {
      const viewport = viewportRef.current;
      if (!viewport || modo !== "plano") return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const alvoPecas = grupo ? pecasPorGrupo(grupo) : pecas;
      const alvo = enquadrar(
        alvoPecas.map(posicaoMundo),
        vw,
        vh
      );

      cameraTweenRef.current?.kill();
      setGrupoAtivo(grupo);

      const gsap = gsapRef.current;
      if (reduzido || !gsap) {
        camRef.current = { ...alvo };
      } else {
        mundoRef.current?.style.setProperty("will-change", "transform");
        cameraTweenRef.current = gsap.to(camRef.current, {
          x: alvo.x,
          y: alvo.y,
          k: alvo.k,
          duration: 0.75,
          ease: "power3.out",
          delay: 0.05,
          overwrite: true,
          onComplete: () => mundoRef.current?.style.removeProperty("will-change"),
        });
      }

      const dentro = grupo ? new Set(alvoPecas.map((p) => p.slug)) : null;
      for (const peca of pecas) {
        const el = cardEls.current.get(peca.slug);
        const motion = motionRef.current.get(peca.slug);
        if (!el || !motion) continue;
        const foraDoGrupo = dentro !== null && !dentro.has(peca.slug);

        if (reduzido || !gsap) {
          el.style.opacity = foraDoGrupo ? "0.22" : "1";
          el.style.boxShadow = foraDoGrupo ? "none" : "";
          motion.scaleRecuo.v = foraDoGrupo ? 0.94 : 1;
          continue;
        }

        if (foraDoGrupo) {
          gsap.to(el, { opacity: 0.22, boxShadow: "none", duration: 0.45, ease: "power2.out" });
          gsap.to(motion.scaleRecuo, { v: 0.94, duration: 0.45, ease: "power2.out" });
        } else {
          gsap.to(el, {
            opacity: 1,
            duration: 0.45,
            ease: "power2.out",
            onComplete: () => {
              el.style.boxShadow = "";
            },
          });
          gsap.to(motion.scaleRecuo, { v: 1, duration: 0.45, ease: "power2.out" });
          if (dentro !== null) {
            motion.scaleEntrada.v = 0.97;
            gsap.to(motion.scaleEntrada, { v: 1, duration: 0.5, ease: "back.out(1.4)", delay: 0.5 });
          }
        }
      }
      marcarAtividade();
    },
    [modo, pecas, reduzido, marcarAtividade]
  );

  const focarCartao = useCallback(
    (slug: string) => {
      if (modo !== "plano") return;
      const peca = pecas.find((p) => p.slug === slug);
      const viewport = viewportRef.current;
      if (!peca || !viewport) return;
      cameraTweenRef.current?.kill();
      const posMundo = posicaoMundo(peca);
      const alvo: Camera = { x: posMundo.x, y: posMundo.y, k: camRef.current.k };
      const gsap = gsapRef.current;
      if (reduzido || !gsap) {
        camRef.current = alvo;
      } else {
        cameraTweenRef.current = gsap.to(camRef.current, {
          x: alvo.x,
          y: alvo.y,
          duration: 0.6,
          ease: "power3.out",
          overwrite: true,
        });
      }
      marcarAtividade();
    },
    [modo, pecas, reduzido, marcarAtividade]
  );

  const suprimirCartao = useCallback((slug: string, ativo: boolean) => {
    if (ativo) suprimidoRef.current.add(slug);
    else suprimidoRef.current.delete(slug);
  }, []);

  const abrirCartao = useCallback((slug: string) => {
    origemFocoRef.current = slug;
  }, []);

  const fecharPainel = useCallback(() => {
    const gsap = gsapRef.current;
    const painel = painelRef.current;
    const viewport = viewportRef.current;
    const ir = () => router.push("/", { scroll: false });

    if (reduzido || !gsap || !painel) {
      ir();
      return;
    }
    gsap.to(painel, { scale: 0.96, opacity: 0, duration: 0.25, ease: "power2.in", onComplete: ir });
    if (viewport) {
      gsap.to(viewport, { filter: "brightness(1)", duration: 0.25, ease: "power2.in" });
    }
  }, [reduzido, router]);

  // Escurece o plano atrás do painel, entra o painel, para flutuação/magnetismo geral (via painelAbertoRef, lido no tick).
  useEffect(() => {
    painelAbertoRef.current = Boolean(pecaExibida);
    const gsap = gsapRef.current;
    const viewport = viewportRef.current;
    const painel = painelRef.current;

    if (pecaExibida) {
      marcarAtividade();
      if (!reduzido && gsap && painel) {
        gsap.fromTo(
          painel,
          { scale: 0.96, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.1)" }
        );
        if (viewport) gsap.to(viewport, { filter: "brightness(0.88)", duration: 0.4, ease: "power2.inOut" });
      } else if (viewport) {
        viewport.style.filter = "brightness(0.88)";
      }
    } else {
      if (viewport && (reduzido || !gsap)) viewport.style.filter = "";
      const origem = origemFocoRef.current;
      if (origem) {
        cardEls.current.get(origem)?.focus();
        origemFocoRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pecaExibida]);

  useEffect(() => {
    if (!pecaExibida) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharPainel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pecaExibida, fecharPainel]);

  // Ponteiro: arrasto, roda e pinça.
  useEffect(() => {
    if (modo !== "plano") return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cameraTweenRef.current?.kill();
      marcarAtividade();
      viewport.setPointerCapture(e.pointerId);

      pinchRef.current.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current.ponteiros.size === 2) {
        dragRef.current.ativo = false;
        const pts = Array.from(pinchRef.current.ponteiros.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        pinchRef.current.ativo = true;
        pinchRef.current.distInicio = Math.hypot(dx, dy) || 1;
        pinchRef.current.kInicio = camRef.current.k;
        return;
      }

      dragRef.current = {
        ativo: true,
        ponteiroId: e.pointerId,
        inicioX: e.clientX,
        inicioY: e.clientY,
        camInicioX: camRef.current.x,
        camInicioY: camRef.current.y,
        arrastou: false,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      if (pinchRef.current.ponteiros.has(e.pointerId)) {
        pinchRef.current.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pinchRef.current.ativo && pinchRef.current.ponteiros.size === 2) {
        marcarAtividade();
        const pts = Array.from(pinchRef.current.ponteiros.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy) || 1;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const novoK = clampZoom(pinchRef.current.kInicio * (dist / pinchRef.current.distInicio));
        const rect = viewport.getBoundingClientRect();
        camRef.current = zoomEmTornoDoCursor(
          camRef.current,
          rect.width,
          rect.height,
          midX - rect.left,
          midY - rect.top,
          novoK
        );
        return;
      }

      if (!dragRef.current.ativo || e.pointerId !== dragRef.current.ponteiroId) return;
      const dx = e.clientX - dragRef.current.inicioX;
      const dy = e.clientY - dragRef.current.inicioY;
      if (Math.abs(dx) + Math.abs(dy) > LIMIAR_ARRASTO) {
        dragRef.current.arrastou = true;
        marcarAtividade();
      }
      const k = camRef.current.k;
      camRef.current = {
        x: dragRef.current.camInicioX - dx / k,
        y: dragRef.current.camInicioY - dy / k,
        k,
      };
    };

    const encerrarPonteiro = (e: PointerEvent) => {
      pinchRef.current.ponteiros.delete(e.pointerId);
      if (pinchRef.current.ponteiros.size < 2) pinchRef.current.ativo = false;
      if (e.pointerId === dragRef.current.ponteiroId) {
        dragRef.current.ativo = false;
      }
    };

    const onPointerLeave = () => {
      cursorRef.current = { x: null, y: null };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      marcarAtividade();
      const rect = viewport.getBoundingClientRect();
      const fator = Math.pow(1.0015, -e.deltaY);
      const novoK = clampZoom(camRef.current.k * fator);
      camRef.current = zoomEmTornoDoCursor(
        camRef.current,
        rect.width,
        rect.height,
        e.clientX - rect.left,
        e.clientY - rect.top,
        novoK
      );
    };

    const onClickCapture = (e: MouseEvent) => {
      if (dragRef.current.arrastou) {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current.arrastou = false;
      }
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", encerrarPonteiro);
    viewport.addEventListener("pointercancel", encerrarPonteiro);
    viewport.addEventListener("pointerleave", onPointerLeave);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("click", onClickCapture, { capture: true });

    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", encerrarPonteiro);
      viewport.removeEventListener("pointercancel", encerrarPonteiro);
      viewport.removeEventListener("pointerleave", onPointerLeave);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("click", onClickCapture, { capture: true });
    };
  }, [modo, marcarAtividade]);

  const zoomInicial = useMemo(() => Math.round((camRef.current.k || 1) * 100), []);

  return (
    <section
      ref={viewportRef}
      className={`plano-viewport relative isolate h-[100dvh] w-full overflow-hidden ${
        modo === "plano" ? "touch-none" : ""
      }`}
      data-canvas={grupoAtivo ? "focado" : undefined}
    >
      <div
        ref={mundoRef}
        className={
          modo === "plano"
            ? "absolute left-0 top-0 h-0 w-0 [transform-origin:0_0]"
            : "mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-24 pt-28 sm:px-6"
        }
      >
        {grupos.map((g) => {
          const pecasDoGrupo = pecasPorGrupo(g.chave);
          const pos = modo === "plano" ? posicaoGrupo(pecasDoGrupo) : null;
          return (
            <div
              key={g.chave}
              className={modo === "plano" ? "absolute w-[340px]" : ""}
              style={pos ? ({ left: `${pos.x}px`, top: `${pos.y}px` } as React.CSSProperties) : undefined}
            >
              <h2 className="grupo-titulo text-h3 font-medium transition-colors duration-[0.9s] ease-in-out">
                {g.titulo}
              </h2>
              <p className="grupo-apoio mt-1 text-body-sm transition-colors duration-[0.9s] ease-in-out">
                {g.apoio}
              </p>
              <div
                className={modo === "plano" ? "relative mt-4" : "mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"}
              >
                {pecasDoGrupo.map((p) => {
                  const posMundo = posicaoMundo(p);
                  return (
                  <div
                    key={p.slug}
                    className={modo === "plano" ? "absolute w-[240px]" : ""}
                    style={
                      modo === "plano" && pos
                        ? ({
                            left: `${posMundo.x - pos.x}px`,
                            top: `${posMundo.y - pos.y}px`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <Cartao
                      peca={p}
                      registrarEl={registrarCardEl}
                      onSuprimir={suprimirCartao}
                      onFocoCamera={focarCartao}
                      onAbrir={abrirCartao}
                    />
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {modo === "plano" && (
        <BarraControles
          grupos={grupos}
          grupoAtivo={grupoAtivo}
          zoomPercent={zoomInicial}
          registrarEl={(el) => {
            barraRef.current = el;
          }}
          zoomLabelRef={zoomLabelRef}
          onEnquadrarGrupo={enquadrarGrupo}
        />
      )}

      {pecaExibida && (
        <PainelPeca ref={painelRef} peca={pecaExibida} contato={contato} onFechar={fecharPainel} />
      )}
    </section>
  );
}
