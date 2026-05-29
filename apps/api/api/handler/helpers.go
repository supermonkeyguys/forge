package handler

import (
	"bytes"
	"net/http"
	"strconv"
)

// jsonReader wraps a JSON byte slice as an io.Reader for http.Post.
func jsonReader(b []byte) *bytes.Reader {
	return bytes.NewReader(b)
}

// parsePagination extracts page/limit from query string.
// Defaults: limit=20, page=1. Max limit=100.
func parsePagination(r *http.Request) (limit, offset int) {
	limit = 20
	page := 1
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 100 {
		limit = 100
	}
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	offset = (page - 1) * limit
	return limit, offset
}
