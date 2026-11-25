package api

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/fxamacker/cbor/v2"
)

// softAuthenticator simulates a platform authenticator with one ES256 credential (attestation "none").
type softAuthenticator struct {
	t       *testing.T
	key     *ecdsa.PrivateKey
	credID  []byte
	counter uint32
	userID  []byte
}

func newSoftAuthenticator(t *testing.T) *softAuthenticator {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	id := make([]byte, 16)
	_, _ = rand.Read(id)
	return &softAuthenticator{t: t, key: key, credID: id}
}

var b64u = base64.RawURLEncoding

func (a *softAuthenticator) credentialID() string { return b64u.EncodeToString(a.credID) }

func (a *softAuthenticator) authData(rpID string, flags byte, attested bool) []byte {
	h := sha256.Sum256([]byte(rpID))
	out := append([]byte{}, h[:]...)
	out = append(out, flags)
	c := make([]byte, 4)
	binary.BigEndian.PutUint32(c, a.counter)
	out = append(out, c...)
	if attested {
		out = append(out, make([]byte, 16)...) // AAGUID
		l := make([]byte, 2)
		binary.BigEndian.PutUint16(l, uint16(len(a.credID)))
		out = append(out, l...)
		out = append(out, a.credID...)
		x := a.key.PublicKey.X.FillBytes(make([]byte, 32))
		y := a.key.PublicKey.Y.FillBytes(make([]byte, 32))
		cose, err := cbor.Marshal(map[int]interface{}{1: 2, 3: -7, -1: 1, -2: x, -3: y})
		if err != nil {
			a.t.Fatal(err)
		}
		out = append(out, cose...)
	}
	return out
}

func clientData(typ, challenge, origin string) []byte {
	b, _ := json.Marshal(map[string]interface{}{"type": typ, "challenge": challenge, "origin": origin, "crossOrigin": false})
	return b
}

const (
	flagUP = 0x01
	flagUV = 0x04
	flagAT = 0x40
)

// create answers navigator.credentials.create for the given challenge (base64url) and user handle.
func (a *softAuthenticator) create(challenge, origin, rpID string, userHandle []byte) json.RawMessage {
	a.userID = userHandle
	att, err := cbor.Marshal(map[string]interface{}{
		"fmt":      "none",
		"attStmt":  map[string]interface{}{},
		"authData": a.authData(rpID, flagUP|flagUV|flagAT, true),
	})
	if err != nil {
		a.t.Fatal(err)
	}
	b, _ := json.Marshal(map[string]interface{}{
		"id":    a.credentialID(),
		"rawId": a.credentialID(),
		"type":  "public-key",
		"response": map[string]interface{}{
			"clientDataJSON":    b64u.EncodeToString(clientData("webauthn.create", challenge, origin)),
			"attestationObject": b64u.EncodeToString(att),
			"transports":        []string{"internal"},
		},
		"clientExtensionResults": map[string]interface{}{},
	})
	return b
}

// get answers navigator.credentials.get; flags default to UP|UV.
func (a *softAuthenticator) get(challenge, origin, rpID string, flags byte) json.RawMessage {
	a.counter++
	ad := a.authData(rpID, flags, false)
	cd := clientData("webauthn.get", challenge, origin)
	cdHash := sha256.Sum256(cd)
	digest := sha256.Sum256(append(append([]byte{}, ad...), cdHash[:]...))
	sig, err := ecdsa.SignASN1(rand.Reader, a.key, digest[:])
	if err != nil {
		a.t.Fatal(err)
	}
	b, _ := json.Marshal(map[string]interface{}{
		"id":    a.credentialID(),
		"rawId": a.credentialID(),
		"type":  "public-key",
		"response": map[string]interface{}{
			"clientDataJSON":    b64u.EncodeToString(cd),
			"authenticatorData": b64u.EncodeToString(ad),
			"signature":         b64u.EncodeToString(sig),
			"userHandle":        b64u.EncodeToString(a.userID),
		},
		"clientExtensionResults": map[string]interface{}{},
	})
	return b
}
