import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

// Release keystore readiness: key.properties must exist AND its storeFile
// must be a non-blank value naming a regular file. Absent, blank-after-trim,
// and directory-valued storeFile entries are all treated as "no keystore" so
// a broken key.properties fails closed instead of degrading silently (an
// empty value would otherwise resolve to this directory, which exists, and a
// directory-valued one would pass an existence-only check and fail late with
// a cryptic signing error). Relative paths resolve against this app module
// directory, matching Gradle's file() semantics. This is a path-shape check
// only: it does NOT validate that the file is a usable keystore or that any
// key inside it opens — key validity is still not checked here.
val rawStoreFile = keystoreProperties.getProperty("storeFile")?.trim()
val releaseStoreFile = rawStoreFile?.takeIf { it.isNotEmpty() }?.let { file(it) }
val releaseSigningReady = releaseStoreFile != null && releaseStoreFile.isFile

// Explicit debug-signing opt-in, read as a Gradle project property so the
// environment variable ORG_GRADLE_PROJECT_allowDebugSigning maps onto it
// automatically. Only the literal value "true" enables the fallback.
val allowDebugSigning = providers.gradleProperty("allowDebugSigning").orNull == "true"

val releaseSigningFailClosedMessage = """
    ERROR: Release signing is not configured (key.properties is absent or does not name a real storeFile).
    A release build would silently fall back to the debug keystore, producing an artifact that can never be updated in the field.
    Two remedies:
      1. Create the release keystore with the provisioning script (scripts/provision_release_keystore.sh).
      2. Pass the explicit debug-signing opt-in (ORG_GRADLE_PROJECT_allowDebugSigning=true).
""".trimIndent()

android {
    namespace = "com.nhilos.pos_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.nhilos.pos_app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildFeatures {
        aidl = true
    }

    signingConfigs {
        create("release") {
            if (releaseSigningReady) {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = releaseStoreFile
                storePassword = keystoreProperties.getProperty("storePassword")
            } else if (allowDebugSigning) {
                println(
                    "WARNING: No release keystore found; falling back to the DEBUG keystore for the release build. " +
                        "The artifact will be debug-signed and must NOT be shipped as a release."
                )
                val debugConfig = signingConfigs.getByName("debug")
                keyAlias = debugConfig.keyAlias
                keyPassword = debugConfig.keyPassword
                storeFile = debugConfig.storeFile
                storePassword = debugConfig.storePassword
            }
            // else: the release config stays unset and the fail-closed guard
            // below fails any release build with an actionable message.
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

flutter {
    source = "../.."
}

// Fail-closed release signing guard. This deliberately does NOT throw from
// the signingConfigs block or from androidComponents.beforeVariants: both run
// during every configuration, including Android Studio sync and debug builds,
// which must keep working without a release keystore. The task-graph hook
// fires only when release tasks are actually scheduled, so `flutter run`,
// `assembleDebug` and IDE sync are unaffected.
gradle.taskGraph.whenReady {
    if (!releaseSigningReady && !allowDebugSigning) {
        val hasReleaseTask = allTasks.any {
            it.project == project &&
                ((it.name.startsWith("assemble") && it.name.endsWith("Release")) || it.name == "bundleRelease")
        }
        if (hasReleaseTask) {
            throw GradleException(releaseSigningFailClosedMessage)
        }
    }
}
