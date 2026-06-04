# Gestión de Usuario Admin en Base de Datos

## Descripción General

Se ha migrado la gestión del usuario administrador de un sistema hardcodeado a una gestión completamente controlada por la base de datos Supabase. Esto mejora significativamente la seguridad y flexibilidad del sistema.

## Cambios Realizados

### 1. Eliminación de Credenciales Hardcodeadas

**Antes:**
- Usuario admin por defecto con credenciales `admin/admin`
- Credenciales mostradas en el formulario de login
- Almacenadas en `src/data/appUsers.ts`

**Ahora:**
- No hay credenciales predefinidas
- El primer usuario creado en el sistema automáticamente se asigna como admin
- El sistema rastrea si un admin ha sido inicializado en la tabla `system_config`

### 2. Nueva Tabla en Base de Datos

Se creó la tabla `system_config` con la siguiente estructura:

```sql
CREATE TABLE system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  is_sensitive boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Configuraciones iniciales:**
- `admin_initialized`: Indica si un usuario admin ha sido creado (valor: 'true'/'false')
- `system_name`: Nombre del sistema (valor: 'Tennis Court Management')
- `version`: Versión del sistema (valor: '1.0.0')

### 3. Funciones de Base de Datos

Se crearon dos funciones SQL para manejar la lógica de admin:

#### `handle_first_admin()`
- Trigger que se ejecuta cuando se crea un usuario con rol admin
- Actualiza automáticamente `system_config` cuando se inicializa el primer admin

#### `make_first_user_admin()`
- Función que puede ser llamada para promocionar el primer usuario creado al rol de admin
- Útil para la inicialización del sistema

### 4. Nuevo Servicio: `adminService.ts`

Ubicación: `src/services/adminService.ts`

Funciones disponibles:

```typescript
// Obtener configuración del admin
getAdminConfig(): Promise<AdminConfig | null>

// Verificar si el admin ha sido inicializado
isAdminInitialized(): Promise<boolean>

// Promocionar el primer usuario a admin
promoteFirstUserToAdmin(): Promise<{ success: boolean; message: string }>

// Obtener el primer usuario admin
getFirstAdmin(): Promise<any | null>

// Actualizar configuración del sistema
updateSystemConfig(key: string, value: string): Promise<boolean>
```

### 5. Cambios en Componentes

#### `LoginForm.tsx`
- Removido placeholder hardcodeado `"admin"`
- Actualizado a placeholder genérico `"Tu usuario"`
- Removida la sección de información que mostraba credenciales por defecto
- Reemplazada con información genérica sobre el login

#### `appUsers.ts`
- Removido el usuario admin por defecto de `getAppUsers()`
- Ahora retorna un array vacío si no hay usuarios en localStorage
- El fallback al admin hardcodeado ha sido eliminado

#### `useAuth.ts`
- Removida la lógica que verificaba/cargaba el admin por defecto
- Ahora solo verifica la sesión guardada en localStorage

### 6. Flujo de Inicialización del Admin

1. **Primera ejecución del sistema:**
   - El usuario llega al login
   - No hay usuarios en la base de datos
   - `system_config.admin_initialized` = 'false'

2. **Crear primer usuario:**
   - El administrador del sistema crea el primer usuario
   - Puede elegir el rol: 'admin' o 'player'
   - Si elige 'admin', el trigger `handle_first_admin` marca `admin_initialized` = 'true'

3. **Verificación:**
   - Usar `isAdminInitialized()` del `adminService` para verificar el estado

4. **Recuperación:**
   - Si necesita promocionar un usuario existente: usar `promoteFirstUserToAdmin()`

## Consideraciones de Seguridad

1. **Row Level Security (RLS):**
   - La tabla `system_config` tiene RLS habilitada
   - Solo el service role (Edge Functions) puede modificarla
   - Los usuarios normales no pueden acceder

2. **Configuración Sensible:**
   - Campo `is_sensitive` para marcar datos sensibles
   - Los datos sensibles no deben ser expuestos en el frontend

3. **Auditoría:**
   - Todos los cambios son registrados con `updated_at`
   - Se puede rastrear cuándo fue inicializado el admin

## Cómo Usar

### Para Verificar si el Admin está Inicializado

```typescript
import { isAdminInitialized } from '../services/adminService';

const initialized = await isAdminInitialized();
if (!initialized) {
  console.log('Admin aún no ha sido inicializado');
}
```

### Para Promocionar un Usuario a Admin

```typescript
import { promoteFirstUserToAdmin } from '../services/adminService';

const result = await promoteFirstUserToAdmin();
if (result.success) {
  console.log(result.message);
}
```

### Para Obtener la Configuración del Sistema

```typescript
import { getAdminConfig } from '../services/adminService';

const config = await getAdminConfig();
console.log(config.systemName); // 'Tennis Court Management'
console.log(config.version); // '1.0.0'
```

## Migraciones de Base de Datos

Las siguientes migraciones fueron aplicadas:

1. `create_system_config_table` - Crea la tabla de configuración del sistema
2. `update_admin_management` - Agrega funciones y triggers para gestionar el admin

## Próximos Pasos Recomendados

1. **Implementar UI para Primera Inicialización:**
   - Crear una pantalla de setup para el primer usuario admin

2. **Agregar Logs de Auditoría:**
   - Rastrear quién crea/modifica usuarios admin

3. **Implementar Recuperación de Contraseña:**
   - Sistema seguro para resetear contraseña del admin

4. **Validación Adicional:**
   - Verificar que siempre haya al menos un admin activo
