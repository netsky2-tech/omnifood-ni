# NHILOS POS - ProGuard / R8 Rules for Release Builds
# Protects SQLite (Floor/Sqflite), Freezed Models, Sunmi AIDL and Security Storage

# Flutter Framework & Plugins
-keep class io.flutter.** { *; }
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.embedding.** { *; }

# Sunmi AIDL Interfaces & Driver
-keep class woyou.aidlservice.jiu_mi.** { *; }
-keep interface woyou.aidlservice.jiu_mi.** { *; }
-keep class com.nhilos.pos_app.printer.** { *; }

# SQLite & Persistence (Floor, Sqflite, Android Room)
-keep class com.tekartik.sqflite.** { *; }
-keep class androidx.room.** { *; }
-dontwarn androidx.room.**
-keep class androidx.sqlite.** { *; }
-dontwarn androidx.sqlite.**

# Flutter Secure Storage & Crypto
-keep class com.it_nomads.fluttersecurestorage.** { *; }
-dontwarn com.it_nomads.fluttersecurestorage.**

# JSON Serialization & Freezed Model Annotations
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Android Architecture Components
-keepclassmembers class * extends androidx.lifecycle.ViewModel {
    <init>(...);
}
-keepclassmembers class * extends androidx.lifecycle.AndroidViewModel {
    <init>(...);
}

# Suppress harmless warnings from dependencies & deferred components
-dontwarn io.flutter.plugin.text.ProcessTextPlugin
-dontwarn com.google.crypto.tink.**
-dontwarn com.google.android.play.core.**
