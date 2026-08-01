"use client";

import type { RefObject } from "react";
import type { GrupoInfo, Grupo } from "@/lib/manifesto";

type Props = {
  grupos: GrupoInfo[];
  grupoAtivo: Grupo | null;
  zoomPercent: number;
  registrarEl: (el: HTMLDivElement | null) => void;
  zoomLabelRef: RefObject<HTMLSpanElement | null>;
  onEnquadrarGrupo: (grupo: Grupo | null) => void;
};

export function BarraControles({
  grupos,
  grupoAtivo,
  zoomPercent,
  registrarEl,
  zoomLabelRef,
  onEnquadrarGrupo,
}: Props) {
  return (
    <div
      ref={registrarEl}
      className="vidro pointer-events-auto absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-control p-1.5"
      role="toolbar"
      aria-label="Navegação do plano"
    >
      <button
        type="button"
        onClick={() => onEnquadrarGrupo(null)}
        aria-pressed={grupoAtivo === null}
        className="rounded-control px-3 py-1.5 text-body-sm font-medium text-text-primary transition-colors duration-[0.18s] ease-out aria-pressed:bg-clay-primary aria-pressed:text-clay-primary-ink hover:bg-bg-solid"
      >
        Ver tudo
      </button>
      {grupos.map((g) => (
        <button
          key={g.chave}
          type="button"
          onClick={() => onEnquadrarGrupo(g.chave)}
          aria-pressed={grupoAtivo === g.chave}
          className="rounded-control px-3 py-1.5 text-body-sm font-medium text-text-primary transition-colors duration-[0.18s] ease-out aria-pressed:bg-clay-primary aria-pressed:text-clay-primary-ink hover:bg-bg-solid"
        >
          {g.titulo}
        </button>
      ))}
      <span
        ref={zoomLabelRef}
        className="ml-1 pr-2 text-body-sm tabular-nums text-text-muted"
        aria-live="polite"
      >
        {zoomPercent}%
      </span>
    </div>
  );
}
