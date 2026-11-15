# Tide Daemon: AI Agent & IDE Integration Guide

This guide details how to integrate AI Agents, IDEs, and CLI assistants with the **Tide Local MCP (Model Context Protocol) Server** provided by `tide-daemon`.

---

## 1. Integration Principles & Architecture

Modern AI workflows demand access to personal notes, task lists, and context. However, sending unencrypted personal knowledge bases to third-party cloud aggregators introduces severe privacy and security risks.

Tide solves this problem through an **offline-first, zero-knowledge architecture**:

```
 ┌──────────────────────┐                     ┌──────────────────────┐
 │     Remote Cloud     │                     │     Local Machine    │
 │ (Zero-Knowledge Sync)│                     │                      │
 └──────────┬───────────┘                     │  ┌────────────────┐  │
            │ AES-256-GCM                     │  │ AI Agent / IDE │  │
            │ Encrypted Blobs                 │  │ (Claude/Cursor)│  │
            ▼                                 │  └───────┬────────┘  │
 ┌──────────────────────┐  tide-daemon login  │          │ stdio     │
 │   tide-daemon sync   ├────────────────────►│          │ (JSON-RPC)│
 │  (Client Decryption) │  Local SQLite DB    │          ▼           │
 └──────────────────────┘  (~/.tide/local.db) │  ┌────────────────┐  │
                                              │  │  tide-daemon   │  │
                                              │  │   mcp server   │  │
                                              │  └────────────────┘  │
                                              └──────────────────────┘
```

### Key Security Guarantees:
1. **End-to-End Encryption at Rest & in Transit:** User notes and master keys are encrypted client-side using RSA and AES-256-GCM. Cloud servers only store ciphertext.
2. **Local Decryption Only:** Notes are decrypted into your local SQLite store (`~/.tide/local.db`) only after you supply your personal PIN / vault credentials.
3. **Stdio MCP Protocol:** AI agents communicate with `tide-daemon mcp` via standard input/output (`stdin`/`stdout`) streams on the local operating system. No network ports are exposed, and no intermediate cloud proxies inspect your notes.
4. **Strict Output Discipline:** `tide-daemon mcp` reserves `stdout` exclusively for valid JSON-RPC frames. All diagnostic logging, sync warnings, and error messages are written to `stderr` to prevent stream pollution.

---

## 2. Setup Instructions & Configuration Files

`tide-daemon` exposes an MCP server via the `mcp` subcommand:
```bash
tide-daemon mcp [--db-path <PATH_TO_DB>]
```
If `--db-path` is omitted, it defaults to `~/.tide/local.db`.

---

### A. Claude Desktop

Claude Desktop supports local stdio MCP servers via its configuration file.

#### Configuration File Locations
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
  *(typically `C:\Users\<Username>\AppData\Roaming\Claude\claude_desktop_config.json`)*
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

#### Windows Snippet
```json
{
  "mcpServers": {
    "tide": {
      "command": "C:\\Users\\<Username>\\.cargo\\bin\\tide-daemon.exe",
      "args": ["mcp"],
      "env": {
        "TIDE_HOME": "C:\\Users\\<Username>\\.tide",
        "TIDE_LOG_LEVEL": "info"
      }
    }
  }
}
```

#### macOS / Linux Snippet
```json
{
  "mcpServers": {
    "tide": {
      "command": "/usr/local/bin/tide-daemon",
      "args": ["mcp", "--db-path", "~/.tide/local.db"],
      "env": {
        "TIDE_HOME": "/Users/<username>/.tide",
        "TIDE_LOG_LEVEL": "info"
      }
    }
  }
}
```

> [!TIP]
> Ensure the absolute path to `tide-daemon` is specified if it is not located on Claude Desktop's default system `PATH`.

---

### B. Cursor

Cursor supports MCP servers configured at the workspace level or globally.

#### Workspace Configuration: `.cursor/mcp.json`
Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "tide": {
      "command": "tide-daemon",
      "args": ["mcp"],
      "env": {
        "TIDE_LOG_LEVEL": "warn"
      }
    }
  }
}
```

#### Global Configuration via Cursor UI
1. Navigate to **Cursor Settings** > **Features** > **MCP Servers**.
2. Click **Add New MCP Server**.
3. Fill in:
   - **Name:** `tide`
   - **Type:** `command` (stdio)
   - **Command:** `tide-daemon mcp`

---

### C. Gemini CLI / Antigravity / Windsurf / Cline

Any tool supporting the standard Model Context Protocol over stdio can launch `tide-daemon mcp`.

#### 1. Windsurf (`~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "tide": {
      "command": "tide-daemon",
      "args": ["mcp"]
    }
  }
}
```

#### 2. Cline / Roo Code (`cline_mcp_settings.json`)
```json
{
  "mcpServers": {
    "tide": {
      "command": "tide-daemon",
      "args": ["mcp"],
      "disabled": false,
      "autoApprove": [
        "tide_search",
        "tide_get_note_outline",
        "tide_get_note_section",
        "tide_get_note_graph",
        "tide_list_todos",
        "tide_get_focused_blocks"
      ]
    }
  }
}
```

#### 3. Generic JSON-RPC Stdio Runner / Antigravity CLI
```json
{
  "name": "tide",
  "transport": "stdio",
  "command": "tide-daemon",
  "args": ["mcp", "--db-path", "~/.tide/local.db"],
  "environment": {
    "RUST_BACKTRACE": "1",
    "TIDE_LOG_LEVEL": "info"
  }
}
```

---

## 3. Available Tools & Schemas

The MCP server provides the following tools:

| Tool | Purpose | Primary Arguments | Token Cost |
| :--- | :--- | :--- | :--- |
| `tide_search` | Full-Text Search (FTS5) index | `query` (str), `limit` (int, default 5) | Minimal (~50-150 tokens) |
| `tide_get_note_outline` | Retrieve headings (`#`) and checklist structure | `note_id` (UUID) | Low (~100-300 tokens) |
| `tide_get_note_section` | Read contents under a specific heading | `note_id` (UUID), `heading` (str) | Targeted (~200-800 tokens) |
| `tide_get_block` | Fetch a single discrete block | `note_id` (UUID), `block_id` (str) | Very Low (~50-200 tokens) |
| `tide_get_focused_blocks` | Fetch blocks with user AI focus / reading markers | `note_id` (UUID) | Targeted (~100-400 tokens) |
| `tide_get_note` | Fetch entire note markdown | `note_id` (UUID) | High (entire file) |
| `tide_patch_block` | In-place atomic block update | `note_id` (UUID), `block_id` (str), `content` (str) | Surgical |
| `tide_list_todos` | List tasks, optionally filtered | `status` (`pending`, `completed`) | Low |
| `tide_patch_todo` | Update task completion status | `id` (UUID), `is_completed` (bool), `status` (str) | Minimal |
| `tide_get_note_graph` | Discover incoming and outgoing note links | `note_id` (UUID) | Low |

---

## 4. Agent Prompting & Best Practices

### Recommended System Prompt Snippet
To prevent agents from dumping huge notes into the conversation context, add this instruction snippet to your custom instructions or system prompt:

```markdown
### Tide Local Knowledge Integration Instructions
You have access to the user's private local notes and tasks via Tide MCP tools.
Always optimize for token efficiency and surgical modifications:

1. SEARCH FIRST:
   - Never guess note IDs. Use `tide_search(query=...)` to find relevant notes.
   - Inspect the returned note titles, IDs, and snippet matches.

2. EXPLORE STRUCTURE BEFORE FULL TEXT:
   - Do NOT immediately call `tide_get_note` unless the note is known to be short.
   - Call `tide_get_note_outline(note_id=...)` to inspect the table of contents and heading hierarchy.
   - If user attention markers exist, call `tide_get_focused_blocks(note_id=...)` to retrieve the active context.

3. READ SPECIFIC SECTIONS:
   - Call `tide_get_note_section(note_id=..., heading=...)` or `tide_get_block(note_id=..., block_id=...)` to retrieve only the paragraphs or blocks relevant to the user query.

4. SURGICAL UPDATES:
   - When modifying notes, prefer `tide_patch_block` using the specific `block_id` instead of rewriting entire notes.
   - Keep markdown formatting intact.
   - For task items, use `tide_patch_todo` to update statuses.
```

---

### Token Optimization Workflow

To conserve context window budget and maintain low latency, follow the **4-Tier Retrieval Pipeline**:

```
 ┌────────────────┐
 │ 1. Search      │  tide_search(query: "meeting notes rust")
 └───────┬────────┘  -> Returns note UUIDs & snippets (minimal tokens)
         ▼
 ┌────────────────┐
 │ 2. Outline     │  tide_get_note_outline(note_id: "...")
 └───────┬────────┘  -> Returns headings & block hierarchy
         ▼
 ┌────────────────┐
 │ 3. Read Slice  │  tide_get_note_section(note_id: "...", heading: "Action Items")
 └───────┬────────┘  -> Fetches only the necessary section
         ▼
 ┌────────────────┐
 │ 4. Patch Block │  tide_patch_block(note_id: "...", block_id: "...", content: "...")
 └────────────────┘  -> Updates discrete block in-place
```

---

## 5. Troubleshooting & Verification

### A. Manual Verification via CLI Pipe

You can test the MCP server handshake and tool registration directly from your terminal.

#### 1. Testing Protocol Handshake (`initialize`)
**Unix (bash / zsh):**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}' | tide-daemon mcp
```

**Windows (PowerShell):**
```powershell
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}' | tide-daemon.exe mcp
```

**Expected Response:**
```json
{"id":1,"jsonrpc":"2.0","result":{"capabilities":{"tools":{}},"protocolVersion":"2024-11-05","serverInfo":{"name":"tide-local-mcp","version":"0.1.0"}}}
```

#### 2. Testing Tool Discovery (`tools/list`)
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | tide-daemon mcp
```
The server will return the JSON array of available tools (`tide_search`, `tide_get_note_outline`, etc.).

---

### B. Common Pitfalls & Solutions

#### 1. "No saved session" or Empty Note Search Results
- **Cause:** `tide-daemon mcp` queries the decrypted local SQLite database (`~/.tide/local.db`). If you have not authenticated and synced your notes, the database will be empty or missing.
- **Solution:** Run the login and sync sequence first:
  ```bash
  # Interactive mode:
  tide-daemon
  # Choose [1] Login & Sync Notes (Email -> Code -> PIN)

  # Or sync directly with PIN:
  tide-daemon sync --pin <YOUR_VAULT_PIN>
  ```

#### 2. Path Expansion & Database Not Found
- On Windows, paths like `~/.tide/local.db` are resolved to `%USERPROFILE%\.tide\local.db`.
- When passing custom paths with spaces or unusual characters in configuration JSON files, ensure backslashes are escaped:
  ```json
  "args": ["mcp", "--db-path", "C:\\Users\\Alice\\AppData\\Local\\Tide\\local.db"]
  ```

#### 3. Windows CRLF Line Endings & Stream Parsers
- `tide-daemon mcp` expects newline-delimited JSON (`\n` or `\r\n`).
- If scripting or piping into `tide-daemon`, make sure each JSON-RPC request is a single continuous line. Multiline JSON strings sent without closing delimiters will wait for a newline before being parsed.

#### 4. Stdio Contamination
- If you build `tide-daemon` from source or run custom wrappers, never use `println!` for debug logging.
- Any non-JSON text emitted to `stdout` breaks the MCP JSON-RPC protocol parser in Claude Desktop and Cursor. Use `eprintln!` or `tracing::info!` directed to `stderr`.
