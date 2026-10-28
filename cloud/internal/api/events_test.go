package api

import (
	"testing"
	"time"
)

func TestBroker_BroadcastAll(t *testing.T) {
	broker := NewBroker()

	chan1 := make(chan string, 10)
	chan2 := make(chan string, 10)

	broker.newClients <- clientReq{msgChan: chan1, userID: "user-1"}
	broker.newClients <- clientReq{msgChan: chan2, userID: "user-2"}

	// Wait for registration
	time.Sleep(50 * time.Millisecond)

	// Drain initial presence events emitted upon connection
	drain := func(ch chan string) {
		for {
			select {
			case <-ch:
			default:
				return
			}
		}
	}
	drain(chan1)
	drain(chan2)

	// BroadcastAll should deliver to all connected clients
	testMsg := `{"type":"app_update","version":"0.2.0"}`
	broker.BroadcastAll(testMsg)

	select {
	case msg := <-chan1:
		if msg != testMsg {
			t.Errorf("chan1 expected %s, got %s", testMsg, msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("chan1 timed out waiting for BroadcastAll")
	}

	select {
	case msg := <-chan2:
		if msg != testMsg {
			t.Errorf("chan2 expected %s, got %s", testMsg, msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("chan2 timed out waiting for BroadcastAll")
	}

	// Targeted Broadcast should only deliver to matching userID
	user1Msg := `{"type":"file_shared","file_id":"123"}`
	broker.Broadcast("user-1", user1Msg)

	select {
	case msg := <-chan1:
		if msg != user1Msg {
			t.Errorf("chan1 expected %s, got %s", user1Msg, msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("chan1 timed out waiting for targeted Broadcast")
	}

	select {
	case msg := <-chan2:
		t.Fatalf("chan2 unexpectedly received targeted message for user-1: %s", msg)
	case <-time.After(100 * time.Millisecond):
		// Expected: chan2 should not receive it
	}
}

func TestBroker_PresenceEvents(t *testing.T) {
	broker := NewBroker()

	chan1 := make(chan string, 10)
	broker.newClients <- clientReq{msgChan: chan1, userID: "user-1"}

	select {
	case msg := <-chan1:
		expected := `{"payload":{"status":"online","user_id":"user-1"},"type":"user_status_changed"}`
		if msg != expected {
			t.Errorf("expected presence event %s, got %s", expected, msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for online presence event")
	}

	chan2 := make(chan string, 10)
	broker.newClients <- clientReq{msgChan: chan2, userID: "user-2"}

	// Wait for registration & presence event on chan1
	select {
	case msg := <-chan1:
		expected := `{"payload":{"status":"online","user_id":"user-2"},"type":"user_status_changed"}`
		if msg != expected {
			t.Errorf("expected presence event %s, got %s", expected, msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for user-2 presence on chan1")
	}

	// Test custom status broadcast
	broker.BroadcastPresence("user-1", "away")
	select {
	case msg := <-chan1:
		expected := `{"payload":{"status":"away","user_id":"user-1"},"type":"user_status_changed"}`
		if msg != expected {
			t.Errorf("expected away presence event %s, got %s", expected, msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for away presence on chan1")
	}

	// Test disconnect
	broker.closedClients <- chan2
	select {
	case msg := <-chan1:
		expected := `{"payload":{"status":"offline","user_id":"user-2"},"type":"user_status_changed"}`
		if msg != expected {
			t.Errorf("expected offline presence event %s, got %s", expected, msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for offline presence on chan1")
	}
}
