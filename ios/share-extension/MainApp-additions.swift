//  Add these to the MAIN FitChecker app (the PWABuilder-generated wrapper).
//  ---------------------------------------------------------------------------
//  When the Share Extension opens the app via  fitcheck://share , read the
//  pending link from the App Group and load it into the WKWebView with a
//  ?url= query. FitChecker's existing JavaScript picks it up from location.search,
//  routes to Analyze, and auto-reads the size guide — no web changes needed.
//
//  Adapt two things to your project:
//    • BASE_URL   — your deployed FitChecker address
//    • `webView`  — the WKWebView property name used by the PWABuilder shell
//  ---------------------------------------------------------------------------

import UIKit
import WebKit

enum ShareInbox {
    static let appGroupID = "group.com.YOURNAME.fitcheck"
    static let baseURL = "https://YOUR-URL"   // e.g. https://fitcheck.up.railway.app

    /// Returns the URL the WKWebView should load if a shared link is waiting,
    /// then clears it. Returns nil if there's nothing pending.
    static func pendingLoadURL() -> URL? {
        let defaults = UserDefaults(suiteName: appGroupID)
        guard let shared = defaults?.string(forKey: "fc_shared_url"),
              let encoded = shared.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
        else { return nil }
        defaults?.removeObject(forKey: "fc_shared_url")
        return URL(string: "\(baseURL)/index.html?url=\(encoded)")
    }
}

// ---- SceneDelegate.swift (newer PWABuilder templates) ----------------------
//
// func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
//     guard URLContexts.first?.url.scheme == "fitcheck" else { return }
//     if let url = ShareInbox.pendingLoadURL() {
//         webView.load(URLRequest(url: url))     // `webView` = the shell's WKWebView
//     }
// }
//
// Also handle a cold launch (app was not running when shared):
// func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
//            options connectionOptions: UIScene.ConnectionOptions) {
//     // ...existing setup...
//     if connectionOptions.urlContexts.first?.url.scheme == "fitcheck",
//        let url = ShareInbox.pendingLoadURL() {
//         webView.load(URLRequest(url: url))
//     }
// }

// ---- AppDelegate.swift (older templates, no SceneDelegate) ------------------
//
// func application(_ app: UIApplication, open url: URL,
//                  options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
//     guard url.scheme == "fitcheck" else { return false }
//     if let load = ShareInbox.pendingLoadURL() {
//         webView.load(URLRequest(url: load))
//     }
//     return true
// }
