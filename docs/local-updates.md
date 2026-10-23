# Actualizaciones del acceso local de Padel Center

El acceso local conserva su propia copia de la app y utiliza la base real de Padel Center. El servidor se vincula únicamente a `127.0.0.1`; no requiere instalar dependencias con npm en el cliente.

## Entregar el paquete inicial

1. Generar y publicar la compilación correspondiente:

   ```powershell
   node scripts/release-clients.mjs build padel-center
   node scripts/release-clients.mjs deploy padel-center
   node scripts/release-clients.mjs verify padel-center
   node scripts/package-local-build.mjs
   ```

2. Entregar el ZIP `output/padel-center-local-actualizable-<versión>.zip`.
3. En el cliente, cerrar el servidor anterior, extraer en una carpeta nueva y ejecutar su `INICIAR-PADEL-CENTER.cmd`. Actualizar el acceso directo para que use ese iniciador. El ZIP incluye `LEEME.txt` con las instrucciones.

Esta instalación inicial es necesaria porque el servidor anterior no contiene el actualizador. No se modifican los datos ni las credenciales del complejo.

## Publicaciones siguientes

Usar los mismos comandos `build`, `deploy` y `verify` de Padel Center. La compilación genera automáticamente `local-update.json`, con un identificador de versión incorporado en la app, fecha de publicación y la lista de archivos con tamaño y SHA-256. No hace falta entregar otro ZIP para actualizar la interfaz.

Opcionalmente, definir `RELEASE_NOTES` antes del build, con una novedad por línea. Si se omite, el aviso dice “Mejoras y correcciones del sistema”. Las novedades se incorporan al manifiesto público.

El actualizador descarga solo archivos de la interfaz desde `https://padelcenter.netlify.app/`; no ejecuta código Node descargado ni reemplaza su propio servidor. Un cambio futuro del protocolo del actualizador puede requerir renovar el paquete inicial.

## Comportamiento

- Al iniciar el servidor y al abrir o recargar una página se comprueba la publicación y se puede activar la nueva versión antes de entregar el HTML.
- Mientras la app está abierta, se comprueba periódicamente la publicación. Aparece “Hay una actualización disponible”, con “Actualizar y recargar” y la posibilidad de posponer el aviso.
- La app no recarga por su cuenta una pestaña en la que se está trabajando. Si otra pestaña actualiza, ofrece recargar cuando el usuario esté listo.
- Tras instalar una versión, aparece “El sistema se actualizó correctamente”, con fecha y novedades. El usuario puede cerrar ese aviso.
- La copia nueva se descarga en una carpeta distinta. Solo se cambia el archivo de versión activa después de verificar todos los archivos. Las copias anteriores permanecen disponibles para las pestañas abiertas y para recuperación.
- Ante errores de conexión, integridad o escritura, se conserva la copia actual. Una copia activa dañada se reemplaza al iniciar por la copia anterior verificada o por la incluida en el ZIP.
- El contenido servido se limita a archivos declarados en la versión. El servidor, sus registros de actualización y los archivos de configuración no se exponen por HTTP. Las acciones de actualización requieren el origen local y un token del servidor.

## Verificación

```powershell
node scripts/test-local-updates.mjs
```

Las pruebas usan un servidor de publicaciones temporal y verifican inicio, navegación, descarga incompleta, integridad, fallas de escritura, concurrencia, archivos de pestañas anteriores, recuperación, límites de rutas y protección de solicitudes locales. No modifican la base de datos ni los sitios publicados.
