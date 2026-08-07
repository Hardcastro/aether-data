"use client";

import { useEffect, useRef } from "react";

/**
 * Os "dados" subindo no fundo. Estava dentro do Hero até 07/08; saiu porque a
 * home e as duas vitrines em grade também precisam dele — e porque ele nunca
 * dependeu de nada do Hero, só de um nó para pendurar os filhos.
 *
 * Quem pede menos movimento não recebe nenhum: o efeito nem registra o
 * intervalo, em vez de criar e esconder por CSS.
 */
export function Particulas() {
  const alvoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const alvo = alvoRef.current;
    if (!alvo) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const criar = () => {
      const p = document.createElement("div");
      p.className = "dado";
      const tamanho = Math.random() * 20 + 10;
      p.style.width = `${tamanho}px`;
      p.style.height = `${tamanho}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.bottom = "-50px";
      p.style.opacity = String(Math.random() * 0.4 + 0.2);
      const dur = Math.random() * 6 + 4;
      p.style.animation = `subirDado ${dur}s linear forwards`;
      alvo.appendChild(p);
      const t = setTimeout(() => {
        p.remove();
        timers.delete(t);
      }, dur * 1000);
      timers.add(t);
    };

    const intervalo = setInterval(criar, 400);
    return () => {
      clearInterval(intervalo);
      for (const t of timers) clearTimeout(t);
      alvo.replaceChildren();
    };
  }, []);

  return <div id="particulas" ref={alvoRef} aria-hidden="true" />;
}
