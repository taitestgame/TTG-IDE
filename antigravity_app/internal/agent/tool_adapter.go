package agent

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// EnrichToolCallMetadata tự động gán nhãn toolAction và toolSummary theo chuẩn Google Antigravity
// nếu AI chưa cung cấp trực tiếp trong Arguments.
func EnrichToolCallMetadata(tc *ToolCall) {
	if tc == nil {
		return
	}

	// 1. Kiểm tra nếu arguments đã có sẵn tham số của Antigravity
	if act, ok := tc.Arguments["toolAction"].(string); ok && strings.TrimSpace(act) != "" {
		tc.ToolAction = strings.TrimSpace(act)
	}
	if sum, ok := tc.Arguments["toolSummary"].(string); ok && strings.TrimSpace(sum) != "" {
		tc.ToolSummary = strings.TrimSpace(sum)
	}

	if tc.ToolAction != "" && tc.ToolSummary != "" {
		return
	}

	// 2. Tự động suy luận từ tên công cụ và tham số đầu vào
	cleanName := tc.Name
	if idx := strings.LastIndex(cleanName, ":"); idx != -1 {
		cleanName = cleanName[idx+1:]
	}

	targetPath := extractPathArg(tc.Arguments)
	fileName := ""
	if targetPath != "" {
		fileName = filepath.Base(targetPath)
	}

	switch cleanName {
	case "view_file", "read_file", "FileRead":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Đọc tệp"
		}
		if tc.ToolAction == "" {
			if fileName != "" {
				tc.ToolAction = fmt.Sprintf("Đang đọc tệp %s", fileName)
			} else {
				tc.ToolAction = "Đang đọc nội dung tệp tin"
			}
		}

	case "write_file", "write_to_file", "FileWrite", "create_file":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Tạo tệp mới"
		}
		if tc.ToolAction == "" {
			if fileName != "" {
				tc.ToolAction = fmt.Sprintf("Đang tạo tệp %s", fileName)
			} else {
				tc.ToolAction = "Đang ghi tệp mới"
			}
		}

	case "edit_file", "replace_file_content", "multi_replace_file_content", "FileEdit":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Chỉnh sửa tệp"
		}
		if tc.ToolAction == "" {
			if fileName != "" {
				tc.ToolAction = fmt.Sprintf("Đang cập nhật tệp %s", fileName)
			} else {
				tc.ToolAction = "Đang chỉnh sửa mã nguồn"
			}
		}

	case "delete_file":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Xóa tệp"
		}
		if tc.ToolAction == "" {
			if fileName != "" {
				tc.ToolAction = fmt.Sprintf("Đang xóa tệp %s", fileName)
			} else {
				tc.ToolAction = "Đang xóa tệp tin"
			}
		}

	case "list_dir", "list_files", "LS":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Khảo sát thư mục"
		}
		if tc.ToolAction == "" {
			dir := targetPath
			if dir == "" || dir == "." {
				dir = "workspace"
			}
			tc.ToolAction = fmt.Sprintf("Đang khám phá %s", dir)
		}

	case "grep_search", "search_code", "GrepTool":
		q, _ := tc.Arguments["query"].(string)
		if q == "" {
			q, _ = tc.Arguments["Query"].(string)
		}
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Tìm kiếm mã nguồn"
		}
		if tc.ToolAction == "" {
			if q != "" {
				tc.ToolAction = fmt.Sprintf("Đang tìm kiếm '%s'", q)
			} else {
				tc.ToolAction = "Đang tìm kiếm trong kho mã nguồn"
			}
		}

	case "run_command", "execute_command", "bash", "terminal":
		cmd, _ := tc.Arguments["command"].(string)
		if cmd == "" {
			cmd, _ = tc.Arguments["CommandLine"].(string)
		}
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Lệnh Terminal"
		}
		if tc.ToolAction == "" {
			if cmd != "" {
				short := cmd
				if len(short) > 30 {
					short = short[:30] + "..."
				}
				tc.ToolAction = fmt.Sprintf("Đang chạy: %s", short)
			} else {
				tc.ToolAction = "Đang thực thi lệnh hệ thống"
			}
		}

	case "manage_task":
		act, _ := tc.Arguments["action"].(string)
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Quản lý tiến trình"
		}
		if tc.ToolAction == "" {
			if act != "" {
				tc.ToolAction = fmt.Sprintf("Tiến trình: %s", act)
			} else {
				tc.ToolAction = "Đang quản trị tiến trình ngầm"
			}
		}

	case "schedule":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Lập lịch tự động"
		}
		if tc.ToolAction == "" {
			tc.ToolAction = "Đang thiết lập lịch chạy tác vụ"
		}

	case "fetch_web_request", "read_url_content", "fetch_web_browser", "browser_subagent":
		u, _ := tc.Arguments["url"].(string)
		if u == "" {
			u, _ = tc.Arguments["Url"].(string)
		}
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Truy cập Web"
		}
		if tc.ToolAction == "" {
			if u != "" {
				tc.ToolAction = fmt.Sprintf("Đang duyệt web %s", u)
			} else {
				tc.ToolAction = "Đang thu thập dữ liệu web"
			}
		}

	case "generate_image":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Tạo hình ảnh"
		}
		if tc.ToolAction == "" {
			tc.ToolAction = "Đang sinh mockup giao diện"
		}

	case "ask_question":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Hỏi ý kiến người dùng"
		}
		if tc.ToolAction == "" {
			tc.ToolAction = "Đang lấy ý kiến lập trình viên"
		}

	case "spawn_subagent":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Khởi tạo Subagent"
		}
		if tc.ToolAction == "" {
			tc.ToolAction = "Đang phân quyền cho Subagent"
		}

	case "remember_lesson":
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Ghi nhớ kinh nghiệm"
		}
		if tc.ToolAction == "" {
			tc.ToolAction = "Đang lưu bài học vào bộ nhớ dài hạn"
		}

	case "call_mcp_tool", "use_mcp_tool":
		sName, _ := tc.Arguments["server_name"].(string)
		tName, _ := tc.Arguments["tool_name"].(string)
		if tc.ToolSummary == "" {
			tc.ToolSummary = "Giao thức MCP"
		}
		if tc.ToolAction == "" {
			if sName != "" && tName != "" {
				tc.ToolAction = fmt.Sprintf("MCP: %s/%s", sName, tName)
			} else {
				tc.ToolAction = "Đang gọi công cụ MCP mở rộng"
			}
		}

	default:
		if tc.ToolSummary == "" {
			tc.ToolSummary = cleanName
		}
		if tc.ToolAction == "" {
			tc.ToolAction = fmt.Sprintf("Đang thực thi %s", cleanName)
		}
	}
}

// CleanFilePath loại bỏ các icon, badge UI (như "{}", "[]", "📄", "⚛️"), quotes, và line numbers (như :#L1-70)
func CleanFilePath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.Trim(p, "\"'`")
	for {
		orig := p
		p = strings.TrimPrefix(p, "{}")
		p = strings.TrimPrefix(p, "[]")
		p = strings.TrimPrefix(p, "()")
		p = strings.TrimPrefix(p, "⚛️")
		p = strings.TrimPrefix(p, "📄")
		p = strings.TrimPrefix(p, "📁")
		p = strings.TrimSpace(p)
		if p == orig {
			break
		}
	}
	reLineSuffix := regexp.MustCompile(`(?i)(?::#L\d+(?:-\d+)?|:\d+(?:-\d+)?)$`)
	p = reLineSuffix.ReplaceAllString(p, "")
	p = strings.TrimSpace(p)
	return p
}

func extractPathArg(args map[string]any) string {
	if args == nil {
		return ""
	}
	for _, k := range []string{"path", "TargetFile", "targetFile", "AbsolutePath", "absolutePath", "filePath", "file"} {
		if v, ok := args[k].(string); ok && v != "" {
			cleaned := CleanFilePath(v)
			if cleaned != v {
				args[k] = cleaned
			}
			return cleaned
		}
	}
	return ""
}
