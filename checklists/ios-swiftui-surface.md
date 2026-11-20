# iOS / SwiftUI Surface Checklist

Run this when you design, build or review any SwiftUI screen or design-system component.
This catalog's `accessibility-state-sync` and `frontend-design-system-drift` categories are
written for the web; this is their iOS counterpart. It is a starting point drawn from Apple's
and Swift.org's guidance (Sources below). The learning watcher adds lessons from real sessions
as they recur.

## Design-system components

- [ ] Tokens are semantic, not literal: named colours (asset catalog or `Color` extensions with
      light/dark variants), text styles (`.font(.body)`, `.font(.headline)`), and spacing that
      scales with `@ScaledMetric`. No hex values or point sizes inside feature views.
- [ ] A component is a small `struct` that takes values and closures, not a view model. Shared
      styling lives in a `ButtonStyle` / `ViewModifier`, so every button cannot drift separately.
- [ ] Previews cover every state (loading, empty, error, long text) at the default AND the
      largest accessibility text size, in light and dark.

## Dynamic Type

- [ ] All text uses text styles, so it scales; custom sizes and paddings use `@ScaledMetric`.
- [ ] Layouts survive the accessibility sizes: horizontal rows switch to vertical
      (`ViewThatFits`, or `dynamicTypeSize.isAccessibilitySize`), essential text wraps instead of
      truncating, and nothing overlaps.
- [ ] Clamp with `.dynamicTypeSize(...)` only where a fixed space truly cannot grow (a tab bar
      badge), never for a whole screen.

## VoiceOver

- [ ] Every control has a spoken label; icon-only buttons get `.accessibilityLabel`. Labels say
      what the control does, not what it looks like.
- [ ] Related pieces read as one element (`.accessibilityElement(children: .combine)`), decorative
      images are hidden (`Image(decorative:)` / `.accessibilityHidden(true)`), headings carry
      `.isHeader`, values that change use `.accessibilityValue`.
- [ ] Changes the user did not trigger (a booking confirmed, an error after submit) are announced
      (`AccessibilityNotification.Announcement`), and focus lands somewhere sensible after a sheet
      or alert closes.
- [ ] Walk the screen with VoiceOver once: reading order matches visual order.

## Reduce Motion, contrast, touch

- [ ] Read `@Environment(\.accessibilityReduceMotion)`; replace sliding, scaling and parallax with
      a fade or no animation when it is on. Nothing autoplays.
- [ ] Meaning is never carried by colour alone (respect Differentiate Without Colour); check the
      screen with Increase Contrast on.
- [ ] Tap targets are at least 44 × 44 pt, even when the visible glyph is smaller.

## Swift 6 concurrency

- [ ] Build in the Swift 6 language mode (strict concurrency). Fix isolation errors rather than
      silencing them; `@unchecked Sendable` and `nonisolated(unsafe)` need a comment saying why
      they are safe.
- [ ] UI state lives on the main actor: `@MainActor @Observable` models, no
      `DispatchQueue.main.async` in new code.
- [ ] Async work started by a view uses `.task` / `.task(id:)`, which cancels when the view goes
      away; long-running work checks `Task.isCancelled`. Values crossing actors are `Sendable`.

## Tests

- [ ] Logic (view models, formatting, state machines) has unit tests: Swift Testing (`@Test`,
      `#expect`, parameterised `arguments:`) for new suites, XCTest where the target already uses it.
- [ ] Each user flow has a UI test (`XCUIApplication`) that runs against fixtures selected by a
      launch argument, finds elements by `accessibilityIdentifier` (not by visible text), and runs
      once at an accessibility text size.
- [ ] Before calling UI work done, run it in the simulator and look at it (screenshots of each
      state), not only the test results.

## Sources

- Apple Human Interface Guidelines — Accessibility (touch targets, VoiceOver, motion): https://developer.apple.com/design/human-interface-guidelines/accessibility
- Apple Human Interface Guidelines — Typography (Dynamic Type): https://developer.apple.com/design/human-interface-guidelines/typography
- SwiftUI `ScaledMetric`: https://developer.apple.com/documentation/swiftui/scaledmetric
- SwiftUI `ViewThatFits`: https://developer.apple.com/documentation/swiftui/viewthatfits
- SwiftUI `dynamicTypeSize`: https://developer.apple.com/documentation/swiftui/environmentvalues/dynamictypesize
- SwiftUI `accessibilityReduceMotion`: https://developer.apple.com/documentation/swiftui/environmentvalues/accessibilityreducemotion
- `accessibilityLabel` / `accessibilityElement(children:)`: https://developer.apple.com/documentation/swiftui/view/accessibilitylabel%28_%3A%29 · https://developer.apple.com/documentation/swiftui/view/accessibilityelement%28children%3A%29
- `AccessibilityNotification.Announcement`: https://developer.apple.com/documentation/accessibility/accessibilitynotification/announcement
- SwiftUI `ButtonStyle`: https://developer.apple.com/documentation/swiftui/buttonstyle
- Observation and app model data: https://developer.apple.com/documentation/observation · https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app
- Swift 6 migration guide (strict concurrency): https://www.swift.org/migration/documentation/migrationguide/
- The Swift Programming Language — Concurrency: https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/
- Swift API Design Guidelines: https://www.swift.org/documentation/api-design-guidelines/
- Swift Testing: https://developer.apple.com/documentation/testing
- XCTest UI testing (`XCUIApplication`): https://developer.apple.com/documentation/xctest/user_interface_tests · https://developer.apple.com/documentation/xctest/xcuiapplication
