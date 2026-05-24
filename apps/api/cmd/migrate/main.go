package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	// Find migrations directory relative to this file
	_, filename, _, _ := runtime.Caller(0)
	migrationsDir := filepath.Join(filepath.Dir(filename), "../../migrations")

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read migrations dir: %v\n", err)
		os.Exit(1)
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		sqlPath := filepath.Join(migrationsDir, entry.Name())
		sql, err := os.ReadFile(sqlPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read %s: %v\n", entry.Name(), err)
			os.Exit(1)
		}
		fmt.Printf("running %s...\n", entry.Name())
		if _, err := conn.Exec(ctx, string(sql)); err != nil {
			fmt.Fprintf(os.Stderr, "exec %s: %v\n", entry.Name(), err)
			os.Exit(1)
		}
		fmt.Printf("  ok\n")
	}
	fmt.Println("migrations complete")
}
