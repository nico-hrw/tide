# Model Context Protocol (MCP) Tools Specification

- **Document Version:** 1.0.0
- **Protocol Version:** `2024-11-05`
- **Transport:** Standard Input/Output (`stdio`) JSON-RPC 2.0
- **Implementation Source:** `crates/tide-daemon/src/mcp.rs`
- **Status:** Approved / Active

---

## 1. Overview & Architecture

Tide implements an agent-facing [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server directly embedded within `tide-daemon`. The MCP server exposes high-performance, token-efficient programmatic access to the user's local encrypted personal knowledge base, notes, hierarchical block trees, task/todo lists, and associative graph links.

```
┌────────────────────────────────┐
│   MCP Client (LLM / Agent)    │
│  (Claude, Antigravity, etc.)   │
└───────────────┬────────────────┘
                │ Stdio JSON-RPC 2.0 (Protocol: 2024-11-05)
                ▼
┌────────────────────────────────┐
│         tide-daemon            │
│  ┌──────────────────────────┐  │
│  │   crates/tide-daemon     │  │
│  │       src/mcp.rs         │  │
│  └────────────┬─────────────┘  │
│               │                │
│    ┌──────────┴──────────┐     │
│    ▼                     ▼     │
│ SQLite / FTS5      Decryption  │
│ (Index & Search)   (DEK / AES) │
└────────────────────────────────┘
```

### Key Principles
1. **Token Efficiency:** Instead of loading full documents into prompt context, tools provide fine-grained surgical operations (`tide_get_note_outline`, `tide_get_note_section`, `tide_get_focused_blocks`).
2. **Document Integrity:** Content modifications happen at the atomic block level (`tide_patch_block`) using UUID-tracked ProseMirror / Markdown AST nodes, avoiding destructive blind document rewrites.
3. **Local Encryption Transparency:** The daemon unrolls locally decrypted state (AES-256-GCM / DEK) inside memory; MCP clients interact strictly with plaintext abstractions without leaking crypto keys.
4. **Standard JSON-RPC 2.0:** All interactions follow standard JSON-RPC 2.0 over standard I/O streams (`stdio`).

---

## 2. Protocol Initialization & Discovery

During startup, the client and daemon perform the standard MCP handshake:

### 2.1 Handshake (`initialize`)
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "clientInfo": {
      "name": "antigravity-agent",
      "version": "1.0.0"
    }
  }
}
```

Daemon responds:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    },
    "serverInfo": {
      "name": "tide-daemon",
      "version": "0.1.0"
    }
  }
}
```

### 2.2 Tool Listing (`tools/list`)
Agents discover available tools by querying `tools/list`. The daemon returns the 10 tool definitions described below.

---

## 3. Tool Reference

### 3.1 `tide_search`
Performs BM25-ranked full-text search against the local SQLite FTS5 index across notes, sections, and snippets.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search keyword or query string (FTS5 compatible syntax)"
    },
    "limit": {
      "type": "integer",
      "description": "Max results to return (default: 5, max: 50)"
    }
  },
  "required": ["query"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "note_id": { "type": "string", "format": "uuid" },
          "title": { "type": "string" },
          "snippet": { "type": "string" },
          "score": { "type": "number" },
          "updated_at": { "type": "string", "format": "date-time" }
        },
        "required": ["note_id", "title", "snippet", "score"]
      }
    },
    "total_matches": { "type": "integer" }
  },
  "required": ["results", "total_matches"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "tide_search",
    "arguments": {
      "query": "architecture database",
      "limit": 2
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"results\":[{\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"title\":\"Core Architecture\",\"snippet\":\"...the SQLite database maintains an FTS5 virtual table for full-text queries...\",\"score\":-4.21,\"updated_at\":\"2026-11-14T10:15:00Z\"}],\"total_matches\":1}"
      }
    ]
  }
}
```

---

### 3.2 `tide_get_note_outline`
Extracts structural hierarchy (headings H1–H6, block identifiers, checklist counters) without retrieving full text body, minimizing LLM context usage.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": {
      "type": "string",
      "description": "Target Note UUID"
    }
  },
  "required": ["note_id"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": { "type": "string" },
    "title": { "type": "string" },
    "outline": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "block_id": { "type": "string" },
          "level": { "type": "integer", "minimum": 1, "maximum": 6 },
          "heading": { "type": "string" },
          "child_blocks_count": { "type": "integer" }
        },
        "required": ["block_id", "level", "heading"]
      }
    }
  },
  "required": ["note_id", "title", "outline"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "tide_get_note_outline",
    "arguments": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"title\":\"System Spec\",\"outline\":[{\"block_id\":\"blk-head-1\",\"level\":1,\"heading\":\"System Spec\",\"child_blocks_count\":12},{\"block_id\":\"blk-head-2\",\"level\":2,\"heading\":\"Storage Engine\",\"child_blocks_count\":5}]}"
      }
    ]
  }
}
```

---

### 3.3 `tide_get_note_section`
Extracts a specific section nested under a heading text or heading slug without parsing or transmitting the rest of the document.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": {
      "type": "string",
      "description": "Target Note UUID"
    },
    "heading": {
      "type": "string",
      "description": "Heading title or anchor text to match"
    }
  },
  "required": ["note_id", "heading"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": { "type": "string" },
    "heading": { "type": "string" },
    "level": { "type": "integer" },
    "content_markdown": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "block_id": { "type": "string" },
          "type": { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["block_id", "type", "content"]
      }
    }
  },
  "required": ["note_id", "heading", "content_markdown", "blocks"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "tide_get_note_section",
    "arguments": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011",
      "heading": "Storage Engine"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"heading\":\"Storage Engine\",\"level\":2,\"content_markdown\":\"The storage engine utilizes SQLite with WAL mode enabled.\",\"blocks\":[{\"block_id\":\"blk-992\",\"type\":\"paragraph\",\"content\":\"The storage engine utilizes SQLite with WAL mode enabled.\"}]}"
      }
    ]
  }
}
```

---

### 3.4 `tide_get_note_graph`
Navigates the bidirectional knowledge graph for a note, surfacing all outgoing wiki-links (`[[Note]]`), block embeds, and incoming backlinks.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": {
      "type": "string",
      "description": "Target Note UUID"
    }
  },
  "required": ["note_id"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": { "type": "string" },
    "outgoing_links": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "target_note_id": { "type": "string" },
          "target_title": { "type": "string" },
          "link_type": { "type": "string", "enum": ["wikilink", "embed", "url"] }
        },
        "required": ["target_note_id", "target_title", "link_type"]
      }
    },
    "backlinks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source_note_id": { "type": "string" },
          "source_title": { "type": "string" },
          "context_snippet": { "type": "string" }
        },
        "required": ["source_note_id", "source_title"]
      }
    }
  },
  "required": ["note_id", "outgoing_links", "backlinks"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "tide_get_note_graph",
    "arguments": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"outgoing_links\":[{\"target_note_id\":\"a110bb22-3344-5566-7788-99aabbccddeeff\",\"target_title\":\"Security Spec\",\"link_type\":\"wikilink\"}],\"backlinks\":[{\"source_note_id\":\"b334cc44-5566-7788-99aa-001122334455\",\"source_title\":\"Architecture Overview\",\"context_snippet\":\"Refer to [[Core Architecture]] for data tier details.\"}]}"
      }
    ]
  }
}
```

---

### 3.5 `tide_list_todos`
Queries task items extracted from markdown checklists (`- [ ]` / `- [x]`) and explicit task entities across all notes or within a filtered scope.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["pending", "completed", "all"],
      "description": "Filter by completion status (default: 'pending')"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high", "urgent"],
      "description": "Optional priority filter"
    },
    "tag": {
      "type": "string",
      "description": "Filter by tag/category (e.g., 'work', 'tide')"
    },
    "due_before": {
      "type": "string",
      "format": "date-time",
      "description": "Upper bound ISO8601 timestamp for due date"
    },
    "due_after": {
      "type": "string",
      "format": "date-time",
      "description": "Lower bound ISO8601 timestamp for due date"
    }
  }
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "note_id": { "type": "string", "format": "uuid" },
          "block_id": { "type": "string" },
          "text": { "type": "string" },
          "is_completed": { "type": "boolean" },
          "status": { "type": "string" },
          "priority": { "type": "string" },
          "due_date": { "type": ["string", "null"] },
          "tags": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["id", "note_id", "block_id", "text", "is_completed", "status"]
      }
    },
    "total": { "type": "integer" }
  },
  "required": ["todos", "total"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "tide_list_todos",
    "arguments": {
      "status": "pending"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"todos\":[{\"id\":\"td-101\",\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"block_id\":\"blk-todo-9\",\"text\":\"Implement MCP tools documentation\",\"is_completed\":false,\"status\":\"pending\",\"priority\":\"high\",\"due_date\":\"2026-11-20T18:00:00Z\",\"tags\":[\"docs\",\"mcp\"]}],\"total\":1}"
      }
    ]
  }
}
```

---

### 3.6 `tide_patch_todo`
Atomically updates todo fields (completion flag, status, priority, due date, text) and triggers local change notifications.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Todo UUID"
    },
    "is_completed": {
      "type": "boolean",
      "description": "Checklist state (true = checked, false = unchecked)"
    },
    "status": {
      "type": "string",
      "description": "Workflow status string (e.g., 'completed', 'in_progress', 'pending')"
    },
    "text": {
      "type": "string",
      "description": "Optional revised todo description"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high", "urgent"],
      "description": "Updated priority"
    },
    "due_date": {
      "type": ["string", "null"],
      "description": "Updated ISO8601 due date or null to clear"
    }
  },
  "required": ["id", "is_completed", "status"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "todo": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "is_completed": { "type": "boolean" },
        "status": { "type": "string" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "is_completed", "status", "updated_at"]
    }
  },
  "required": ["success", "todo"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "tide_patch_todo",
    "arguments": {
      "id": "td-101",
      "is_completed": true,
      "status": "completed"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"todo\":{\"id\":\"td-101\",\"is_completed\":true,\"status\":\"completed\",\"updated_at\":\"2026-11-15T20:35:00Z\"}}"
      }
    ]
  }
}
```

---

### 3.7 `tide_get_note`
Fetches the full markdown or decrypted JSON AST of a note identified by UUID or title slug.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": {
      "type": "string",
      "description": "Note UUID or exact title slug"
    }
  },
  "required": ["note_id"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "title": { "type": "string" },
    "content_markdown": { "type": "string" },
    "doc_ast": { "type": "object", "description": "ProseMirror JSON document hierarchy" },
    "metadata": {
      "type": "object",
      "properties": {
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "pinned": { "type": "boolean" },
        "tags": { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "required": ["id", "title", "content_markdown"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "tide_get_note",
    "arguments": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"title\":\"Core Architecture\",\"content_markdown\":\"# Core Architecture\\n\\nSystem components documentation.\",\"metadata\":{\"created_at\":\"2026-11-10T12:00:00Z\",\"updated_at\":\"2026-11-15T18:00:00Z\",\"pinned\":false,\"tags\":[\"dev\"]}}"
      }
    ]
  }
}
```

---

### 3.8 `tide_get_block`
Retrieves a single isolated ProseMirror block node by its unique UUID `block_id`.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": {
      "type": "string",
      "description": "Note UUID containing the block"
    },
    "block_id": {
      "type": "string",
      "description": "Unique block UUID / identifier"
    }
  },
  "required": ["note_id", "block_id"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": { "type": "string" },
    "block_id": { "type": "string" },
    "type": { "type": "string", "description": "e.g. 'paragraph', 'heading', 'code_block', 'task_item'" },
    "attrs": { "type": "object" },
    "content": { "type": "string", "description": "Markdown / text representation of block" },
    "json_node": { "type": "object", "description": "Raw ProseMirror node" }
  },
  "required": ["note_id", "block_id", "type", "content"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "tools/call",
  "params": {
    "name": "tide_get_block",
    "arguments": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011",
      "block_id": "blk-992"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"block_id\":\"blk-992\",\"type\":\"paragraph\",\"content\":\"The storage engine utilizes SQLite with WAL mode enabled.\"}"
      }
    ]
  }
}
```

---

### 3.9 `tide_get_focused_blocks`
Retrieves blocks explicitly tagged with active cursor/focus markers or reading intent, alongside preceding ($N$) and succeeding ($N$) sibling blocks for contextual awareness.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": {
      "type": "string",
      "description": "Target Note UUID"
    },
    "context_window": {
      "type": "integer",
      "description": "Number of sibling blocks before and after each focused block (default: 2)"
    }
  },
  "required": ["note_id"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": { "type": "string" },
    "focused_blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "focused_block": {
            "type": "object",
            "properties": {
              "block_id": { "type": "string" },
              "content": { "type": "string" },
              "type": { "type": "string" }
            },
            "required": ["block_id", "content", "type"]
          },
          "preceding": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "block_id": { "type": "string" },
                "content": { "type": "string" }
              }
            }
          },
          "succeeding": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "block_id": { "type": "string" },
                "content": { "type": "string" }
              }
            }
          }
        },
        "required": ["focused_block", "preceding", "succeeding"]
      }
    }
  },
  "required": ["note_id", "focused_blocks"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "tide_get_focused_blocks",
    "arguments": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011"
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"focused_blocks\":[{\"focused_block\":{\"block_id\":\"blk-head-2\",\"content\":\"Storage Engine\",\"type\":\"heading\"},\"preceding\":[{\"block_id\":\"blk-intro\",\"content\":\"System Spec overview content.\"}],\"succeeding\":[{\"block_id\":\"blk-992\",\"content\":\"The storage engine utilizes SQLite with WAL mode enabled.\"}]}]}"
      }
    ]
  }
}
```

---

### 3.10 `tide_patch_block`
Targeted in-place surgical replacement of a single block's content. Replaces the inner content and attributes while preserving the document hierarchy, surrounding block structure, and persistent block UUID.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "note_id": {
      "type": "string",
      "description": "Target Note UUID"
    },
    "block_id": {
      "type": "string",
      "description": "Target Block identifier to replace"
    },
    "content": {
      "type": "string",
      "description": "New markdown or plain text content for the block"
    }
  },
  "required": ["note_id", "block_id", "content"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "note_id": { "type": "string" },
    "block_id": { "type": "string" },
    "updated_at": { "type": "string", "format": "date-time" },
    "version": { "type": "integer" }
  },
  "required": ["success", "note_id", "block_id", "updated_at"]
}
```

#### Example Call
```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "tide_patch_block",
    "arguments": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011",
      "block_id": "blk-992",
      "content": "The storage engine utilizes SQLite with WAL mode and memory-mapped I/O."
    }
  }
}
```

#### Example Response
```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"note_id\":\"e5f1b2c3-9821-4f12-9c3a-d68a9f243011\",\"block_id\":\"blk-992\",\"updated_at\":\"2026-11-15T20:36:10Z\",\"version\":4}"
      }
    ]
  }
}
```

---

## 4. Error Handling & Standard Error Codes

Tide MCP implements standard JSON-RPC 2.0 error reporting along with custom application error codes:

| Error Name | Code | Description | Typical Cause |
|------------|------|-------------|---------------|
| `ParseError` | `-32700` | Invalid JSON received by the daemon | Malformed stdin payload |
| `InvalidRequest` | `-32600` | JSON is not a valid Request object | Missing `jsonrpc` or `method` |
| `MethodNotFound` | `-32601` | Method or tool does not exist | Typo in tool name |
| `InvalidParams` | `-32602` | Tool arguments failed schema validation | Missing required fields (`note_id`, `block_id`) |
| `InternalError` | `-32603` | Internal engine failure | Unexpected SQLite error |
| `NoteNotFound` | `-32001` | Target note does not exist | Invalid UUID or slug provided |
| `BlockNotFound` | `-32002` | Target block not found in note | Block was removed or ID changed |
| `DecryptionError`| `-32003` | Unable to decrypt note payload | Missing vault key or invalid DEK |
| `ConflictError` | `-32005` | Concurrent modification conflict | Block version mismatch during patch |

### Error Response Example
```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "error": {
    "code": -32002,
    "message": "BlockNotFound: Block 'blk-unknown' does not exist in note 'e5f1b2c3-9821-4f12-9c3a-d68a9f243011'",
    "data": {
      "note_id": "e5f1b2c3-9821-4f12-9c3a-d68a9f243011",
      "block_id": "blk-unknown"
    }
  }
}
```

---

## 5. Developer Guide & Agent Best Practices

### 5.1 Configuring MCP Clients
To connect an MCP client to Tide Daemon, configure `stdio` invocation:

```json
{
  "mcpServers": {
    "tide": {
      "command": "tide-daemon",
      "args": ["--mcp"],
      "env": {
        "TIDE_VAULT_PATH": "~/.tide/vault",
        "RUST_LOG": "info"
      }
    }
  }
}
```

### 5.2 Recommended Agent Tool Flow
When an agent is tasked with reading or updating documents, follow this token-conserving lifecycle:

1. **Discovery:** Call `tide_search` to find candidate note IDs.
2. **Structural Orientation:** Call `tide_get_note_outline` to locate the exact heading or section of interest.
3. **Targeted Reading:** Call `tide_get_note_section` or `tide_get_focused_blocks` instead of fetching the entire document with `tide_get_note`.
4. **Surgical Mutation:** Call `tide_patch_block` to modify specific content blocks without disrupting surrounding blocks, metadata, or link integrity.
