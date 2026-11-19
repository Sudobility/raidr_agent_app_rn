#pragma once

#include "NativeModules.h"
#include <winrt/Microsoft.ReactNative.h>

#include <string>
#include <vector>

// CliAgent (Windows) — runs a locally-installed coding-agent CLI (Claude Code
// or Codex) as the agent loop's "local brain". See CliAgentModule.cpp and the
// JS contract in `src/native/cliAgent.ts`. `kind` is only ever "claude" or
// "codex"; the arguments are fixed by the JS caller, never user-authored.
REACT_MODULE(CliAgentModule, L"CliAgent")
struct CliAgentModule {
  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &context) noexcept;

  // Whether the CLI for `kind` is found on PATH.
  REACT_METHOD(IsAvailable, L"isAvailable")
  void IsAvailable(
      std::string kind,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> result) noexcept;

  // Run the CLI for `kind` with `args`, feeding `stdinText`, aborting after
  // `timeoutMs`. Resolves {stdout, stderr, exitCode}.
  REACT_METHOD(Run, L"run")
  void Run(
      std::string kind,
      std::vector<std::string> args,
      std::string stdinText,
      double timeoutMs,
      winrt::Microsoft::ReactNative::ReactPromise<winrt::Microsoft::ReactNative::JSValue> result) noexcept;

 private:
  winrt::Microsoft::ReactNative::ReactContext m_context;
};
