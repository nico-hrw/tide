use anyhow::Result;
use serde_json::{json, Value};
use tide_core::Database;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub async fn run_mcp_server(db: Database) -> Result<()> {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();

    while let Some(line) = reader.next_line().await? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let req: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let method = match req.get("method").and_then(|m| m.as_str()) {
            Some(m) => m,
            None => continue,
        };

        let id = req.get("id").cloned();

        let response = match method {
            "initialize" => {
                Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "serverInfo": {
                            "name": "tide-local-mcp",
                            "version": "0.1.0"
                        },
                        "capabilities": {
                            "tools": {}
                        }
                    }
                }))
            }
            "notifications/initialized" => None,
            "ping" => {
                Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {}
                }))
            }
            "tools/list" => {
                Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "tools": [
                            {
                                "name": "tide_search",
                                "description": "Search local notes via full-text search (FTS5). Returns concise snippets.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "query": { "type": "string", "description": "Search keyword or query" },
                                        "limit": { "type": "integer", "description": "Max results (default: 5)" }
                                    },
                                    "required": ["query"]
                                }
                            },
                            {
                                "name": "tide_get_note_outline",
                                "description": "Get note structural outline (headings and checklists) to save tokens.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "note_id": { "type": "string", "description": "Note UUID" }
                                    },
                                    "required": ["note_id"]
                                }
                            },
                            {
                                "name": "tide_get_note_section",
                                "description": "Get specific section of a note under a heading.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "note_id": { "type": "string", "description": "Note UUID" },
                                        "heading": { "type": "string", "description": "Heading title" }
                                    },
                                    "required": ["note_id", "heading"]
                                }
                            },
                            {
                                "name": "tide_get_note_graph",
                                "description": "Get note outgoing links and incoming backlinks.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "note_id": { "type": "string", "description": "Note UUID" }
                                    },
                                    "required": ["note_id"]
                                }
                            },
                            {
                                "name": "tide_list_todos",
                                "description": "List todos with optional status filter.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "status": { "type": "string", "description": "Filter: pending, completed" }
                                    }
                                }
                            },
                            {
                                "name": "tide_patch_todo",
                                "description": "Update todo status atomically.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "id": { "type": "string", "description": "Todo UUID" },
                                        "is_completed": { "type": "boolean" },
                                        "status": { "type": "string" }
                                    },
                                    "required": ["id", "is_completed", "status"]
                                }
                            },
                            {
                                "name": "tide_get_note",
                                "description": "Get full markdown content of a note.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "note_id": { "type": "string", "description": "Note UUID" }
                                    },
                                    "required": ["note_id"]
                                }
                            }
                        ]
                    }
                }))
            }
            "tools/call" => {
                let params = req.get("params").cloned().unwrap_or(json!({}));
                let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));

                let content_text = handle_tool_call(&db, name, &args).await;

                Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": content_text
                            }
                        ]
                    }
                }))
            }
            _ => {
                Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32601,
                        "message": format!("Method not found: {}", method)
                    }
                }))
            }
        };

        if let Some(resp) = response {
            let out_str = serde_json::to_string(&resp)? + "\n";
            stdout.write_all(out_str.as_bytes()).await?;
            stdout.flush().await?;
        }
    }

    Ok(())
}

async fn handle_tool_call(db: &Database, name: &str, args: &Value) -> String {
    match name {
        "tide_search" => {
            let query = args.get("query").and_then(|q| q.as_str()).unwrap_or("");
            let limit = args.get("limit").and_then(|l| l.as_u64()).unwrap_or(5) as usize;
            match db.search_notes(query, limit) {
                Ok(snippets) => {
                    if snippets.is_empty() {
                        "No notes found matching query.".to_string()
                    } else {
                        snippets
                            .into_iter()
                            .map(|s| format!("ID: {} | Title: {}\nSnippet: {}\n---", s.id, s.title, s.snippet))
                            .collect::<Vec<_>>()
                            .join("\n")
                    }
                }
                Err(e) => format!("Error searching notes: {}", e),
            }
        }
        "tide_get_note_outline" => {
            let note_id = args.get("note_id").and_then(|n| n.as_str()).unwrap_or("");
            match db.get_note_by_id(note_id) {
                Ok(Some(note)) => {
                    let mut outline = Vec::new();
                    outline.push(format!("Note: {} (ID: {})", note.title, note.id));
                    outline.push("Headings & Checklist items:".to_string());
                    for line in note.content_markdown.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with('#') || trimmed.starts_with("- [ ]") || trimmed.starts_with("- [x]") {
                            outline.push(format!("  {}", trimmed));
                        }
                    }
                    outline.join("\n")
                }
                Ok(None) => format!("Note with ID {} not found.", note_id),
                Err(e) => format!("Error fetching note: {}", e),
            }
        }
        "tide_get_note_section" => {
            let note_id = args.get("note_id").and_then(|n| n.as_str()).unwrap_or("");
            let heading = args.get("heading").and_then(|h| h.as_str()).unwrap_or("");
            match db.get_note_by_id(note_id) {
                Ok(Some(note)) => {
                    let mut section_lines = Vec::new();
                    let mut capturing = false;
                    for line in note.content_markdown.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with('#') {
                            if trimmed.contains(heading) {
                                capturing = true;
                                section_lines.push(line);
                                continue;
                            } else if capturing {
                                break;
                            }
                        }
                        if capturing {
                            section_lines.push(line);
                        }
                    }
                    if section_lines.is_empty() {
                        format!("Heading '{}' not found in note.", heading)
                    } else {
                        section_lines.join("\n")
                    }
                }
                Ok(None) => format!("Note with ID {} not found.", note_id),
                Err(e) => format!("Error fetching note: {}", e),
            }
        }
        "tide_get_note_graph" => {
            let note_id = args.get("note_id").and_then(|n| n.as_str()).unwrap_or("");
            match db.get_note_links(note_id) {
                Ok(links) => {
                    if links.is_empty() {
                        "No links or backlinks recorded for this note.".to_string()
                    } else {
                        serde_json::to_string_pretty(&links).unwrap_or_else(|_| "[]".to_string())
                    }
                }
                Err(e) => format!("Error fetching note links: {}", e),
            }
        }
        "tide_list_todos" => {
            let status = args.get("status").and_then(|s| s.as_str());
            match db.list_todos(status) {
                Ok(todos) => {
                    if todos.is_empty() {
                        "No todos found.".to_string()
                    } else {
                        serde_json::to_string_pretty(&todos).unwrap_or_else(|_| "[]".to_string())
                    }
                }
                Err(e) => format!("Error listing todos: {}", e),
            }
        }
        "tide_patch_todo" => {
            let id = args.get("id").and_then(|i| i.as_str()).unwrap_or("");
            let is_completed = args.get("is_completed").and_then(|c| c.as_bool()).unwrap_or(false);
            let status = args.get("status").and_then(|s| s.as_str()).unwrap_or("pending");
            match db.patch_todo_status(id, is_completed, status) {
                Ok(_) => format!("Todo {} successfully updated to status '{}' (completed: {}).", id, status, is_completed),
                Err(e) => format!("Error patching todo: {}", e),
            }
        }
        "tide_get_note" => {
            let note_id = args.get("note_id").and_then(|n| n.as_str()).unwrap_or("");
            match db.get_note_by_id(note_id) {
                Ok(Some(note)) => {
                    format!("# {}\n\n{}", note.title, note.content_markdown)
                }
                Ok(None) => format!("Note with ID {} not found.", note_id),
                Err(e) => format!("Error fetching note: {}", e),
            }
        }
        _ => format!("Unknown tool: {}", name),
    }
}
