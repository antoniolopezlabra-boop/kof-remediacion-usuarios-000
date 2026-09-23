# Remediación de Usuarios SAP · Mandante 000 (KOF)

Tablero ejecutivo y plataforma operativa para la remediación de usuarios
SAP del mandante 000 de Coca-Cola FEMSA, operado por DXC Technology.

- **Dashboard ejecutivo**: avance, estatus, ambientes, administradores, sistemas, riesgo
  (usuarios con SAP_ALL / SAP_NEW), detalle por SID (filtro de ambiente → SID con estatus,
  tipos de usuario y lista exportable), tendencia diaria, calidad del dato. Filtros cruzados con un clic,
  modo presentación (pantalla completa) y exportación a PDF.
- **Gestión de usuarios** (tipo hoja de cálculo): el equipo TQS edita cualquier columna con
  clic en la celda (Enter/Tab guarda y avanza, Esc cancela), cambia cualquier columna en bloque,
  agrega filas nuevas («No.» consecutivo automático) o duplica una existente. Solo el
  administrador puede eliminar filas. Todo cambio queda en la bitácora y los tableros se recalculan
  en vivo para todos (Supabase Realtime).
- **Asistente IA (Claude)**: responde preguntas con los datos vivos mediante herramientas
  (no inventa cifras) y, cuando la respuesta no está en el tablero, crea una tarjeta
  permanente en «Insights IA» que se recalcula sola.
- **Roles**: `lector` (cliente KOF), `editor` (TQS), `admin`. Seguridad por RLS en la base.
- **Contraseñas**: cada usuario la cambia cuando quiera desde el menú lateral («Cambiar contraseña»;
  pide la actual). Política: mínimo 8 caracteres con mayúscula, minúscula y número (`supabase/config.toml`).

## Arquitectura

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 + ECharts (SPA estática → GitHub Pages) |
| Datos | Supabase (Postgres + Auth + Realtime), esquema en `supabase/migrations/` |
| IA | Edge Function `asistente` → Claude Haiku 4.5 (`claude-haiku-4-5`, el modelo más económico) con herramientas sobre el inventario |
| Accesos | Edge Function `admin-usuarios` (alta/rol/contraseña/baja; solo admin) |
| Lógica compartida | `supabase/functions/_shared/datos.ts` (normalización, filtros, agregados, tarjetas) — la usan el frontend, el script de carga y las funciones |

Tablas: `usuarios_sap` (hoja Consolidado), `catalogo_estatus`, `bitacora` (trigger),
`snapshots` (trigger, un registro por día → tendencia), `widgets_ia`, `perfiles`, `app_config`.

## Ejecutar en local

Requisitos: Node 22+, Supabase CLI, Docker (en Mac: `brew install colima docker && colima start`).

```bash
supabase start                       # base de datos local (aplica migraciones)
npm install
cp .env.example .env.local           # pega la "Publishable key" de `supabase status`
npm run cargar -- "/ruta/Gestion de usuarios 000 ... .xlsx" --reemplazar
supabase functions serve --env-file supabase/functions/.env   # IA y accesos
npm run dev                          # http://localhost:5173
```

Para crear el primer administrador agrega `--admin tu.correo@empresa.com`: el script genera
una contraseña temporal aleatoria y la muestra una sola vez. Los demás accesos se dan de alta
desde **Administración → Accesos**, y cada usuario cambia su contraseña desde el menú lateral.

### Asistente IA

Crea `supabase/functions/.env` (ya está en `.gitignore`) con:

```
ANTHROPIC_API_KEY=sk-ant-...
```

La llave vive solo en el servidor; nunca llega al navegador.

## Publicar (GitHub Pages + Supabase en la nube)

1. Crea el proyecto en Supabase y aplica el esquema: `supabase link --project-ref <ref> && supabase db push`.
2. Despliega funciones y la llave de IA:
   `supabase functions deploy --no-verify-jwt` y `supabase secrets set ANTHROPIC_API_KEY=...`.
3. Carga el Excel contra la nube: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run cargar -- archivo.xlsx --reemplazar`.
4. En GitHub: *Settings → Pages → Source: GitHub Actions* y agrega los secretos
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (y, para migraciones automáticas,
   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` + variable
   `DESPLEGAR_SUPABASE=true`).
5. En Supabase → Auth → URL Configuration agrega la URL de GitHub Pages.

Cada `git push` a `main` vuelve a publicar el sitio automáticamente (`.github/workflows/deploy.yml`).

> Las funciones se despliegan con `--no-verify-jwt` porque validan la sesión en su propio
> código (`auth.getUser`), lo que las hace compatibles con llaves JWT asimétricas.
