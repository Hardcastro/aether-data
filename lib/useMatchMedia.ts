"use client";

import { useEffect, useState } from "react";

/** Reavalia quando a preferência muda — a pessoa pode ligar reduced-motion com o site aberto. */
export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

const QUERY_LISTA = "(max-width: 900px), (pointer: coarse)";

/**
 * Um hook só, uma fonte de verdade: SSR e primeiro paint sempre "lista"
 * (default seguro), corrigido num único efeito assim que o matchMedia real
 * é lido — sem passo intermediário que possa piscar o modo errado.
 */
export function useModoPlano(): boolean {
  const [modoPlano, setModoPlano] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY_LISTA);
    const aplicar = () => setModoPlano(!mql.matches);
    aplicar();
    mql.addEventListener("change", aplicar);
    return () => mql.removeEventListener("change", aplicar);
  }, []);

  return modoPlano;
}
