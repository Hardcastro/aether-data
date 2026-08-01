"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Grupo, GrupoInfo, Peca } from "@/lib/manifesto";
import { pecasPorGrupo } from "@/lib/manifesto";
import { clampZoom, enquadrar, transformDoMundo, zoomEmTornoDoCursor, type Camera } from "@/lib/camera";
import { useModoPlano } from "@/lib/useMatchMedia";
import { Cartao } from "@/components/Cartao";
import { BarraControles } from "@/components/BarraControles";
import { PainelPeca } from "@/components/PainelPeca";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const LIMIAR_ARRASTO = 4;

type Props = {
  pecas: Peca[];
  grupos: GrupoInfo[];
  pecaAberta: Peca | null;
  contato: { email: string | null; whatsapp: string | null };
};

/** Posição de mundo do título de um grupo — acima-esquerda do bloco de cartões. */
function posicaoGrupo(pecasDoGrupo: Peca[]) {
  const minX = Math.min(...pecasDoGrupo.map((p) => p.posicao.x));
  const minY = Math.min(...pecasDoGrupo.map((p) => p.posicao.y));
  return { x: minX - 8, y: minY - 68 };
}

/**
 * Segundo degrau: o plano navega — arrasto, roda, pinça, enquadramento de
 * grupo, câmera segue o foco do teclado. Tudo em corte seco, sem GSAP e sem
 * flutuação/magnetismo — isso é o terceiro commit, por cima disto. Ver
 * seção 13 do prompt-claude-code-04: separar os dois é o que torna uma
 * eventual briga entre o tween e o loop de renderização isolável.
 */
export function Plano({ pecas, grupos, pecaAberta, contato }: Props) {
  const router = useRouter();
  const modoPlano = useModoPlano();
  const modo: "lista" | "plano" = modoPlano ? "plano" : "lista";

  const [grupoAtivo, setGrupoAtivo] = useState<Grupo | null>(null);
  const [pecaExibida, setPecaExibida] = useState<Peca | null>(pecaAberta);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mundoRef = useRef<HTMLDivElement | null>(null);
  const barraRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null);
  const cardEls = useRef<Map<string, HTMLAnchorElement>>(new Map());

  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 });
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

  useEffect(() => {
    setPecaExibida(pecaAberta);
  }, [pecaAberta]);

  const registrarCardEl = useCallback((slug: string, el: HTMLAnchorElement | null) => {
    if (el) cardEls.current.set(slug, el);
    else cardEls.current.delete(slug);
  }, []);

  const tick = useCallback(() => {
    const viewport = viewportRef.current;
    const mundo = mundoRef.current;
    if (!viewport || !mundo) {
      rafRef.current = null;
      return;
    }
    const { tx, ty, k } = transformDoMundo(camRef.current, viewport.clientWidth, viewport.clientHeight);
    mundo.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(k * 100)}%`;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Enquadramento inicial e arranque/parada do loop conforme o modo — sem animação de entrada.
  useIsoLayoutEffect(() => {
    if (modo !== "plano") {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (mundoRef.current) mundoRef.current.style.transform = "";
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vw = viewport.clientWidth || window.innerWidth;
    const vh = viewport.clientHeight || window.innerHeight;
    camRef.current = enquadrar(
      pecas.map((p) => p.posicao),
      vw,
      vh
    );
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const enquadrarGrupo = useCallback(
    (grupo: Grupo | null) => {
      const viewport = viewportRef.current;
      if (!viewport || modo !== "plano") return;
      const alvoPecas = grupo ? pecasPorGrupo(grupo) : pecas;
      camRef.current = enquadrar(
        alvoPecas.map((p) => p.posicao),
        viewport.clientWidth,
        viewport.clientHeight
      );
      setGrupoAtivo(grupo);

      const dentro = grupo ? new Set(alvoPecas.map((p) => p.slug)) : null;
      for (const peca of pecas) {
        const el = cardEls.current.get(peca.slug);
        if (!el) continue;
        const foraDoGrupo = dentro !== null && !dentro.has(peca.slug);
        el.style.opacity = foraDoGrupo ? "0.22" : "1";
        el.style.transform = foraDoGrupo ? "scale(0.94)" : "";
        el.style.boxShadow = foraDoGrupo ? "none" : "";
      }
    },
    [modo, pecas]
  );

  const focarCartao = useCallback(
    (slug: string) => {
      if (modo !== "plano") return;
      const peca = pecas.find((p) => p.slug === slug);
      if (!peca) return;
      camRef.current = { ...camRef.current, x: peca.posicao.x, y: peca.posicao.y };
    },
    [modo, pecas]
  );

  const abrirCartao = useCallback((slug: string) => {
    origemFocoRef.current = slug;
  }, []);

  const fecharPainel = useCallback(() => {
    router.push("/", { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!pecaExibida) {
      const origem = origemFocoRef.current;
      if (origem) {
        cardEls.current.get(origem)?.focus();
        origemFocoRef.current = null;
      }
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharPainel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pecaExibida, fecharPainel]);

  // Ponteiro: arrasto, roda e pinça — só existe em modo plano.
  useEffect(() => {
    if (modo !== "plano") return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
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
      if (pinchRef.current.ponteiros.has(e.pointerId)) {
        pinchRef.current.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinchRef.current.ativo && pinchRef.current.ponteiros.size === 2) {
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
      if (Math.abs(dx) + Math.abs(dy) > LIMIAR_ARRASTO) dragRef.current.arrastou = true;
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
      if (e.pointerId === dragRef.current.ponteiroId) dragRef.current.ativo = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
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
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("click", onClickCapture, { capture: true });

    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", encerrarPonteiro);
      viewport.removeEventListener("pointercancel", encerrarPonteiro);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("click", onClickCapture, { capture: true });
    };
  }, [modo]);

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
              <h2 className="grupo-titulo text-h3 font-medium">{g.titulo}</h2>
              <p className="grupo-apoio mt-1 text-body-sm">{g.apoio}</p>
              <div
                className={modo === "plano" ? "relative mt-4" : "mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"}
              >
                {pecasDoGrupo.map((p) => (
                  <div
                    key={p.slug}
                    className={modo === "plano" ? "absolute w-[240px]" : ""}
                    style={
                      modo === "plano" && pos
                        ? ({
                            left: `${p.posicao.x - pos.x}px`,
                            top: `${p.posicao.y - pos.y + 60}px`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <Cartao
                      peca={p}
                      registrarEl={registrarCardEl}
                      onSuprimir={() => {}}
                      onFocoCamera={focarCartao}
                      onAbrir={abrirCartao}
                    />
                  </div>
                ))}
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

      {pecaExibida && <PainelPeca peca={pecaExibida} contato={contato} onFechar={fecharPainel} />}
    </section>
  );
}
