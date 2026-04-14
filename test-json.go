package main
import (
	"encoding/json"
	"fmt"
)

type ShareRequest struct {
	RecipientEmail string `json:"email"`
	SecuredMeta    []byte `json:"secured_meta"`
}

func main() {
	j1 := `{"email":"test@test.com", "secured_meta": "YmFzZTY0"}`
	var req1 ShareRequest
	err := json.Unmarshal([]byte(j1), &req1)
	fmt.Println("String:", err)

	j2 := `{"email":"test@test.com", "secured_meta": [97,98,99]}`
	var req2 ShareRequest
	err = json.Unmarshal([]byte(j2), &req2)
	fmt.Println("Array:", err)

	j3 := `{"email":"test@test.com", "secured_meta": {"type":"Buffer", "data":[97]}}`
	var req3 ShareRequest
	err = json.Unmarshal([]byte(j3), &req3)
	fmt.Println("Object:", err)
}
