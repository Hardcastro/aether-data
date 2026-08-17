"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ItemVitrine } from "@/lib/vitrine";
import { Particulas } from "@/components/Particulas";
import { MockVertente } from "@/components/MockVertente";

type GsapInstance = typeof import("gsap")["gsap"];

type Props = {
  /**
   * O que o seletor e as setas percorrem. Na home são as duas vertentes; em
   * /sites e /automacoes são as peças daquela vertente. O Hero não sabe a
   * diferença — quem traduz é lib/vitrine.ts — e é isso que faz as três telas
   * serem literalmente a mesma tela.
   */
  itens: ItemVitrine[];
  aberto: ItemVitrine;
  /** Rota desta tela. É o prefixo que o seletor escreve antes de `?peca=`. */
  base: string;
  /** Display grande da coluna esquerda. Duas linhas na home ("AEther / Data"). */
  titulo: { linha1: string; linha2?: string };
  descricao: string;
  selo: { titulo: string; subtitulo: string };
  /** Acervo em texto corrido, para leitor de tela e buscador. Ver lib/vitrine.ts. */
  semJs: string[];
  contato: { email: string | null; whatsapp: string | null };
};

/** Nove nós no campo, espelhando b1–b9 da referência. Os três últimos ficam atrás. */
const NOS_FRENTE = ["n1", "n2", "n3", "n4", "n5", "n6"] as const;
const NOS_FUNDO = ["n7", "n8", "n9"] as const;

/** Durações de flutuação por índice — mesma tabela da referência. */
const DURACOES = [5, 7, 6, 8, 5.5, 6.5, 9, 11, 10];

const RAIO_REPULSAO = 400;
const FORCA_REPULSAO = -80;
const LERP_REPULSAO = 0.1;
const LERP_CURSOR = 0.05;

export function Hero({ itens, aberto, base, titulo, descricao, selo, semJs, contato }: Props) {
  const router = useRouter();
  const [exibido, setExibido] = useState<ItemVitrine>(aberto);

  const painelRef = useRef<HTMLDivElement | null>(null);
  const campoFgRef = useRef<HTMLDivElement | null>(null);
  const campoBgRef = useRef<HTMLDivElement | null>(null);

  const gsapRef = useRef<GsapInstance | null>(null);
  const trocandoRef = useRef(false);
  /** Ângulo do giro em curso, somado à inclinação do cursor a cada quadro. */
  const giroRef = useRef(0);
  const cursorRef = useRef({ x: 0, y: 0, px: -9999, py: -9999 });
  const cursorSuaveRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const reduzidoRef = useRef(false);

  /*
    A peça pode mudar por navegação — botão voltar, link colado, clique no
    cabeçalho. Mas NÃO durante uma troca em curso: `trocarPeca` chama
    router.push imediatamente e o servidor devolve a peça nova em milissegundos,
    o que dispararia este efeito e trocaria o conteúdo no início do giro em vez
    do pico. A guarda preserva a coreografia; quando o giro chega ao pico, ele
    mesmo chama setPecaExibida com a peça que já está na URL.
  */
  useEffect(() => {
    if (trocandoRef.current) return;
    setExibido(aberto);
  }, [aberto]);

  useEffect(() => {
    reduzidoRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzidoRef.current) return;
    let cancelado = false;
    import("gsap").then(({ gsap }) => {
      if (!cancelado) gsapRef.current = gsap;
    });
    return () => {
      cancelado = true;
    };
  }, []);

  /* ------------------------------------------------------------ o laço ---- */

  useEffect(() => {
    if (reduzidoRef.current) return;

    const nos = Array.from(document.querySelectorAll<HTMLElement>(".no"));
    for (const no of nos) {
      // rx/ry são o empurrão TRANSITÓRIO do ponteiro, que sempre volta a zero.
      // baseX/baseY são a posição PERSISTENTE em que a explosão deixou o nó.
      // Somar os dois é o que faz a posição nova sobreviver: se a explosão
      // gravasse em rx/ry, o lerp da repulsão levaria tudo de volta ao ponto
      // de partida em menos de um segundo e a troca não moveria nada.
      no.dataset.rx = "0";
      no.dataset.ry = "0";
      no.dataset.baseX = "0";
      no.dataset.baseY = "0";
      no.dataset.angulo = "0";
    }

    const aoMover = (e: PointerEvent) => {
      cursorRef.current.x = e.clientX / window.innerWidth - 0.5;
      cursorRef.current.y = e.clientY / window.innerHeight - 0.5;
      cursorRef.current.px = e.clientX;
      cursorRef.current.py = e.clientY;
    };
    const aoSair = () => {
      cursorRef.current.px = -9999;
      cursorRef.current.py = -9999;
    };
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerleave", aoSair);

    const quadro = () => {
      const t = Date.now() * 0.001;
      const alvo = cursorRef.current;
      const suave = cursorSuaveRef.current;
      suave.x += (alvo.x - suave.x) * LERP_CURSOR;
      suave.y += (alvo.y - suave.y) * LERP_CURSOR;

      // O painel inclina em direção ao cursor e carrega o giro da troca.
      //
      // A referência usa 40deg/20deg porque lá o objeto central é uma lata:
      // girar uma lata 20 graus é o efeito inteiro. Aqui o objeto central é
      // TEXTO — nome, capacidade, stack e botões. A 20 graus com perspectiva
      // de 1400px a borda distante comprime e a leitura sofre, que é
      // exatamente o defeito que derrubou a versão anterior desta peça.
      // 12/8 mantém o painel vivo sob o cursor sem cobrar nada da leitura.
      if (painelRef.current) {
        const rotY = suave.x * 12 + giroRef.current;
        const rotX = -suave.y * 8;
        painelRef.current.style.transform = `rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg)`;
      }

      // Paralaxe dos dois campos, em direções opostas.
      if (campoFgRef.current) {
        campoFgRef.current.style.transform = `translate(${(suave.x * 60).toFixed(2)}px, ${(suave.y * 60).toFixed(2)}px)`;
      }
      if (campoBgRef.current) {
        campoBgRef.current.style.transform = `translate(${(suave.x * -30).toFixed(2)}px, ${(suave.y * -30).toFixed(2)}px)`;
      }

      if (!trocandoRef.current) {
        nos.forEach((no, i) => {
          const r = no.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const dx = alvo.px - cx;
          const dy = alvo.py - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let alvoRx = 0;
          let alvoRy = 0;
          let mult = 1;
          if (dist < RAIO_REPULSAO && dist > 0) {
            const forca = (RAIO_REPULSAO - dist) / RAIO_REPULSAO;
            alvoRx = (dx / dist) * forca * FORCA_REPULSAO;
            alvoRy = (dy / dist) * forca * FORCA_REPULSAO;
            mult = 1 + forca * 5;
          }

          let rx = parseFloat(no.dataset.rx || "0");
          let ry = parseFloat(no.dataset.ry || "0");
          let ang = parseFloat(no.dataset.angulo || "0");
          const baseX = parseFloat(no.dataset.baseX || "0");
          const baseY = parseFloat(no.dataset.baseY || "0");
          rx += (alvoRx - rx) * LERP_REPULSAO;
          ry += (alvoRy - ry) * LERP_REPULSAO;
          ang += 0.2 * mult;
          no.dataset.rx = String(rx);
          no.dataset.ry = String(ry);
          no.dataset.angulo = String(ang);

          const dur = DURACOES[i % DURACOES.length];
          const fase = (t + i * 0.7) * ((Math.PI * 2) / dur);
          const flutY = Math.sin(fase) * 15;
          const flutAng = Math.cos(fase) * 6;

          no.style.transform = `translate(${(rx + baseX).toFixed(2)}px, ${(ry + baseY + flutY).toFixed(2)}px) rotate(${(ang + flutAng).toFixed(2)}deg)`;
        });
      }

      rafRef.current = requestAnimationFrame(quadro);
    };
    rafRef.current = requestAnimationFrame(quadro);

    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerleave", aoSair);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /*
    As partículas saíram daqui em 07/08 para <Particulas />: a home e as duas
    grades também precisam delas, e o efeito nunca dependeu de nada do Hero.
  */

  /* ---------------------------------------------------------- a troca ----- */

  const trocarItem = useCallback(
    (item: ItemVitrine) => {
      if (trocandoRef.current || item.slug === exibido.slug) return;

      // A URL é a fonte de verdade: escrever ?peca= é o que faz o link frio, o
      // preview por peça e o botão voltar continuarem funcionando de graça.
      // O prefixo vem de fora — a mesma coreografia serve as três telas.
      router.push(`${base}?peca=${item.slug}`, { scroll: false });

      const gsap = gsapRef.current;
      if (reduzidoRef.current || !gsap) {
        // Corte seco: sem giro, sem implosão.
        const raiz = document.documentElement;
        raiz.style.setProperty("--bg-inner", item.cor.inner);
        raiz.style.setProperty("--bg-mid", item.cor.mid);
        raiz.style.setProperty("--bg-outer", item.cor.outer);
        setExibido(item);
        return;
      }

      trocandoRef.current = true;
      const raiz = document.documentElement;
      const nos = Array.from(document.querySelectorAll<HTMLElement>(".no"));

      gsap.to(raiz, {
        "--bg-inner": item.cor.inner,
        "--bg-mid": item.cor.mid,
        "--bg-outer": item.cor.outer,
        duration: 1.5,
        ease: "power2.inOut",
      });

      // Giro do painel com desfoque, trocando o conteúdo no pico.
      const giro = { val: 0, blur: 0 };
      gsap.to(giro, {
        val: 360,
        blur: 15,
        duration: 0.6,
        ease: "power2.in",
        onUpdate: () => {
          giroRef.current = giro.val;
          if (painelRef.current) painelRef.current.style.filter = `blur(${giro.blur}px)`;
        },
        onComplete: () => {
          setExibido(item);
          gsap.to(giro, {
            val: 720,
            blur: 0,
            duration: 1.5,
            ease: "back.out(0.7)",
            onUpdate: () => {
              giroRef.current = giro.val;
              if (painelRef.current) painelRef.current.style.filter = `blur(${giro.blur}px)`;
            },
            onComplete: () => {
              giroRef.current = 0;
              if (painelRef.current) painelRef.current.style.filter = "none";
            },
          });
        },
      });

      // Os nós implodem para o centro, seguram, e explodem para posições novas.
      let terminados = 0;
      nos.forEach((no) => {
        const meiaL = no.offsetWidth / 2;
        const meiaA = no.offsetHeight / 2;
        const centroX = window.innerWidth / 2 - no.offsetLeft - meiaL;
        const centroY = window.innerHeight / 2 - no.offsetTop - meiaA;
        const proxX = (Math.random() - 0.5) * 200;
        const proxY = (Math.random() - 0.5) * 200;

        // O GSAP começa de onde o laço parou, não de zero — senão o nó salta
        // para a posição da folha de estilo antes de implodir.
        gsap.set(no, {
          x: parseFloat(no.dataset.baseX || "0"),
          y: parseFloat(no.dataset.baseY || "0"),
        });

        gsap
          .timeline()
          .to(no, {
            x: centroX,
            y: centroY,
            scale: 0.1,
            opacity: 0,
            duration: 0.5,
            ease: "power2.in",
          })
          .to(no, { duration: 0.3 })
          .to(no, {
            x: proxX,
            y: proxY,
            scale: 1,
            opacity: 1,
            duration: 0.9,
            ease: "back.out(1.5)",
            onComplete: () => {
              // Devolver o controle ao laço: a posição nova vai para baseX/baseY
              // (persistente) e as transformações do GSAP são limpas, senão o
              // próximo quadro escreveria transform por cima e o nó saltaria.
              no.dataset.baseX = String(proxX);
              no.dataset.baseY = String(proxY);
              no.dataset.rx = "0";
              no.dataset.ry = "0";
              gsap.set(no, { clearProps: "transform,opacity" });
              terminados++;
              if (terminados === nos.length) trocandoRef.current = false;
            },
          });
      });
    },
    [exibido.slug, router, base]
  );

  const indiceAtual = itens.findIndex((i) => i.slug === exibido.slug);
  const irPara = (passo: number) => {
    const prox = (indiceAtual + passo + itens.length) % itens.length;
    trocarItem(itens[prox]);
  };

  /* ------------------------------------------------------------ markup ---- */

  return (
    <>
      <Particulas />

      <div className="campo campo-bg" ref={campoBgRef} aria-hidden="true">
        {NOS_FUNDO.map((n) => (
          <div key={n} className={`no ${n}`} />
        ))}
      </div>

      <main className="hero" id="conteudo">
        <div className="hero-content">
          <div className="hero-left">
            {/*
              Na home o display é a marca ("AEther / Data"); nas duas vitrines
              é onde o visitante está ("Sites", "Automações"). Quem decide é
              quem renderiza — o Hero só desenha.
            */}
            <h1 className={`titulo-display${titulo.linha2 ? "" : " titulo-display-secao"}`}>
              {titulo.linha2 ? (
                <>
                  <span className="fina">{titulo.linha1}</span>
                  <br />
                  {titulo.linha2}
                </>
              ) : (
                titulo.linha1
              )}
            </h1>
            <p className="descricao">{descricao}</p>
            {/*
              Aqui vivia um segundo botão com `exibido.acaoPrimaria` — o mesmo
              destino, o mesmo rótulo do botão que já está dentro do painel. No
              desktop os dois apareciam lado a lado, a 350px um do outro: "Ver
              as 4 peças" na home, "Ver no ar" nas vitrines, escritos duas
              vezes na mesma tela. Duas chamadas idênticas não somam, dividem.

              A ação da peça ficou onde ela pertence: no painel, que é o que
              muda quando se troca de peça. A coluna da esquerda voltou a ser o
              que ela já era em tudo o mais — quem é o site, o que ele faz, e o
              selo do acervo ancorado embaixo. O canal de contato continua aqui
              porque contato é da página, não da peça.
            */}
            {(contato.whatsapp || contato.email) && (
              <div className="cta-group">
                {contato.whatsapp && (
                  <a className="contact-btn" href={`https://wa.me/${contato.whatsapp}`}>
                    WhatsApp
                  </a>
                )}
                {contato.email && (
                  <a className="contact-btn" href={`mailto:${contato.email}`}>
                    {contato.email}
                  </a>
                )}
              </div>
            )}
            <div className="selo">
              <div className="selo-icone" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 17V9M9 17V5M14 17v-6M19 17V7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="selo-texto">
                {/*
                  Na home conta o conjunto inteiro; em cada vitrine conta só o
                  que está ali. Número certo no lugar certo — quem decide é
                  quem renderiza.
                */}
                <span className="selo-titulo">{selo.titulo}</span>
                <span className="selo-subtitulo">{selo.subtitulo}</span>
              </div>
            </div>
          </div>

          <div className="hero-centro">
            <div className="painel-orbita">
              <article className="painel" ref={painelRef}>
                <figure className="painel-figura">
                  {/*
                    Três estados, nesta ordem: peça com print mostra a tela de
                    verdade; vertente mostra o mock desenhado (ela não tem uma
                    tela — ela é o conjunto); peça sem print ainda mostra o
                    espaço reservado, que é o estado honesto de "a capturar".
                  */}
                  {exibido.mock ? (
                    <MockVertente tipo={exibido.mock} />
                  ) : exibido.imagem ? (
                    <img src={exibido.imagem} alt={`Tela do projeto ${exibido.nome}`} />
                  ) : (
                    <figcaption className="reservado">
                      <span className="reservado-marca">{exibido.nome}</span>
                      <span className="reservado-nota">print do site — a capturar</span>
                    </figcaption>
                  )}
                </figure>
                <div className="painel-corpo">
                  <p className="painel-grupo">{exibido.etiqueta}</p>
                  <h2 className="painel-nome">{exibido.nome}</h2>
                  <p className="painel-capacidade">{exibido.capacidade}</p>
                  <ul className="painel-stack">
                    {exibido.fichas.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <div className="painel-acoes">
                    {exibido.acaoPrimaria.externo ? (
                      <a
                        className="btn-primario"
                        href={exibido.acaoPrimaria.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {exibido.acaoPrimaria.rotulo}
                      </a>
                    ) : (
                      <Link className="btn-primario" href={exibido.acaoPrimaria.href}>
                        {exibido.acaoPrimaria.rotulo}
                      </Link>
                    )}
                    {exibido.acaoSecundaria && (
                      <a
                        className="btn-secundario"
                        href={exibido.acaoSecundaria.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {exibido.acaoSecundaria.rotulo}
                      </a>
                    )}
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div className="campo campo-fg" ref={campoFgRef} aria-hidden="true">
            {NOS_FRENTE.map((n) => (
              <div key={n} className={`no ${n}`} />
            ))}
          </div>

          <div className="hero-right">
            <div className="seletor">
              <ul className="seletor-cartoes">
                {itens.map((i) => (
                  <li key={i.slug}>
                    <button
                      type="button"
                      className="cartao"
                      aria-current={i.slug === exibido.slug}
                      onClick={() => trocarItem(i)}
                    >
                      <span
                        className="cartao-disco"
                        aria-hidden="true"
                        style={{
                          background: `radial-gradient(circle at 32% 28%, ${i.cor.inner}, ${i.cor.mid} 60%, ${i.cor.outer} 100%)`,
                        }}
                      />
                      <span className="cartao-info">
                        <span className="nome">{i.nome}</span>
                        <span className="grupo">{i.etiqueta}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {/*
                Com um item só as setas não têm para onde ir — girariam de volta
                para ele mesmo, que é a definição de controle morto. Some
                sozinho quando C1–C3 entrarem em /automacoes.
              */}
              {itens.length > 1 && (
                <div className="seletor-nav">
                  <button
                    type="button"
                    className="nav-arrow"
                    aria-label="Anterior"
                    onClick={() => irPara(-1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="nav-arrow"
                    aria-label="Próximo"
                    onClick={() => irPara(1)}
                  >
                    →
                  </button>
                </div>
              )}
            </div>
            {/*
              `<p aria-hidden>`, não `<h2>`. O texto é o mesmo do
              `.painel-nome`, que já é um h2 na mesma tela: no leitor de tela a
              peça era anunciada duas vezes como título, e o segundo não
              encabeçava nada — é eco tipográfico, ancorado na diagonal oposta
              à do display da esquerda. Fora da árvore de acessibilidade ele
              faz o que sempre fez visualmente, sem duplicar a estrutura.
            */}
            <p className="titulo-lado" aria-hidden="true">
              {exibido.nome}
            </p>
          </div>
        </div>
      </main>

      {/*
        As peças em texto corrido, para leitor de tela, para o Google e para
        quem abre o código-fonte. O painel mostra uma por vez; isto mostra
        todas, sempre, sem depender de script.

        Na home a lista traz as cinco, mesmo a home falando de vertentes: quem
        chega sem script — ou é um robô de busca — precisa encontrar o acervo
        inteiro na primeira página, não só dois rótulos.
      */}
      <div className="lista-sem-js">
        <h2>Todas as peças</h2>
        <ul>
          {semJs.map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
