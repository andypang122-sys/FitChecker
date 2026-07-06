import UIKit
import UniformTypeIdentifiers

//  FitCheck — Share Extension
//  ---------------------------------------------------------------------------
//  When a user shares a product page (from Safari or another app) to FitCheck,
//  this grabs the link, hands it to the main app via a shared App Group, opens
//  the app, and returns the user there. No compose screen — process and go.
//
//  Two placeholders must match your main app EXACTLY:
//    • appGroupID  — the App Group set on BOTH targets (Signing & Capabilities)
//    • hostScheme  — the custom URL scheme registered in the main app Info.plist
//  ---------------------------------------------------------------------------

class ShareViewController: UIViewController {

    private let appGroupID = "group.com.YOURNAME.fitcheck"
    private let hostScheme = "fitcheck"

    override func viewDidLoad() {
        super.viewDidLoad()
        extractSharedURL { [weak self] link in
            guard let self = self else { return }
            if let link = link, !link.isEmpty {
                self.saveToAppGroup(link)
                self.openContainingApp()
            }
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    /// Pull an http(s) link out of the shared item — a URL attachment first,
    /// then any text that contains a URL.
    private func extractSharedURL(_ completion: @escaping (String?) -> Void) {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let providers = item.attachments else { completion(nil); return }

        let urlType = UTType.url.identifier         // "public.url"
        let textType = UTType.plainText.identifier  // "public.plain-text"

        // Prefer a real URL attachment.
        for provider in providers where provider.hasItemConformingToTypeIdentifier(urlType) {
            provider.loadItem(forTypeIdentifier: urlType, options: nil) { data, _ in
                if let url = data as? URL {
                    completion(url.absoluteString)
                } else if let s = data as? String {
                    completion(self.firstURL(in: s))
                } else {
                    completion(nil)
                }
            }
            return
        }
        // Fall back to text that contains a link.
        for provider in providers where provider.hasItemConformingToTypeIdentifier(textType) {
            provider.loadItem(forTypeIdentifier: textType, options: nil) { data, _ in
                completion(self.firstURL(in: (data as? String) ?? ""))
            }
            return
        }
        completion(nil)
    }

    private func firstURL(in text: String) -> String? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..., in: text)
        if let match = detector?.firstMatch(in: text, options: [], range: range),
           let r = Range(match.range, in: text) {
            return String(text[r])
        }
        return nil
    }

    private func saveToAppGroup(_ link: String) {
        let defaults = UserDefaults(suiteName: appGroupID)
        defaults?.set(link, forKey: "fc_shared_url")
        defaults?.set(Date().timeIntervalSince1970, forKey: "fc_shared_ts")
    }

    /// Open the containing app. Share extensions can't touch UIApplication.shared
    /// directly, so walk the responder chain to reach it (a long-standing,
    /// App-Store-safe pattern — openURL: is a public method).
    private func openContainingApp() {
        guard let url = URL(string: "\(hostScheme)://share") else { return }
        var responder: UIResponder? = self
        while responder != nil {
            if let app = responder as? UIApplication {
                app.perform(#selector(openURL(_:)), with: url)
                break
            }
            responder = responder?.next
        }
    }

    // Dummy declaration so #selector(openURL(_:)) compiles; the real openURL:
    // on UIApplication is what actually runs.
    @objc func openURL(_ url: URL) -> Bool { return false }
}
