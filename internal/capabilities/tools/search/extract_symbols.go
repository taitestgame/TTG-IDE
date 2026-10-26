package search

import (
	"context"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"ttgide/internal/capabilities"
)

// RegisterExtractSymbolsTool dang ky rieng cong cu extract_symbols
func RegisterExtractSymbolsTool(m *capabilities.Manager, workspaceRoot string) {
	m.Register(capabilities.Tool{
		Definition: capabilities.ToolDefinition{
			Name:        "extract_symbols",
			Description: "Boc tach toan bo struct, interface, ham, method trong file ma nguon (Go/TS/JS) ma khong can doc ca ngan dong code, tiet kiem 90% token.",
			Category:    "search",
			Parameters: map[string]any{
				"path": "duong dan file can boc tach AST",
			},
		},
		Handler: func(ctx context.Context, args map[string]any) (string, error) {
			relPath, ok := args["path"].(string)
			if !ok || relPath == "" {
				return "", fmt.Errorf("thieu tham so 'path'")
			}

			fullPath := filepath.Join(workspaceRoot, relPath)
			data, err := os.ReadFile(fullPath)
			if err != nil {
				return "", fmt.Errorf("khong the mo file: %w", err)
			}

			ext := strings.ToLower(filepath.Ext(fullPath))

			// Neu la file Go: Su dung parser AST chuan cua Go standard library
			if ext == ".go" {
				return extractGoSymbols(relPath, data)
			}

			// File ngon ngu khac (TS, JS, Python...): Su dung Regex-based Symbol Extraction
			return extractGenericSymbols(relPath, string(data))
		},
	})
}

func extractGoSymbols(filePath string, src []byte) (string, error) {
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, filePath, src, parser.ParseComments)
	if err != nil {
		return "", fmt.Errorf("loi phan tich AST Go: %w", err)
	}

	var structs []string
	var interfaces []string
	var functions []string
	var methods []string

	for _, decl := range node.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			if d.Tok == token.TYPE {
				for _, spec := range d.Specs {
					if ts, ok := spec.(*ast.TypeSpec); ok {
						line := fset.Position(ts.Pos()).Line
						switch ts.Type.(type) {
						case *ast.StructType:
							structs = append(structs, fmt.Sprintf("  - struct %s (line %d)", ts.Name.Name, line))
						case *ast.InterfaceType:
							interfaces = append(interfaces, fmt.Sprintf("  - interface %s (line %d)", ts.Name.Name, line))
						default:
							structs = append(structs, fmt.Sprintf("  - type %s (line %d)", ts.Name.Name, line))
						}
					}
				}
			}
		case *ast.FuncDecl:
			line := fset.Position(d.Pos()).Line
			if d.Recv != nil && len(d.Recv.List) > 0 {
				recvType := ""
				switch t := d.Recv.List[0].Type.(type) {
				case *ast.StarExpr:
					if ident, ok := t.X.(*ast.Ident); ok {
						recvType = "*" + ident.Name
					}
				case *ast.Ident:
					recvType = t.Name
				}
				methods = append(methods, fmt.Sprintf("  - method (%s) %s (line %d)", recvType, d.Name.Name, line))
			} else {
				functions = append(functions, fmt.Sprintf("  - func %s (line %d)", d.Name.Name, line))
			}
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("=== GO AST SYMBOLS: %s (Package: %s) ===\n", filePath, node.Name.Name))
	if len(structs) > 0 {
		sb.WriteString("STRUCTS & TYPES:\n" + strings.Join(structs, "\n") + "\n\n")
	}
	if len(interfaces) > 0 {
		sb.WriteString("INTERFACES:\n" + strings.Join(interfaces, "\n") + "\n\n")
	}
	if len(functions) > 0 {
		sb.WriteString("FUNCTIONS:\n" + strings.Join(functions, "\n") + "\n\n")
	}
	if len(methods) > 0 {
		sb.WriteString("METHODS:\n" + strings.Join(methods, "\n") + "\n")
	}

	return sb.String(), nil
}

func extractGenericSymbols(filePath, content string) (string, error) {
	lines := strings.Split(content, "\n")
	reClass := regexp.MustCompile(`^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_]+)`)
	reFunc := regexp.MustCompile(`^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)`)
	reInterface := regexp.MustCompile(`^(?:export\s+)?interface\s+([A-Za-z0-9_]+)`)
	reType := regexp.MustCompile(`^(?:export\s+)?type\s+([A-Za-z0-9_]+)`)
	rePyDef := regexp.MustCompile(`^\s*(?:def|class)\s+([A-Za-z0-9_]+)`)

	var symbols []string
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		lineNum := i + 1
		if m := reClass.FindStringSubmatch(trimmed); len(m) > 1 {
			symbols = append(symbols, fmt.Sprintf("  - class %s (line %d)", m[1], lineNum))
		} else if m := reInterface.FindStringSubmatch(trimmed); len(m) > 1 {
			symbols = append(symbols, fmt.Sprintf("  - interface %s (line %d)", m[1], lineNum))
		} else if m := reType.FindStringSubmatch(trimmed); len(m) > 1 {
			symbols = append(symbols, fmt.Sprintf("  - type %s (line %d)", m[1], lineNum))
		} else if m := reFunc.FindStringSubmatch(trimmed); len(m) > 1 {
			symbols = append(symbols, fmt.Sprintf("  - function %s (line %d)", m[1], lineNum))
		} else if m := rePyDef.FindStringSubmatch(trimmed); len(m) > 1 {
			symbols = append(symbols, fmt.Sprintf("  - symbol %s (line %d)", m[1], lineNum))
		}
	}

	if len(symbols) == 0 {
		return fmt.Sprintf("Khong tim thay khai bao class/function nao ro rang trong file: %s", filePath), nil
	}

	return fmt.Sprintf("=== SYMBOLS: %s ===\n%s", filePath, strings.Join(symbols, "\n")), nil
}
