# OmniFood NI - POS App (Frontend)

Este es el cliente de punto de venta desarrollado en **Flutter**. Es una aplicación multiplataforma diseñada para correr en tablets (Android) y terminales All-in-One (Windows/Linux).

## 🔋 Características Principales
- **Offline-First**: Persistencia local robusta con SQLite.
- **Clean Architecture**: Separación de capas (`domain`, `data`, `presentation`).
- **Inmutabilidad**: Modelos de datos seguros con **Freezed**.
- **UI Responsiva**: Adaptable a diferentes tamaños de pantalla (Desktop/Tablet).

## 🏗️ Arquitectura Interna (`lib/`)
- **`core/`**: Configuración global, temas y DI (`get_it`).
- **`domain/`**: Entidades puras y contratos (Interfaces) de repositorios.
- **`data/`**: Implementaciones de repositorios, DAOs de Floor y clientes de red.
- **`presentation/`**: Lógica de UI organizada por features (MVVM con `Provider`).

## 🛠️ Comandos Esenciales

```bash
# Instalar dependencias
flutter pub get

# Generar código (Floor, Freezed, JSON)
flutter pub run build_runner build --delete-conflicting-outputs

# Correr tests unitarios/widget
flutter test

# Correr la aplicación
flutter run
```

## ⚠️ Nota sobre Dependencias
Debido a conflictos entre `floor_generator` y las versiones más recientes de `freezed`, se utiliza un **override** para el paquete `analyzer` (versión 6.4.1) en el `pubspec.yaml`. No subir esta versión sin previa verificación de compatibilidad.

Para más guías específicas del frente, revisá el archivo [GEMINI.md](./GEMINI.md) local.
