# Actualizaciones del acceso local de Padel Center

El acceso local conserva su propia copia de la app y utiliza la base real de Padel Center. La instalación del cliente está en `C:\xampp\htdocs\Sistema de Reservas` y se sirve mediante Apache y PHP de XAMPP. No requiere Node.js ni dependencias de npm en el cliente.

## Entregar el paquete inicial

1. Generar y publicar la compilación correspondiente:

   ```powershell
   node scripts/release-clients.mjs build padel-center
   node scripts/release-clients.mjs deploy padel-center
   node scripts/release-clients.mjs verify padel-center
   node scripts/package-local-build.mjs
   ```

2. Entregar el ZIP `output/padel-center-xampp-actualizable-<versión>.zip`.
3. Respaldar la carpeta actual y copiar el contenido del paquete en `C:\xampp\htdocs\Sistema de Reservas`. Deben quedar `index.php`, `.htaccess`, `app` y `runtime` en su raíz. Se pueden conservar los archivos anteriores: el controlador pasa a servir la copia verificada de `app`.
4. Mantener Apache iniciado y abrir `http://localhost/Sistema%20de%20Reservas/`. El paquete incluye `LEEME-XAMPP.txt` con las instrucciones.

Esta instalación inicial es necesaria porque la copia estática anterior no contiene el actualizador. Se requieren PHP 8.1 o superior, cURL, mod_rewrite, AllowOverride All y permiso de escritura en la carpeta del sistema. No se modifican los datos ni las credenciales del complejo.

Para instalaciones que usan el servidor Node independiente, `node scripts/package-local-build.mjs --node` sigue generando el paquete con `INICIAR-PADEL-CENTER.cmd`. Esa variante se vincula únicamente a `127.0.0.1`.

## Publicaciones siguientes

Usar los mismos comandos `build`, `deploy` y `verify` de Padel Center. La compilación genera automáticamente `local-update.json`, con un identificador de versión incorporado en la app, fecha de publicación y la lista de archivos con tamaño y SHA-256. No hace falta entregar otro ZIP para actualizar la interfaz.

Opcionalmente, definir `RELEASE_NOTES` antes del build, con una novedad por línea. Si se omite, el aviso dice “Mejoras y correcciones del sistema”. Las novedades se incorporan al manifiesto público.

El actualizador descarga solo archivos de la interfaz desde `https://padelcenter.netlify.app/`; no ejecuta PHP ni código Node descargado ni reemplaza su propio servidor. Un cambio futuro del protocolo del actualizador puede requerir renovar el paquete inicial.

## Comportamiento

- Al abrir o recargar una página se comprueba la publicación y se puede activar la nueva versión antes de entregar el HTML. La variante Node también comprueba al iniciar el servidor.
- Mientras la app está abierta, se comprueba periódicamente la publicación. Aparece “Hay una actualización disponible”, con “Actualizar y recargar” y la posibilidad de posponer el aviso.
- La app no recarga por su cuenta una pestaña en la que se está trabajando. Si otra pestaña actualiza, ofrece recargar cuando el usuario esté listo.
- Tras instalar una versión, aparece “El sistema se actualizó correctamente”, con fecha y novedades. El usuario puede cerrar ese aviso.
- La copia nueva se descarga en una carpeta distinta. Solo se cambia el archivo de versión activa después de verificar todos los archivos. Las copias anteriores permanecen disponibles para las pestañas abiertas y para recuperación.
- Ante errores de conexión, integridad o escritura, se conserva la copia actual. Una copia activa dañada se reemplaza al iniciar por la copia anterior verificada o por la incluida en el ZIP.
- El contenido servido se limita a archivos declarados en la versión. El servidor, sus registros de actualización y los archivos de configuración no se exponen por HTTP. Las acciones de actualización requieren el origen local y un token del servidor.

## Verificación

```powershell
node scripts/test-local-updates.mjs
node scripts/test-xampp-updates.mjs
```

Las pruebas usan un servidor de publicaciones temporal y verifican inicio, navegación, descarga incompleta, integridad, fallas de escritura, concurrencia, archivos de pestañas anteriores, recuperación, límites de rutas y protección de solicitudes locales. La prueba de XAMPP requiere PHP con cURL; detecta `C:\xampp\php\php.exe` o usa `PHP_EXECUTABLE`. No modifican la base de datos ni los sitios publicados.
