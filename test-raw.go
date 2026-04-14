package main

import (
	"encoding/json"
	"fmt"
)

type CreateFileRequest struct {
	PublicMeta json.RawMessage `json:"public_meta"`
}

func main() {
	j := `{"public_meta": {}}`
	var req CreateFileRequest
	err := json.Unmarshal([]byte(j), &req)
	fmt.Printf("Error: %v\nValue: %s\n", err, string(req.PublicMeta))
}
