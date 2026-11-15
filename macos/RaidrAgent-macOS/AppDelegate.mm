#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

// Menubar host: raidr agent stays running in the menubar after its window is
// closed so the in-app agent scheduler keeps ticking (there is no server
// scheduler — if the process is not running, nothing fires). Clicking the
// menubar item (or the Dock icon) brings the full UI back.
@interface AppDelegate ()
@property (nonatomic, strong) NSStatusItem *statusItem;
/// Held so App Nap doesn't throttle the JS scheduler's timers while windowless.
@property (nonatomic, strong) id<NSObject> backgroundActivity;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"RaidrAgent";
  self.initialProps = @{};
  self.dependencyProvider = [RCTAppDependencyProvider new];

  // Register URL scheme handler for deep linking
  [[NSAppleEventManager sharedAppleEventManager]
    setEventHandler:[RCTLinkingManager class]
        andSelector:@selector(getUrlEventHandler:withReplyEvent:)
      forEventClass:kInternetEventClass
         andEventID:kAEGetURL];

  [super applicationDidFinishLaunching:notification];

  // Keep the RN module name unchanged, but override the visible window title.
  // Keep the window alive when closed so we can reopen the same instance.
  if (self.window) {
    self.window.title = @"raidr agent";
    self.window.releasedWhenClosed = NO;
  }

  [self setUpStatusItem];

  // Prevent App Nap from suspending timers (the scheduler) while no window is up.
  self.backgroundActivity = [[NSProcessInfo processInfo]
      beginActivityWithOptions:NSActivityBackground
                        reason:@"raidr agent schedules run while the app is open"];
}

#pragma mark - Menubar

- (void)setUpStatusItem
{
  self.statusItem = [[NSStatusBar systemStatusBar]
      statusItemWithLength:NSVariableStatusItemLength];

  NSImage *icon = nil;
  if (@available(macOS 11.0, *)) {
    icon = [NSImage imageWithSystemSymbolName:@"sparkles"
                     accessibilityDescription:@"raidr agent"];
  }
  if (icon) {
    icon.template = YES;
    self.statusItem.button.image = icon;
  } else {
    self.statusItem.button.title = @"✦";
  }

  NSMenu *menu = [[NSMenu alloc] init];
  [menu addItemWithTitle:@"Open raidr agent"
                  action:@selector(showMainWindow:)
           keyEquivalent:@""].target = self;
  [menu addItem:[NSMenuItem separatorItem]];
  [menu addItemWithTitle:@"Quit raidr agent"
                  action:@selector(terminate:)
           keyEquivalent:@"q"].target = NSApp;
  self.statusItem.menu = menu;
}

/// Bring the main window back (recreated if the RN root still exists).
- (void)showMainWindow:(id)sender
{
  [NSApp activateIgnoringOtherApps:YES];
  if (self.window) {
    [self.window makeKeyAndOrderFront:sender];
  }
}

#pragma mark - Lifecycle

// Do not quit when the last window closes — stay in the menubar and keep the
// scheduler running. The user quits explicitly from the menubar or Dock.
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender
{
  return NO;
}

// Clicking the Dock icon with no visible window reopens the UI.
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender
                    hasVisibleWindows:(BOOL)flag
{
  if (!flag) {
    [self showMainWindow:sender];
  }
  return YES;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  NSURL *url = [NSURL URLWithString:@"http://localhost:8094/index.bundle?platform=macos&dev=true&minify=false"];
  NSLog(@"[RaidrAgent] bundleURL called, returning: %@", url);
  return url;
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
