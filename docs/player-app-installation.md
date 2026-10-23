# Instalación móvil del panel jugador

El panel jugador muestra **Instalar app** en pantallas menores a 768 px y en un contexto seguro. El acceso sigue usando la web pública y las credenciales habituales del complejo.

- En navegadores que emiten `beforeinstallprompt`, el botón abre la confirmación del navegador. El evento se captura al iniciar la app, antes del ingreso, para conservarlo hasta que el jugador abra su panel.
- Cuando el navegador todavía no ofrece la confirmación o no implementa ese evento, el botón muestra instrucciones del menú del navegador.
- En iPhone e iPad se indican los pasos de Safari: Compartir, Agregar a pantalla de inicio y Agregar. La instalación requiere la confirmación del usuario en su dispositivo.
- Al abrir la aplicación en modo independiente o recibir `appinstalled`, la tarjeta de instalación se oculta. No se guarda una marca permanente que impida volver a instalar si el usuario la desinstala.

Cada compilación genera `manifest.json` y `sw.js` con el nombre del complejo. Los iconos PNG de 192 y 512 px y el icono Apple de 180 px reutilizan el logo original sobre un fondo opaco, dentro del área segura para recortes. Para regenerarlos en Windows:

```powershell
node scripts/generate-pwa-icons.mjs
```

El worker solicita siempre la navegación a la red y muestra una página de conexión cuando la red falla. No guarda páginas de cuenta, respuestas de Supabase ni operaciones pendientes. Las reservas y movimientos siguen necesitando Internet.

El worker se registra solo en la compilación de producción servida por HTTPS. No se registra en localhost ni en XAMPP, para conservar el funcionamiento del actualizador local. Los archivos nuevos del sitio sí quedan incluidos en la publicación y en su manifiesto de actualización local.

Verificación:

```powershell
node scripts/test-pwa.mjs
node scripts/release-clients.mjs build padel-center
node scripts/release-clients.mjs build pura-vida
```

La confirmación física del sistema operativo se debe comprobar desde un celular compatible, fuera del modo privado y usando el enlace público HTTPS de cada complejo. Los criterios del navegador pueden requerir unos segundos de permanencia o interacción antes de habilitar el aviso nativo; la guía manual permanece disponible.

Referencias: [MDN: instalación](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN: botón de instalación](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt), [web.dev: instalación en dispositivos](https://web.dev/learn/pwa/installation).
