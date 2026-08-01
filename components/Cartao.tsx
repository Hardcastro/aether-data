"use client";

import Link from "next/link";
import type { Peca } from "@/lib/manifesto";

type Props = {
  peca: Peca;
  registrarEl: (slug: string, el: HTMLAnchorElement | null) => void;
  onSuprimir: (slug: string, ativo: boolean) => void;
  onFocoCamera: (slug: string) => void;
  onAbrir: (slug: string) => void;
};

export function Cartao({ peca, registrarEl, onSuprimir, onFocoCamera, onAbrir }: Props) {
  return (
    <Link
      href={`/?peca=${peca.slug}`}
      scroll={false}
      ref={(el) => registrarEl(peca.slug, el)}
      data-slug={peca.slug}
      data-grupo={peca.grupo}
      className="cartao group block rounded-card bg-glass-solid-bg p-5 text-left shadow-clay transition-[box-shadow] duration-[0.18s] ease-out hover:shadow-clay-active focus-visible:shadow-clay-active"
      style={
        {
          "--pos-x": peca.posicao.x,
          "--pos-y": peca.posicao.y,
        } as React.CSSProperties
      }
      onFocus={() => {
        onSuprimir(peca.slug, true);
        onFocoCamera(peca.slug);
      }}
      onBlur={() => onSuprimir(peca.slug, false)}
      onMouseEnter={() => onSuprimir(peca.slug, true)}
      onMouseLeave={() => onSuprimir(peca.slug, false)}
      onClick={() => onAbrir(peca.slug)}
    >
      <h3 className="text-body font-medium text-text-primary">{peca.nome}</h3>
      <p className="mt-1.5 text-body-sm text-text-muted">{peca.capacidade}</p>
      <p className="mt-3 text-body-sm text-text-secondary opacity-0 transition-opacity duration-[0.18s] ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
        Ver peça →
      </p>
    </Link>
  );
}
