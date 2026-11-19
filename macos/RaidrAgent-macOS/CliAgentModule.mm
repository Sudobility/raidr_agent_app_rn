#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

// ---------------------------------------------------------------------------
// CliAgent (macOS) — runs a locally-installed coding-agent CLI (Claude Code or
// Codex) as the agent loop's "local brain". It finds the binary, runs it with
// the given arguments, feeds the prompt on stdin and returns stdout/stderr and
// the exit code. It never handles login: an unauthenticated CLI just exits
// non-zero and the JS layer tells the user to log in in Terminal.
//
// The JS contract is `src/native/cliAgent.ts`
//   isAvailable(kind) -> Promise<boolean>
//   run(kind, args, stdin, timeoutMs) -> Promise<{stdout, stderr, exitCode}>
// `kind` is only ever "claude" or "codex"; the arguments are fixed by the JS
// caller (`src/lib/cliAgent.ts`), never user-authored.
// ---------------------------------------------------------------------------

@interface CliAgentModule : NSObject <RCTBridgeModule>
@end

@implementation CliAgentModule

RCT_EXPORT_MODULE(CliAgent)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// A concurrent queue so several decisions can run at once without blocking the
// bridge; each exported method does blocking process I/O on it directly.
- (dispatch_queue_t)methodQueue
{
  static dispatch_queue_t queue;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    queue = dispatch_queue_create("com.sudobility.raidr.agent.cliagent", DISPATCH_QUEUE_CONCURRENT);
  });
  return queue;
}

/** The binary name for a supported kind, or nil for anything else. */
static NSString *BinaryNameForKind(NSString *kind)
{
  if ([kind isEqualToString:@"claude"]) {
    return @"claude";
  }
  if ([kind isEqualToString:@"codex"]) {
    return @"codex";
  }
  return nil;
}

/**
 * The user's login-shell `$PATH`, the way Terminal sees it — captured once by
 * running the login shell. This is what catches installs a fixed directory list
 * misses, notably nvm/fnm, whose versioned node `bin` dir is added by an
 * interactive rc file rather than living at a predictable path. Folding it into
 * the candidate dirs makes both the CLI *and* the `node` it shells out to
 * resolvable. Empty when the shell can't be run or times out (misconfigured rc).
 */
static NSString *LoginShellPath(void)
{
  static NSString *cached = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSString *shell = NSProcessInfo.processInfo.environment[@"SHELL"];
    if (shell.length == 0 || ![NSFileManager.defaultManager isExecutableFileAtPath:shell]) {
      shell = @"/bin/zsh";
    }

    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:shell];
    // -i -l so rc files that set up nvm/fnm/etc. are sourced. Wrap $PATH in
    // sentinels so a chatty rc file printing to stdout can't corrupt it.
    task.arguments =
        @[ @"-i", @"-l", @"-c", @"printf '<<RAIDRPATH>>%s<<ENDPATH>>' \"$PATH\"" ];
    task.standardInput = [NSFileHandle fileHandleWithNullDevice];
    NSPipe *outPipe = [NSPipe pipe];
    task.standardOutput = outPipe;
    task.standardError = [NSPipe pipe];  // discard rc-file noise

    __block NSData *outData = nil;
    dispatch_group_t group = dispatch_group_create();
    dispatch_group_async(group, dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
      outData = [outPipe.fileHandleForReading readDataToEndOfFile];
    });

    if (![task launchAndReturnError:NULL]) {
      cached = @"";
      return;
    }

    // Guard against a shell that hangs (e.g. an rc file waiting on input).
    __block BOOL timedOut = NO;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5 * NSEC_PER_SEC)),
                   dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
      if (task.isRunning) {
        timedOut = YES;
        [task terminate];
      }
    });
    [task waitUntilExit];
    dispatch_group_wait(group, DISPATCH_TIME_FOREVER);

    if (timedOut) {
      cached = @"";
      return;
    }
    NSString *raw = [[NSString alloc] initWithData:outData ?: [NSData data]
                                          encoding:NSUTF8StringEncoding]
                        ?: @"";
    NSRange start = [raw rangeOfString:@"<<RAIDRPATH>>"];
    NSRange end = [raw rangeOfString:@"<<ENDPATH>>"];
    if (start.location == NSNotFound || end.location == NSNotFound ||
        end.location < NSMaxRange(start)) {
      cached = @"";
      return;
    }
    NSUInteger from = NSMaxRange(start);
    cached = [raw substringWithRange:NSMakeRange(from, end.location - from)];
  });
  return cached;
}

/**
 * The directories to look in, in order: the app's inherited PATH, then the
 * user's login-shell PATH (Terminal's view — catches nvm/fnm etc.), then the
 * places these CLIs are commonly installed. A macOS GUI app inherits only a
 * minimal PATH, so the CLI the user installed (official installer, Homebrew,
 * bun, npm global, nvm, …) is invisible unless we add these by hand.
 */
static NSArray<NSString *> *CandidateDirectories(void)
{
  NSString *home = NSHomeDirectory();
  NSMutableArray<NSString *> *dirs = [NSMutableArray array];

  void (^addPath)(NSString *) = ^(NSString *pathList) {
    if (pathList.length == 0) {
      return;
    }
    for (NSString *dir in [pathList componentsSeparatedByString:@":"]) {
      if (dir.length > 0 && ![dirs containsObject:dir]) {
        [dirs addObject:dir];
      }
    }
  };

  addPath(NSProcessInfo.processInfo.environment[@"PATH"]);
  addPath(LoginShellPath());

  NSArray<NSString *> *common = @[
    [home stringByAppendingPathComponent:@".local/bin"],
    @"/opt/homebrew/bin",
    @"/usr/local/bin",
    [home stringByAppendingPathComponent:@".bun/bin"],
    [home stringByAppendingPathComponent:@".npm-global/bin"],
    [home stringByAppendingPathComponent:@".volta/bin"],
    [home stringByAppendingPathComponent:@".deno/bin"],
    @"/usr/bin",
    @"/bin",
  ];
  for (NSString *dir in common) {
    if (![dirs containsObject:dir]) {
      [dirs addObject:dir];
    }
  }
  return dirs;
}

/** The first executable named `binary` found in the candidate directories. */
static NSString *ResolveBinaryPath(NSString *binary)
{
  NSFileManager *fm = NSFileManager.defaultManager;
  for (NSString *dir in CandidateDirectories()) {
    NSString *candidate = [dir stringByAppendingPathComponent:binary];
    if ([fm isExecutableFileAtPath:candidate]) {
      return candidate;
    }
  }
  return nil;
}

/** A PATH covering the candidate dirs so the CLI's own child processes resolve. */
static NSString *AugmentedPath(void)
{
  return [CandidateDirectories() componentsJoinedByString:@":"];
}

RCT_REMAP_METHOD(isAvailable,
                 isAvailableForKind:(NSString *)kind
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *binary = BinaryNameForKind(kind);
  resolve(@(binary != nil && ResolveBinaryPath(binary) != nil));
}

RCT_REMAP_METHOD(run,
                 runKind:(NSString *)kind
                 args:(NSArray<NSString *> *)args
                 stdinText:(NSString *)stdinText
                 timeoutMs:(double)timeoutMs
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *binary = BinaryNameForKind(kind);
  if (!binary) {
    reject(@"CLI_BAD_KIND", [NSString stringWithFormat:@"Unknown CLI agent: %@", kind], nil);
    return;
  }

  NSString *path = ResolveBinaryPath(binary);
  if (!path) {
    // Standard shell "command not found" status — the JS layer surfaces it.
    resolve(@{
      @"stdout": @"",
      @"stderr": [NSString stringWithFormat:@"%@: command not found", binary],
      @"exitCode": @127,
    });
    return;
  }

  NSTask *task = [[NSTask alloc] init];
  task.executableURL = [NSURL fileURLWithPath:path];
  task.arguments = args ?: @[];

  NSMutableDictionary<NSString *, NSString *> *env =
      [NSProcessInfo.processInfo.environment mutableCopy];
  env[@"PATH"] = AugmentedPath();
  task.environment = env;

  NSPipe *inPipe = [NSPipe pipe];
  NSPipe *outPipe = [NSPipe pipe];
  NSPipe *errPipe = [NSPipe pipe];
  task.standardInput = inPipe;
  task.standardOutput = outPipe;
  task.standardError = errPipe;

  // Drain stdout and stderr on their own queues so a full pipe buffer can never
  // deadlock against us writing stdin or against each other.
  __block NSData *outData = nil;
  __block NSData *errData = nil;
  dispatch_group_t readers = dispatch_group_create();
  dispatch_group_async(readers, dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    outData = [outPipe.fileHandleForReading readDataToEndOfFile];
  });
  dispatch_group_async(readers, dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    errData = [errPipe.fileHandleForReading readDataToEndOfFile];
  });

  NSError *launchError = nil;
  if (![task launchAndReturnError:&launchError]) {
    resolve(@{
      @"stdout": @"",
      @"stderr": launchError.localizedDescription ?: @"Failed to launch the CLI",
      @"exitCode": @127,
    });
    return;
  }

  // Feed the prompt on a background queue, then close stdin so the CLI knows the
  // input is complete. Writing off the method queue means a prompt larger than
  // the pipe buffer can't deadlock us against the process (we drain stdout/err
  // concurrently and wait below).
  NSString *promptToWrite = stdinText ?: @"";
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @try {
      NSData *inData = [promptToWrite dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
      [inPipe.fileHandleForWriting writeData:inData];
      [inPipe.fileHandleForWriting closeFile];
    } @catch (__unused NSException *exception) {
      // The process may have exited before reading all of stdin (EPIPE); harmless.
    }
  });

  __block BOOL timedOut = NO;
  double timeoutSec = (timeoutMs > 0 ? timeoutMs : 120000) / 1000.0;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeoutSec * NSEC_PER_SEC)),
                 dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    if (task.isRunning) {
      timedOut = YES;
      [task terminate];
    }
  });

  [task waitUntilExit];
  dispatch_group_wait(readers, DISPATCH_TIME_FOREVER);

  NSString *stdoutText =
      [[NSString alloc] initWithData:outData ?: [NSData data] encoding:NSUTF8StringEncoding] ?: @"";
  NSString *stderrText =
      [[NSString alloc] initWithData:errData ?: [NSData data] encoding:NSUTF8StringEncoding] ?: @"";
  int exitCode = task.terminationStatus;

  if (timedOut) {
    stderrText = [stderrText stringByAppendingFormat:@"\n%@ timed out after %.0fms", binary, timeoutMs];
    if (exitCode == 0) {
      exitCode = 124;  // conventional timeout status
    }
  }

  resolve(@{
    @"stdout": stdoutText,
    @"stderr": stderrText,
    @"exitCode": @(exitCode),
  });
}

@end
