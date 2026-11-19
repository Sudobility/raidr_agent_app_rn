#include "pch.h"
#include "CliAgentModule.h"

#include <string>
#include <thread>
#include <vector>

using namespace winrt::Microsoft::ReactNative;

namespace {

std::wstring Utf8ToWide(const std::string &utf8) {
  if (utf8.empty()) {
    return L"";
  }
  const int size =
      MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), static_cast<int>(utf8.size()), nullptr, 0);
  std::wstring wide(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), static_cast<int>(utf8.size()), wide.data(), size);
  return wide;
}

std::string WideToUtf8(const std::wstring &wide) {
  if (wide.empty()) {
    return "";
  }
  const int size = WideCharToMultiByte(
      CP_UTF8, 0, wide.c_str(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
  std::string utf8(static_cast<size_t>(size), '\0');
  WideCharToMultiByte(
      CP_UTF8, 0, wide.c_str(), static_cast<int>(wide.size()), utf8.data(), size, nullptr, nullptr);
  return utf8;
}

// The binary name for a supported kind, or empty for anything else.
std::wstring BinaryNameForKind(const std::string &kind) {
  if (kind == "claude") {
    return L"claude";
  }
  if (kind == "codex") {
    return L"codex";
  }
  return L"";
}

// Quote one argument per the CommandLineToArgvW rules so spaces and quotes
// survive. Our args are fixed, simple tokens, but this keeps it correct.
std::wstring QuoteArg(const std::wstring &arg) {
  if (!arg.empty() && arg.find_first_of(L" \t\n\v\"") == std::wstring::npos) {
    return arg;
  }
  std::wstring out = L"\"";
  for (auto it = arg.begin();; ++it) {
    unsigned backslashes = 0;
    while (it != arg.end() && *it == L'\\') {
      ++it;
      ++backslashes;
    }
    if (it == arg.end()) {
      out.append(backslashes * 2, L'\\');
      break;
    } else if (*it == L'"') {
      out.append(backslashes * 2 + 1, L'\\');
      out.push_back(*it);
    } else {
      out.append(backslashes, L'\\');
      out.push_back(*it);
    }
  }
  out.push_back(L'"');
  return out;
}

struct ProcessOutcome {
  bool launched = false;
  std::string stdoutText;
  std::string stderrText;
  DWORD exitCode = 0;
};

// Run `commandLine` through cmd.exe (so `.cmd` npm shims and PATH search work),
// feeding `stdinUtf8`, aborting after `timeoutMs`. Reads stdout/stderr on their
// own threads so a full pipe buffer can never deadlock the writer or reader.
ProcessOutcome RunCommandLine(const std::wstring &innerCommand,
                              const std::string &stdinUtf8,
                              double timeoutMs) {
  ProcessOutcome outcome;

  SECURITY_ATTRIBUTES sa{};
  sa.nLength = sizeof(sa);
  sa.bInheritHandle = TRUE;
  sa.lpSecurityDescriptor = nullptr;

  HANDLE stdoutRd = nullptr, stdoutWr = nullptr;
  HANDLE stderrRd = nullptr, stderrWr = nullptr;
  HANDLE stdinRd = nullptr, stdinWr = nullptr;

  auto safeClose = [](HANDLE &h) {
    if (h) {
      CloseHandle(h);
      h = nullptr;
    }
  };

  if (!CreatePipe(&stdoutRd, &stdoutWr, &sa, 0) ||
      !CreatePipe(&stderrRd, &stderrWr, &sa, 0) ||
      !CreatePipe(&stdinRd, &stdinWr, &sa, 0)) {
    safeClose(stdoutRd); safeClose(stdoutWr);
    safeClose(stderrRd); safeClose(stderrWr);
    safeClose(stdinRd); safeClose(stdinWr);
    outcome.stderrText = "Failed to create pipes";
    outcome.exitCode = 127;
    return outcome;
  }
  // The parent-side handles must not be inherited by the child.
  SetHandleInformation(stdoutRd, HANDLE_FLAG_INHERIT, 0);
  SetHandleInformation(stderrRd, HANDLE_FLAG_INHERIT, 0);
  SetHandleInformation(stdinWr, HANDLE_FLAG_INHERIT, 0);

  std::wstring commandLine = L"cmd.exe /s /c \"" + innerCommand + L"\"";

  STARTUPINFOW si{};
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESTDHANDLES;
  si.hStdOutput = stdoutWr;
  si.hStdError = stderrWr;
  si.hStdInput = stdinRd;

  PROCESS_INFORMATION pi{};
  std::wstring mutableCmd = commandLine;  // CreateProcessW may modify its buffer
  const BOOL created = CreateProcessW(
      nullptr, mutableCmd.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi);

  // The child owns its ends now; the parent closes its copies.
  safeClose(stdoutWr);
  safeClose(stderrWr);
  safeClose(stdinRd);

  if (!created) {
    safeClose(stdoutRd);
    safeClose(stderrRd);
    safeClose(stdinWr);
    outcome.stderrText = "command not found";
    outcome.exitCode = 127;
    return outcome;
  }

  auto readAll = [](HANDLE handle, std::string &sink) {
    char buffer[4096];
    DWORD read = 0;
    while (ReadFile(handle, buffer, sizeof(buffer), &read, nullptr) && read > 0) {
      sink.append(buffer, read);
    }
  };

  std::thread outReader(readAll, stdoutRd, std::ref(outcome.stdoutText));
  std::thread errReader(readAll, stderrRd, std::ref(outcome.stderrText));
  std::thread inWriter([stdinWr, &stdinUtf8]() {
    const char *data = stdinUtf8.data();
    size_t remaining = stdinUtf8.size();
    while (remaining > 0) {
      DWORD written = 0;
      const DWORD chunk = static_cast<DWORD>(remaining > 65536 ? 65536 : remaining);
      if (!WriteFile(stdinWr, data, chunk, &written, nullptr) || written == 0) {
        break;  // child exited / closed its stdin
      }
      data += written;
      remaining -= written;
    }
    CloseHandle(stdinWr);
  });

  const DWORD timeout =
      timeoutMs > 0 ? static_cast<DWORD>(timeoutMs) : 120000;
  bool timedOut = false;
  if (WaitForSingleObject(pi.hProcess, timeout) == WAIT_TIMEOUT) {
    timedOut = true;
    TerminateProcess(pi.hProcess, 124);
    WaitForSingleObject(pi.hProcess, 5000);
  }

  // Terminating (or normal exit) closes the child's handles, so the readers and
  // the writer unblock; join them before touching their buffers.
  inWriter.join();
  outReader.join();
  errReader.join();

  DWORD exitCode = 0;
  GetExitCodeProcess(pi.hProcess, &exitCode);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);
  safeClose(stdoutRd);
  safeClose(stderrRd);

  if (timedOut) {
    outcome.stderrText += "\nCLI timed out after " + std::to_string(timeout) + "ms";
    if (exitCode == 0) {
      exitCode = 124;
    }
  }

  outcome.launched = true;
  outcome.exitCode = exitCode;
  return outcome;
}

}  // namespace

void CliAgentModule::Initialize(ReactContext const &context) noexcept {
  m_context = context;
}

void CliAgentModule::IsAvailable(std::string kind, ReactPromise<JSValue> result) noexcept {
  const std::wstring binary = BinaryNameForKind(kind);
  if (binary.empty()) {
    result.Resolve(JSValue{false});
    return;
  }
  std::thread([binary, result = std::move(result)]() mutable {
    const ProcessOutcome outcome = RunCommandLine(L"where " + QuoteArg(binary), "", 15000);
    result.Resolve(JSValue{outcome.launched && outcome.exitCode == 0});
  }).detach();
}

void CliAgentModule::Run(
    std::string kind,
    std::vector<std::string> args,
    std::string stdinText,
    double timeoutMs,
    ReactPromise<JSValue> result) noexcept {
  const std::wstring binary = BinaryNameForKind(kind);
  if (binary.empty()) {
    result.Reject(ReactError{"CLI_BAD_KIND", "Unknown CLI agent: " + kind});
    return;
  }

  std::wstring inner = QuoteArg(binary);
  for (const auto &arg : args) {
    inner += L" ";
    inner += QuoteArg(Utf8ToWide(arg));
  }

  std::thread([inner = std::move(inner), stdinText = std::move(stdinText), timeoutMs,
               result = std::move(result)]() mutable {
    const ProcessOutcome outcome = RunCommandLine(inner, stdinText, timeoutMs);
    result.Resolve(JSValueObject{
        {"stdout", outcome.stdoutText},
        {"stderr", outcome.stderrText},
        {"exitCode", static_cast<double>(outcome.exitCode)},
    });
  }).detach();
}
