# Guía de Provisionamiento y Administración de Identidad

Esta guía detalla cómo gestionar usuarios, roles y el alta masiva de nuevos clientes (Tenants) en OmniFood NI.

## 1. Alta de Nuevos Clientes (Provisionamiento Masivo)

Para dar de alta un nuevo negocio en la plataforma, contamos con un script de consola que crea tanto el `Tenant` como su primer usuario `OWNER` de forma transaccional.

### Ejecución del Script
Desde la carpeta raíz del proyecto:

```bash
cd apps/admin_backend
npx ts-node src/scripts/provision.ts
```

El script solicitará interactivamente:
1.  **Nombre del Negocio**: Nombre legal o comercial.
2.  **RUC**: Registro único de contribuyente (opcional).
3.  **Nombre del Dueño**: Nombre de la persona que administrará el tenant.
4.  **Email**: Correo para acceso web.
5.  **Contraseña**: Clave para el dashboard administrativo.
6.  **PIN**: Código numérico (4-6 dígitos) para acceso rápido al POS.

## 2. Administración de Usuarios (Dashboard / API)

Una vez que un `OWNER` tiene acceso, puede gestionar a su propio equipo (Cajeros, Meseros, Managers) a través de la API de identidad.

### Endpoints de Gestión
Todos los endpoints requieren un token JWT de un usuario con rol `OWNER`.

*   **Listar Staff**: `GET /api/identity/users`
    *   Retorna todos los empleados activos del tenant.
*   **Crear Empleado**: `POST /api/identity/users`
    *   Payload: `{ "email": "...", "name": "...", "role": "CASHIER", "pin": "1234" }`
    *   Nota: El `tenant_id` se asigna automáticamente mediante el interceptor de RLS.
*   **Actualizar**: `PUT /api/identity/users/:id`
    *   Permite cambiar roles, nombres o resetear el PIN.
*   **Baja (Soft Delete)**: `DELETE /api/identity/users/:id`
    *   Desactiva al usuario para que no pueda loguearse ni sincronizarse.

## 3. Seguridad e Integridad

1.  **Inmutabilidad**: Las acciones de gestión (creación, edición, baja) generan automáticamente un registro en `audit_logs` para cumplimiento con la DGI.
2.  **No-Any**: Todos los DTOs e interfaces de usuario están estrictamente tipados. No se permiten datos genéricos en el flujo de identidad.
3.  **Aislamiento (RLS)**: Un `OWNER` solo puede interactuar con usuarios que compartan su `tenant_id`. La base de datos garantiza este aislamiento a nivel de fila.

## 4. Sincronización con el POS

El POS realiza un "Pull" periódico de los hashes de los PINs de los usuarios activos. Esto permite que el personal pueda loguearse en la tablet incluso si el local se queda sin internet en Managua.
