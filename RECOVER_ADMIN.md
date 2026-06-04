# Recuperación de Credenciales del Admin

Si olvidaste las credenciales del usuario admin, aquí hay 3 formas de recuperarlas:

## Opción 1: Usar la Edge Function (Recomendado)

Ejecuta este comando en tu terminal:

```bash
curl -X POST https://zcixnnzxxkylotbjudhk.supabase.co/functions/v1/reset-admin-password \
  -H "Content-Type: application/json" \
  -d '{"newPassword": "tu_nueva_contraseña_aqui"}'
```

**Ejemplo:**
```bash
curl -X POST https://zcixnnzxxkylotbjudhk.supabase.co/functions/v1/reset-admin-password \
  -H "Content-Type: application/json" \
  -d '{"newPassword": "Admin123!Nuevo"}'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Contraseña del admin reseteada exitosamente",
  "adminEmail": "admin@example.com"
}
```

---

## Opción 2: Acceso Directo a Supabase Dashboard

1. Ve a [Supabase Dashboard](https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a **Authentication** → **Users**
4. Busca el usuario con rol `admin`
5. Haz clic en el icono de ⚙️ (settings)
6. Selecciona **Reset password**
7. Se enviará un email de recuperación

---

## Opción 3: Query SQL Directo (Si tienes acceso a la BD)

```sql
-- Ver todos los usuarios admin
SELECT id, username, email, role, is_active, created_at
FROM user_profiles
WHERE role = 'admin'
ORDER BY created_at ASC;

-- Para resetear manualmente (requiere ser service role):
-- Esto actualizaría el password en Supabase Auth
UPDATE auth.users
SET encrypted_password = crypt('tu_nueva_contraseña', gen_salt('bf'))
WHERE id = 'user_id_aqui';
```

---

## Información de Tu Sistema

**URL del Proyecto:** `https://zcixnnzxxkylotbjudhk.supabase.co`

**Edge Function de Reset:** `/functions/v1/reset-admin-password`

---

## Pasos Después de Resetear la Contraseña

1. ✅ Ejecuta el comando curl anterior con tu nueva contraseña
2. ✅ Ve al login de la aplicación
3. ✅ Ingresa con:
   - **Usuario:** (tu nombre de usuario admin)
   - **Contraseña:** (la nueva que estableciste)
4. ✅ Dentro de la aplicación, ve a **Gestión de Usuarios** si es necesario cambiarla nuevamente

---

## Requisitos de Contraseña

- Mínimo 6 caracteres
- Recomendado: Incluir mayúsculas, minúsculas, números y caracteres especiales
- Ejemplo de contraseña segura: `PadelCenter2025!Secure`

---

## Problema: No Recuerdo ni el Email ni el Username

Si no recuerdas el email o username del admin:

```sql
-- Ejecuta esto en SQL Editor del Supabase Dashboard
SELECT
  id,
  username,
  email,
  role,
  is_active,
  created_at,
  updated_at
FROM user_profiles
WHERE role = 'admin'
LIMIT 1;
```

Esto te mostrará los detalles del primer admin creado.

---

## ¿Aún No Has Creado Usuario Admin?

Si el sistema está vacío y no hay admin:

1. Abre la aplicación
2. Ve a **Gestión de Usuarios**
3. Crea un nuevo usuario y selecciona rol **Admin**
4. Usa esas credenciales para login

O ejecuta SQL:

```sql
-- Verificar si hay algún usuario admin
SELECT COUNT(*) FROM user_profiles WHERE role = 'admin';

-- Si la respuesta es 0, necesitas crear uno
-- Crea un nuevo usuario primero en la UI de la aplicación
```

---

## Soporte Técnico

Si necesitas más ayuda, verifica:

1. ¿El Supabase está funcionando? Revisa el dashboard
2. ¿La Edge Function está deployada? Ve a Functions en Supabase
3. ¿Los usuarios existen? Revisa la tabla `user_profiles` en SQL Editor

**Logs útiles:**
- Ve a **Edge Function** → `reset-admin-password` → **Logs** para ver errores
