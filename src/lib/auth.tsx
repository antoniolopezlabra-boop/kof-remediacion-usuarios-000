import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Rol = 'lector' | 'editor' | 'admin';

export interface Perfil {
  id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
}

interface AuthCtx {
  session: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  puedeEditar: boolean;
  esAdmin: boolean;
  salir: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) {
      setPerfil(null);
      return;
    }
    setCargando(true);
    supabase
      .from('perfiles')
      .select('*')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        setPerfil(data as Perfil | null);
        setCargando(false);
      });
  }, [uid]);

  const value: AuthCtx = {
    session,
    perfil,
    cargando,
    puedeEditar: perfil?.rol === 'editor' || perfil?.rol === 'admin',
    esAdmin: perfil?.rol === 'admin',
    salir: async () => {
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}

export const NOMBRE_ROL: Record<Rol, string> = {
  lector: 'Cliente · lectura',
  editor: 'TQS · edición',
  admin: 'Administrador',
};
