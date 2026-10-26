# Despliegue automático de Pádel Center

El sitio existente `padelcenter.netlify.app` se conecta al repositorio
`marcosabella/gentionreservascancha`, rama `master`.

Netlify instala las dependencias del lockfile y ejecuta
`node scripts/build-netlify.mjs`, con salida en `dist` y Node.js 22.
La compilación recibe las variables del propio sitio de Netlify:

- `VITE_COMPLEX_NAME`: `PADEL CENTER`.
- `VITE_SUPABASE_URL`: `https://zcixnnzxxkylotbjudhk.supabase.co`.
- `VITE_SUPABASE_ANON_KEY`: clave pública del proyecto, configurada en Netlify.
- `VITE_SUPABASE_FUNCTIONS_URL`: vacío, para usar las funciones del mismo Supabase.
- `VITE_TEST_ENVIRONMENT`: `false`.

El proceso verifica la base y la marca antes de publicar, genera la app
instalable, las rutas de la aplicación y `local-update.json` para las
instalaciones locales. La versión corresponde al commit publicado.
No requiere sesiones de Supabase CLI ni llamadas a modelos de IA.

Las migraciones y funciones de Supabase se administran por separado.
Pura Vida conserva su configuración y publicación independiente hasta que se
solicite vincular también ese sitio.
