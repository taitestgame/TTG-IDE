package sqlite

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite" // SQLite thuần Go (không cần CGO, chạy mượt mà trên Windows)
)

// DB bao bọc kết nối cơ sở dữ liệu SQLite cục bộ
type DB struct {
	conn *sql.DB
}

// Open khởi tạo kết nối SQLite tại đường dẫn dbPath và tự động chạy khởi tạo schema bảng
func Open(dbPath string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("không thể tạo thư mục chứa cơ sở dữ liệu: %w", err)
	}

	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("không thể mở cơ sở dữ liệu SQLite: %w", err)
	}

	// Thực thi DDL Schema khởi tạo các bảng
	if _, err := conn.Exec(SchemaSQL); err != nil {
		conn.Close()
		return nil, fmt.Errorf("khởi tạo schema thất bại: %w", err)
	}

	return &DB{conn: conn}, nil
}

// Close đóng kết nối cơ sở dữ liệu khi ứng dụng tắt
func (d *DB) Close() error {
	if d.conn != nil {
		return d.conn.Close()
	}
	return nil
}

// Conn trả về con trỏ kết nối sql.DB bên dưới
func (d *DB) Conn() *sql.DB {
	return d.conn
}
