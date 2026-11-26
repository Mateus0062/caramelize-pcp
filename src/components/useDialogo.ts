"use client";

import { useEffect, useRef } from "react";

/**
 * Comportamento acessível para modais de cadastro:
 * - ao abrir, leva o foco para o primeiro campo do modal;
 * - Esc fecha;
 * - ao fechar, devolve o foco para onde estava (ex.: o botão que abriu).
 *
 * Uso: const ref = useDialogo<HTMLDivElement>(aberto, () => setAberto(false));
 *      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="...">
 */
export function useDialogo<T extends HTMLElement>(aberto: boolean, fechar: () => void) {
  const ref = useRef<T>(null);
  const fecharRef = useRef(fechar);

  useEffect(() => {
    fecharRef.current = fechar;
  }, [fechar]);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const alvo =
      ref.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea") ??
      ref.current?.querySelector<HTMLElement>("button");
    alvo?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) {
        e.preventDefault();
        fecharRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      anterior?.focus?.();
    };
  }, [aberto]);

  return ref;
}
