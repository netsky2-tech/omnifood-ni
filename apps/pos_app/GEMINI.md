# OmniFood NI - Frontend POS Guidelines (Flutter)

¡Buenas, loco! Estás en el frente de batalla de **OmniFood NI**. Esta aplicación es lo que el mesero y el cajero ven todo el día en el calor de Managua. Tiene que ser rápida, intuitiva y, sobre todo, **indestructible ante fallos de WiFi**.

## 🚀 Responsabilidades del POS
1. **Offline-First Excellence**: Si el internet se cae, el negocio sigue. Todo se guarda en **SQLite (vía Floor)** primero. La sincronización es eventual y en segundo plano.
2. **Performance**: El café vuela en hora pico. La UI no puede tener jank. Usamos **ViewModels** livianos y widgets eficientes.
3. **DGI Guardrails**: El POS no permite editar ni borrar ventas confirmadas. Solo anulaciones con motivo registrado.

---

## 🏗️ Arquitectura de la App
Seguimos **Clean Architecture** a rajatabla en la carpeta `lib/`:

- `lib/core/`: Temas, configuración global, inyección de dependencias (`get_it`), y utilidades comunes.
- `lib/domain/`: El corazón. Entidades puras y contratos (interfaces) de Repositories. Acá usamos **Freezed** para inmutabilidad.
- `lib/data/`: Implementaciones de Repositories, fuentes de datos (DAOs de Floor y APIs de Dio).
- `lib/presentation/`: La UI organizada por features. Cada feature tiene sus **Views** y sus **ViewModels** (`ChangeNotifier` + `Provider`).

### Reglas de Oro
- **Regla #1**: Las Views son "tontas". No tienen lógica de negocio ni hacen cálculos de IVA. Todo eso viene del ViewModel o del Domain.
- **Regla #2**: **SQLite es la fuente de verdad**. Nunca asumas que el backend tiene la última versión del dato mientras el POS está operando.
- **Regla #3**: Usa **Aggregates** para transacciones complejas (ej: Venta + Items).
- **Regla #4**: **@transaction requiere parámetros posicionales**. No uses *named arguments* en métodos de DAOs marcados con `@transaction`; esto rompe la generación de código de Floor.

---

## 📝 Estándares de Código
- **Inmutabilidad**: Usa `@freezed` para modelos de datos para evitar efectos secundarios raros.
- **UI Responsiva**: Usamos `LayoutBuilder` para que la app se vea bien tanto en una tablet Android de 10" como en una terminal All-in-One de Windows.
- **Manejo de Errores**: Capturá las excepciones de base de datos y de red por separado. El usuario tiene que saber si un error es local o de sync.

---

## ⚙️ Comandos del Frente
- **Generar Código**: `flutter pub run build_runner build --delete-conflicting-outputs` (Mandatorio después de tocar Entidades o DAOs).
- **Tests**: `flutter test` (Testeá tus ViewModels, loco, no me falles).
- **Run**: `flutter run`

---

## 📚 Referencias Locales
- [PRD Principal](../../docs/Product_Requirement_Document.md)
- [Estructura del Proyecto](../../openspec/specs/project-structure/spec.md)

¡Dale, hacé que esa UI sea una seda!
