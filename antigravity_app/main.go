package main

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

// Nhúng toàn bộ thư mục bundle frontend/dist vào binary thực thi
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Cấu hình tối ưu Chromium / WebView2:
	// - js-flags --max-old-space-size=384: Ngăn chặn GC giật lag/đơ giao diện khi xử lý file và chat
	// - Bỏ --renderer-process-limit=1 để Web Workers (Monaco tokenizer/language services) không nghẽn luồng DOM chính
	// - Cho phép GPU shader cache để tránh CPU phải biên dịch lại shader liên tục gây giật khung hình
	// - Tắt telemetry & background networking không cần thiết
	os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
		"--js-flags=\"--max-old-space-size=384\" "+
			"--disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion,AudioServiceOutOfProcess "+
			"--disk-cache-size=33554432 "+
			"--disable-background-networking "+
			"--disable-component-update")

	// Đường dẫn lưu trữ User Data cô lập cho WebView2 tại %APPDATA%\TaitestgameIDE\wv2_profiles\p_<pid>
	// Đảm bảo không bao giờ bị lỗi 800700aa (The requested resource is in use) kể cả khi mở nhiều instance
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = os.Getenv("USERPROFILE")
	}
	pid := os.Getpid()
	baseWV2 := filepath.Join(appData, "TaitestgameIDE", "wv2_profiles")
	_ = os.MkdirAll(baseWV2, 0755)
	webviewUserDataPath := filepath.Join(baseWV2, fmt.Sprintf("p_%d", pid))

	// Dọn dẹp profile cũ của các tiến trình đã thoát
	go func() {
		entries, err := os.ReadDir(baseWV2)
		if err != nil {
			return
		}
		currentDir := fmt.Sprintf("p_%d", pid)
		for _, e := range entries {
			if e.IsDir() && e.Name() != currentDir {
				_ = os.RemoveAll(filepath.Join(baseWV2, e.Name()))
			}
		}
	}()

	// Khởi tạo đối tượng ứng dụng chính
	app := NewApp()

	// Khởi chạy ứng dụng Wails Desktop với các tùy chọn giao diện
	err := wails.Run(&options.App{
		Title:     "Taitestgame IDE – AI-Powered Development Environment",
		Width:     1366,
		Height:    860,
		MinWidth:  1024,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 17, B: 23, A: 255},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []any{
			app, // Đăng ký các hàm của app để gọi trực tiếp từ JavaScript/TypeScript
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: false,
			CSSDropProperty:    "--wails-drop-target",
			CSSDropValue:       "drop",
		},
		Windows: &windows.Options{
			WebviewUserDataPath:  webviewUserDataPath,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			BackdropType:         windows.None,
			Theme:                windows.Dark,
		},
	})

	if err != nil {
		println("Lỗi khởi chạy TTG IDE:", err.Error())
	}
}
