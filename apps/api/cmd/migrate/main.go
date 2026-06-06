package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"

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

	// Ensure tracking table exists
	_, err = conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT        PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "create schema_migrations: %v\n", err)
		os.Exit(1)
	}

	// Load already-applied versions
	rows, err := conn.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "query schema_migrations: %v\n", err)
		os.Exit(1)
	}
	applied := map[string]bool{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			fmt.Fprintf(os.Stderr, "scan: %v\n", err)
			os.Exit(1)
		}
		applied[v] = true
	}
	rows.Close()

	// Collect and sort migration files
	_, filename, _, _ := runtime.Caller(0)
	migrationsDir := filepath.Join(filepath.Dir(filename), "../../migrations")

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read migrations dir: %v\n", err)
		os.Exit(1)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".sql" {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	pending := 0
	for _, name := range files {
		if applied[name] {
			fmt.Printf("skip %s (already applied)\n", name)
			continue
		}

		sql, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			fmt.Fprintf(os.Stderr, "read %s: %v\n", name, err)
			os.Exit(1)
		}

		fmt.Printf("running %s...\n", name)
		tx, err := conn.Begin(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "begin tx: %v\n", err)
			os.Exit(1)
		}

		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "exec %s: %v\n", name, err)
			os.Exit(1)
		}

		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "record %s: %v\n", name, err)
			os.Exit(1)
		}

		if err := tx.Commit(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "commit %s: %v\n", name, err)
			os.Exit(1)
		}
		fmt.Printf("  ok\n")
		pending++
	}

	if pending == 0 {
		fmt.Println("already up to date")
	} else {
		fmt.Printf("applied %d migration(s)\n", pending)
	}
}
