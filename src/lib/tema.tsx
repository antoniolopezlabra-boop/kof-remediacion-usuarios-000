import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface TemaCtx {
  oscuro: boolean;
  alternar: () => void;
  fijar: (oscuro: boolean) => void;
}
const Ctx = createContext<TemaCtx | null>(null);

function leer(): boolean {
  try {
    const t = localStorage.getItem('tema');
    if (t) return t === 'oscuro';
  } catch {
    /* almacenamiento no disponible */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [oscuro, setOscuro] = useState(leer);
  useEffect(() => {
    document.documentElement.dataset.theme = oscuro ? 'dark' : 'light';
    try {
      localStorage.setItem('tema', oscuro ? 'oscuro' : 'claro');
    } catch {
      /* almacenamiento no disponible */
    }
  }, [oscuro]);
  return <Ctx.Provider value={{ oscuro, alternar: () => setOscuro((o) => !o), fijar: setOscuro }}>{children}</Ctx.Provider>;
}

export function useTema() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTema fuera de TemaProvider');
  return c;
}
