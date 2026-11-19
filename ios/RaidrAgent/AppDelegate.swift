import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import FirebaseMessaging

@main
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  // The window and the `startReactNative` call live in `SceneDelegate` now —
  // Xcode 27's iOS 27 SDK crashes at launch (`EXC_BREAKPOINT` in
  // `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) for an app
  // with no scene adoption at all, where earlier SDKs only warned. The factory
  // is still built here, once, at the same point it always was; the scene
  // delegate reaches back into it through `UIApplication.shared.delegate`.
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FirebaseApp.configure()

    Messaging.messaging().delegate = self
    application.registerForRemoteNotifications()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    self.launchOptions = launchOptions

    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
  }

  // Custom-scheme opens and the OAuth redirect, routed through RCTLinkingManager
  // so JS `Linking` receives the url. Called from
  // `SceneDelegate.scene(_:openURLContexts:)`.
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal links, routed through RCTLinkingManager. Called from
  // `SceneDelegate.scene(_:continue:)`.
  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }

  // Forward the APNS token to Firebase Messaging.
  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
  }

  // FCM token refresh.
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {}
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    let provider = RCTBundleURLProvider.sharedSettings()
    // Metro dev-server host/port come from .env (METRO_HOST / METRO_PORT),
    // injected into Info.plist at build time by the "Inject Metro Dev Server
    // (.env)" build phase — nothing hardcoded here. On a physical device the
    // host must be the dev Mac's LAN IP; the simulator can use localhost.
    // Falls back to RN's default (localhost:8081) when the keys are absent.
    if let host = Bundle.main.object(forInfoDictionaryKey: "MetroHost") as? String,
       let port = Bundle.main.object(forInfoDictionaryKey: "MetroPort") as? String,
       !host.isEmpty, !port.isEmpty {
      provider.jsLocation = "\(host):\(port)"
    }
    return provider.jsBundleURL(forBundleRoot: "index")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
