import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { DatosProvider } from './lib/datos';
import { TemaProvider } from './lib/tema';
import { AvisosProvider, Cargando } from './components/ui';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

const Gestion = lazy(() => import('./pages/Gestion'));
const Bitacora = lazy(() => import('./pages/Bitacora'));
const Admin = lazy(() => import('./pages/Admin'));

function Rutas() {
  const { session, perfil, cargando, esAdmin } = useAuth();
  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!session || !perfil) return <Login />;
  return (
    <DatosProvider>
      <Suspense fallback={<Cargando />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="gestion" element={<Gestion />} />
            <Route path="bitacora" element={<Bitacora />} />
            {esAdmin && <Route path="admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </DatosProvider>
  );
}

export default function App() {
  return (
    <TemaProvider>
      <AvisosProvider>
        <AuthProvider>
          <HashRouter>
            <Rutas />
          </HashRouter>
        </AuthProvider>
      </AvisosProvider>
    </TemaProvider>
  );
}
