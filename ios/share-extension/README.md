# FitChecker — iOS Share Extension kit

This makes **FitChecker appear in the iOS Share Sheet**, so someone shopping in
Safari (or another app) can tap **Share → FitChecker** and land in the app with the
product's size guide already loading.

> **Where this runs:** you add these files to the Xcode project that **PWABuilder
> generates** for the iOS build, then compile on a **Mac or Codemagic**. The web
> app already handles the incoming link (`?url=`), so there are **no web changes** —
> only Xcode wiring. This is the one iOS piece that isn't automatic from the PWA wrap.

## Files here
| File | Goes into |
|------|-----------|
| `ShareViewController.swift` | the new Share Extension target |
| `Info.plist` | the Share Extension target (replace its generated Info.plist, or merge the `NSExtension` block) |
| `ShareExtension.entitlements` | the Share Extension target |
| `MainApp-additions.swift` | the main app target (adapt into SceneDelegate/AppDelegate) |

## How it connects
```
Safari share sheet
   → FitChecker Share Extension (ShareViewController)
       saves the link to the App Group, opens  fitcheck://share
   → main app reads the App Group, loads  https://YOUR-URL/index.html?url=<link>
   → FitChecker's existing JS routes to Analyze and auto-reads the size guide
```

## Step-by-step (in Xcode, on a Mac / Codemagic)

1. **Open** the PWABuilder-generated `.xcodeproj`.

2. **Add the Share Extension target:** File → New → Target → **Share Extension** →
   name it `FitCheckerShare`. Delete the auto-created `MainInterface.storyboard`
   and `ShareViewController.swift`, then drag in **this** `ShareViewController.swift`
   and replace the target's `Info.plist` with the one here.

3. **Pick your identifiers and set them everywhere** (replace the placeholders):
   - App Group: `group.com.YOURNAME.fitcheck`
   - URL scheme: `fitcheck`
   Update these in `ShareViewController.swift`, `ShareExtension.entitlements`,
   and `MainApp-additions.swift`.

4. **Enable the App Group on BOTH targets:** select the target → Signing &
   Capabilities → **+ Capability → App Groups** → tick the same
   `group.com.YOURNAME.fitcheck`. (Do this for the main app *and* the extension.)
   Point the extension target's entitlements at `ShareExtension.entitlements`.

5. **Register the URL scheme on the MAIN app:** target → Info → URL Types → **+**,
   set URL Schemes to `fitcheck`. (Or add the `CFBundleURLTypes` block below to its
   Info.plist.)
   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLName</key><string>com.YOURNAME.fitcheck</string>
       <key>CFBundleURLSchemes</key><array><string>fitcheck</string></array>
     </dict>
   </array>
   ```

6. **Wire the main app:** add `MainApp-additions.swift` to the main target, set
   `ShareInbox.baseURL` to your deployed URL, and call `ShareInbox.pendingLoadURL()`
   from the SceneDelegate/AppDelegate as shown in that file (`webView` = the
   PWABuilder shell's WKWebView).

7. **Build & run on a real device.** Open Safari → any product page → Share →
   FitChecker should appear. Tap it → FitChecker opens → Analyze auto-reads the guide.

## Notes
- **Real device recommended** for testing the share sheet; the Simulator's share
  options are limited.
- If FitChecker doesn't appear in the sheet, re-check: App Group id identical on both
  targets, the extension's `NSExtensionActivationRule`, and that both targets are
  signed with your team.
- The extension deliberately has no UI — it processes and bounces the user into the
  app. If review ever prefers a visible confirmation, you can swap the base class
  for `SLComposeServiceViewController`; not required.
- Priority order: this is **after** deploying the server and doing the iOS build.
  It's ready to slot in whenever you reach that step.
