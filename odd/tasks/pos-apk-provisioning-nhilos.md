# Provisioning del APK sin intervención manual (#941)

Feature specification and execution tracking for issue #941.
Ensures production APKs default to production backend URL and terminals distinguish unconfigured transport from auth errors.

## Specs

- S1: **El artefacto declara su backend de destino de forma consultable**: `scripts/build_pos_apk.sh` admite `--preset production` (`https://api.nhilospos.com/api`) y `--preset staging` (`https://api-staging.nhilospos.com/api`), y `release_manifest.json` registra `"api_url"` y `"api_preset"`.
- S2: **Existe un camino de provisioning sin intervención humana**: el build de producción hornea el define `API_URL` por defecto o vía preset oficial. Además, en la pantalla de vinculación inicial `LinkTerminalView` o `LoginView`, si el terminal no tiene servidor configurado, ofrece con un toque "Conectar a Producción" sin requerir entrar a pantallas técnicas ocultas.
- S3: **El mensaje de fallo de login distingue las causas**: "Esta terminal no tiene un servidor configurado" con la acción concreta a seguir, separado de "Correo o contraseña incorrectos" y de "Sin conexión al servidor". Un terminal sin URL no debe reportar un error de autenticación ni sobreescribir el error con "usuario no encontrado".
- S4: **La app dice en la pantalla de identidad cuál es el backend efectivo y si coincide con el esperado**: `TerminalIdentityViewModel` y `TerminalIdentityView` exponen el entorno (`Producción`, `Staging`, `Personalizado`, `Sin configurar`) con badge visual de confirmación o alerta visible a simple vista.
- S5: **El runbook de instalación (`docs/nhilos/runbooks/nhilos_op01_customer_provisioning_runbook_v0.1.md`) cubre el aprovisionamiento y verificación**: verificación del manifest antes de instalar, manejo de APKs con y sin define, y confirmación visual del badge en pantalla de identidad.
- S6: **Cobertura de pruebas de regresión**: tests para packaging pipeline (`test_packaging_pipeline.sh`), `AuthRepositoryImpl` (distinción de `UnconfiguredBackendException`), `TerminalIdentityViewModel`/View (detección de entorno) y `LinkTerminalView` / `LoginView`.

## Tasks

- T1 [S1, S2]: Soporte de `--preset production|staging` en `scripts/build_pos_apk.sh`, enriquecimiento de `release_manifest.json` y tests en `scripts/test_packaging_pipeline.sh`.
- T2 [S3]: Corregir en `AuthRepositoryImpl.loginOnline` la sobreescritura de `UnconfiguredBackendException`, asegurando que reporte explícitamente "Esta terminal no tiene un servidor configurado" y no caiga en usuario local no encontrado. Test en `auth_repository_impl_test.dart`.
- T3 [S4]: Agregar detección de entorno (`ApiBaseUrlEnvironment`: production, staging, custom, unconfigured) en `ApiBaseUrlService` / `TerminalIdentityViewModel`, visualización con badges en `TerminalIdentityView` y tests asociados.
- T4 [S2]: Agregar acción de aprovisionamiento inmediato en `LinkTerminalView` y `LoginView` cuando el backend esté `unconfigured`, permitiendo vincular o conectar a Producción con 1 toque.
- T5 [S5]: Actualizar el runbook `docs/nhilos/runbooks/nhilos_op01_customer_provisioning_runbook_v0.1.md` con los pasos de verificación de manifest, aprovisionamiento automático y verificación visual.
- T6 [S6]: Verificación integral de la suite completa de pruebas, análisis de lints y empaquetado.

## Log

- L1: Solicitud inicial: "#### 2. Provisioning del APK sin intervención manual (#941). Problema: Un APK nuevo instalado en un terminal no puede iniciar sesión hasta que alguien entra a pantallas técnicas y selecciona a mano el preset 'producción' (de lo contrario dice 'error al hacer login'). Solución NHILOS: El APK de producción (canal oficial de release) debe traer por defecto la URL de producción configurada o resolverla limpiamente desde el proceso de enlace con QR/código, distinguiendo con claridad 'servidor no configurado' de 'credenciales inválidas'."
