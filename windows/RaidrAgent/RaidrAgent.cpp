// RaidrAgent.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "RaidrAgent.h"

#include "AutolinkedNativeModules.g.h"

#include "NativeModules.h"

#include "WebAuthModule.h"

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};

// ---------------------------------------------------------------------------
// System-tray host: raidr agent keeps running in the tray after its window is
// closed, so the in-app agent scheduler keeps ticking (there is no server
// scheduler — if the process is not running, nothing fires). Closing the
// window hides it to the tray; the tray icon reopens it, or quits.
// ---------------------------------------------------------------------------

namespace {

constexpr UINT WM_RAIDR_TRAY = WM_APP + 1;
constexpr UINT IDM_TRAY_OPEN = 1;
constexpr UINT IDM_TRAY_EXIT = 2;

winrt::Microsoft::UI::Windowing::AppWindow g_appWindow{nullptr};
NOTIFYICONDATAW g_trayIcon{};
bool g_exiting = false;

void ShowMainWindow() {
  if (g_appWindow) {
    g_appWindow.Show();
    HWND hwnd = winrt::Microsoft::UI::GetWindowFromWindowId(g_appWindow.Id());
    if (hwnd) {
      SetForegroundWindow(hwnd);
    }
  }
}

void RemoveTrayIcon() {
  if (g_trayIcon.cbSize != 0) {
    Shell_NotifyIconW(NIM_DELETE, &g_trayIcon);
    g_trayIcon.cbSize = 0;
  }
}

// Receives the tray icon's callback messages on a hidden message-only window.
LRESULT CALLBACK TrayWndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
    case WM_RAIDR_TRAY:
      switch (LOWORD(lParam)) {
        case WM_LBUTTONUP:
        case WM_LBUTTONDBLCLK:
          ShowMainWindow();
          break;
        case WM_RBUTTONUP: {
          POINT cursor{};
          GetCursorPos(&cursor);
          HMENU menu = CreatePopupMenu();
          AppendMenuW(menu, MF_STRING, IDM_TRAY_OPEN, L"Open raidr agent");
          AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
          AppendMenuW(menu, MF_STRING, IDM_TRAY_EXIT, L"Quit raidr agent");
          // Required so the menu dismisses when the user clicks elsewhere.
          SetForegroundWindow(hWnd);
          UINT cmd = TrackPopupMenu(
              menu, TPM_RETURNCMD | TPM_NONOTIFY, cursor.x, cursor.y, 0, hWnd, nullptr);
          DestroyMenu(menu);
          if (cmd == IDM_TRAY_OPEN) {
            ShowMainWindow();
          } else if (cmd == IDM_TRAY_EXIT) {
            g_exiting = true;
            RemoveTrayIcon();
            if (g_appWindow) {
              g_appWindow.Destroy();
            }
          }
          break;
        }
        default:
          break;
      }
      return 0;
    case WM_DESTROY:
      RemoveTrayIcon();
      return 0;
    default:
      return DefWindowProcW(hWnd, message, wParam, lParam);
  }
}

void SetUpTrayIcon(HINSTANCE instance) {
  WNDCLASSEXW wc{};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = TrayWndProc;
  wc.hInstance = instance;
  wc.lpszClassName = L"RaidrAgentTrayWindow";
  RegisterClassExW(&wc);

  HWND messageWindow = CreateWindowExW(
      0, wc.lpszClassName, L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr, instance, nullptr);
  if (!messageWindow) {
    return;
  }

  g_trayIcon.cbSize = sizeof(g_trayIcon);
  g_trayIcon.hWnd = messageWindow;
  g_trayIcon.uID = 1;
  g_trayIcon.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  g_trayIcon.uCallbackMessage = WM_RAIDR_TRAY;
  g_trayIcon.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
  wcscpy_s(g_trayIcon.szTip, L"raidr agent");
  Shell_NotifyIconW(NIM_ADD, &g_trayIcon);
}

}  // namespace

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR /* commandLine */, int showCmd) {
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  settings.JavaScriptBundleFile(L"index.windows");
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  settings.UseDirectDebugger(true);
  settings.UseDeveloperSupport(true);
#else
  settings.UseDirectDebugger(false);
  settings.UseDeveloperSupport(false);
#endif

  // Get the AppWindow so we can configure its initial title and size
  auto appWindow{reactNativeWin32App.AppWindow()};
  appWindow.Title(L"raidr agent");
  appWindow.Resize({1000, 800});

  // Tray host: keep raidr agent running when the window is closed so the agent
  // scheduler keeps ticking. Closing hides to the tray instead of exiting; the
  // tray icon reopens the window or quits for real.
  g_appWindow = appWindow;
  appWindow.Closing([](winrt::Microsoft::UI::Windowing::AppWindow const &sender,
                       winrt::Microsoft::UI::Windowing::AppWindowClosingEventArgs const &args) {
    if (!g_exiting) {
      args.Cancel(true);
      sender.Hide();
    }
  });
  SetUpTrayIcon(instance);

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"RaidrAgent");

  // Start the app
  reactNativeWin32App.Start();
}
