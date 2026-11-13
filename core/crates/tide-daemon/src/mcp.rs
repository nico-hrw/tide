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
                            },
                            {
                                "name": "tide_get_block",
                                "description": "Get specific block content by block_id within a note.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "note_id": { "type": "string", "description": "Note UUID" },
                                        "block_id": { "type": "string", "description": "Block identifier" }
                                    },
                                    "required": ["note_id", "block_id"]
                                }
                            },
                            {
                                "name": "tide_get_focused_blocks",
                                "description": "Get blocks marked with AI focus/reading marker within a note.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "note_id": { "type": "string", "description": "Note UUID" }
                                    },
                                    "required": ["note_id"]
                                }
                            },
                            {
                                "name": "tide_patch_block",
                                "description": "Update or replace a specific block's content by block_id.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "note_id": { "type": "string", "description": "Note UUID" },
                                        "block_id": { "type": "string", "description": "Block identifier" },
                                        "content": { "type": "string", "description": "Block content" }
                                    },
                                    "required": ["note_id", "block_id", "content"]
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
        "tide_get_block" => {
            let note_id = args.get("note_id").and_then(|n| n.as_str()).unwrap_or("");
            let block_id = args.get("block_id").and_then(|b| b.as_str()).unwrap_or("");
            if note_id.is_empty() || block_id.is_empty() {
                return "Missing required parameters: note_id and block_id".to_string();
            }
            match db.get_note_by_id(note_id) {
                Ok(Some(note)) => {
                    match find_block_by_id(&note.content_markdown, block_id) {
                        Some(block) => block.content,
                        None => format!("Block with ID '{}' not found in note.", block_id),
                    }
                }
                Ok(None) => format!("Note with ID {} not found.", note_id),
                Err(e) => format!("Error fetching note: {}", e),
            }
        }
        "tide_get_focused_blocks" => {
            let note_id = args.get("note_id").and_then(|n| n.as_str()).unwrap_or("");
            if note_id.is_empty() {
                return "Missing required parameter: note_id".to_string();
            }
            match db.get_note_by_id(note_id) {
                Ok(Some(note)) => {
                    let blocks = parse_blocks(&note.content_markdown);
                    let focused: Vec<Value> = blocks
                        .into_iter()
                        .filter(|b| b.is_focused)
                        .map(|b| {
                            json!({
                                "block_id": b.block_id,
                                "content": b.content
                            })
                        })
                        .collect();
                    if focused.is_empty() {
                        "No focused blocks found in note.".to_string()
                    } else {
                        serde_json::to_string_pretty(&focused).unwrap_or_else(|_| "[]".to_string())
                    }
                }
                Ok(None) => format!("Note with ID {} not found.", note_id),
                Err(e) => format!("Error fetching note: {}", e),
            }
        }
        "tide_patch_block" => {
            let note_id = args.get("note_id").and_then(|n| n.as_str()).unwrap_or("");
            let block_id = args.get("block_id").and_then(|b| b.as_str()).unwrap_or("");
            let new_content = match args.get("content").and_then(|c| c.as_str()) {
                Some(c) => c,
                None => {
                    return json!({
                        "success": false,
                        "error": "Missing required parameter: content"
                    }).to_string();
                }
            };

            if note_id.is_empty() || block_id.is_empty() {
                return json!({
                    "success": false,
                    "error": "Missing required parameters: note_id and block_id"
                }).to_string();
            }

            match db.get_note_by_id(note_id) {
                Ok(Some(mut note)) => {
                    let block = match find_block_by_id(&note.content_markdown, block_id) {
                        Some(b) => b,
                        None => {
                            return json!({
                                "success": false,
                                "error": format!("Block with ID '{}' not found in note '{}'", block_id, note_id)
                            }).to_string();
                        }
                    };

                    let replacement = if let (Some(open), Some(close)) = (&block.open_tag, &block.close_tag) {
                        if new_content.contains("data-block-id") || (new_content.starts_with('<') && new_content.ends_with('>')) {
                            new_content.to_string()
                        } else {
                            format!("{}{}{}", open, new_content, close)
                        }
                    } else if new_content.contains("<!--") && (new_content.contains("block_id") || new_content.contains("data-block-id")) {
                        new_content.to_string()
                    } else {
                        let mut rep = format!("<!-- block_id: {} -->", block_id);
                        if block.is_focused && !new_content.contains("ai-focus") {
                            rep.push_str("\n<!-- ai-focus -->");
                        }
                        rep.push('\n');
                        rep.push_str(new_content.trim());
                        rep
                    };

                    let mut updated_markdown = String::with_capacity(note.content_markdown.len() + replacement.len());
                    updated_markdown.push_str(&note.content_markdown[..block.full_start]);
                    updated_markdown.push_str(&replacement);
                    updated_markdown.push_str(&note.content_markdown[block.full_end..]);
                    note.content_markdown = updated_markdown;

                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(note.updated_at);
                    note.updated_at = now;
                    note.dirty = true;

                    match db.upsert_note(&note) {
                        Ok(_) => json!({
                            "success": true,
                            "note_id": note_id,
                            "block_id": block_id
                        }).to_string(),
                        Err(e) => json!({
                            "success": false,
                            "error": format!("Failed to save note: {}", e)
                        }).to_string(),
                    }
                }
                Ok(None) => json!({
                    "success": false,
                    "error": format!("Note with ID {} not found", note_id)
                }).to_string(),
                Err(e) => json!({
                    "success": false,
                    "error": format!("Error fetching note: {}", e)
                }).to_string(),
            }
        }
        _ => format!("Unknown tool: {}", name),
    }
}

#[derive(Debug, Clone)]
struct ParsedBlock {
    block_id: Option<String>,
    is_focused: bool,
    full_start: usize,
    full_end: usize,
    open_tag: Option<String>,
    close_tag: Option<String>,
    content: String,
}

fn parse_blocks(markdown: &str) -> Vec<ParsedBlock> {
    let mut blocks = Vec::new();
    let mut cursor = 0;
    let len = markdown.len();

    while cursor < len {
        let next_lt = match markdown[cursor..].find('<') {
            Some(idx) => cursor + idx,
            None => break,
        };

        if markdown[next_lt..].starts_with("<!--") {
            if let Some(end_rel) = markdown[next_lt..].find("-->") {
                let comment_end = next_lt + end_rel + 3;
                let comment_content = &markdown[next_lt + 4..next_lt + end_rel];
                let has_block_id = comment_content.contains("block_id:") || comment_content.contains("block_id=");
                let has_ai_focus = comment_content.contains("ai-focus");

                if has_block_id || has_ai_focus {
                    let line_start = markdown[..next_lt].rfind('\n').map(|i| i + 1).unwrap_or(0);
                    let prefix = markdown[line_start..next_lt].trim();

                    let mut block_id = None;
                    let mut is_focused = has_ai_focus;

                    if has_block_id {
                        let tag = if comment_content.contains("block_id:") { "block_id:" } else { "block_id=" };
                        if let Some(val) = comment_content.split(tag).nth(1) {
                            let clean_val = val.trim().trim_matches(|c| c == '"' || c == '\'');
                            let id_token = clean_val.split_whitespace().next().unwrap_or("").trim_matches(|c| c == '"' || c == '\'');
                            if !id_token.is_empty() {
                                block_id = Some(id_token.to_string());
                            }
                        }
                    }

                    if !prefix.is_empty() {
                        let line_end = markdown[comment_end..].find('\n').map(|i| comment_end + i).unwrap_or(len);
                        let content = prefix.to_string();
                        blocks.push(ParsedBlock {
                            block_id,
                            is_focused,
                            full_start: line_start,
                            full_end: line_end,
                            open_tag: None,
                            close_tag: None,
                            content,
                        });
                        cursor = line_end;
                        continue;
                    }

                    let mut content_search_start = comment_end;
                    loop {
                        let remaining = &markdown[content_search_start..];
                        let trimmed_rel = remaining.trim_start();
                        let whitespace_len = remaining.len() - trimmed_rel.len();
                        let next_token_pos = content_search_start + whitespace_len;

                        if next_token_pos < len && markdown[next_token_pos..].starts_with("<!--") {
                            if let Some(next_c_end) = markdown[next_token_pos..].find("-->") {
                                let c_content = &markdown[next_token_pos + 4..next_token_pos + next_c_end];
                                if c_content.contains("ai-focus") {
                                    is_focused = true;
                                    content_search_start = next_token_pos + next_c_end + 3;
                                    continue;
                                }
                                if c_content.contains("block_id:") || c_content.contains("block_id=") {
                                    if block_id.is_none() {
                                        let tag = if c_content.contains("block_id:") { "block_id:" } else { "block_id=" };
                                        if let Some(val) = c_content.split(tag).nth(1) {
                                            let clean_val = val.trim().trim_matches(|c| c == '"' || c == '\'');
                                            let id_token = clean_val.split_whitespace().next().unwrap_or("").trim_matches(|c| c == '"' || c == '\'');
                                            if !id_token.is_empty() {
                                                block_id = Some(id_token.to_string());
                                            }
                                        }
                                    }
                                    content_search_start = next_token_pos + next_c_end + 3;
                                    continue;
                                }
                            }
                        }
                        break;
                    }

                    let after_comments = &markdown[content_search_start..];
                    let content_start = if after_comments.starts_with("\r\n") {
                        content_search_start + 2
                    } else if after_comments.starts_with('\n') {
                        content_search_start + 1
                    } else {
                        content_search_start
                    };

                    let mut block_content_end = len;
                    let search_slice = &markdown[content_start..];
                    
                    let blank_line_idx = search_slice.find("\n\n").or_else(|| search_slice.find("\r\n\r\n"));
                    if let Some(idx) = blank_line_idx {
                        block_content_end = content_start + idx;
                    }

                    if let Some(next_comment_idx) = search_slice.find("<!--") {
                        let abs_next = content_start + next_comment_idx;
                        if abs_next < block_content_end {
                            if let Some(c_end) = markdown[abs_next..].find("-->") {
                                let c_text = &markdown[abs_next + 4..abs_next + c_end];
                                if c_text.contains("block_id") || c_text.contains("ai-focus") {
                                    block_content_end = abs_next;
                                }
                            }
                        }
                    }

                    let raw_content = &markdown[content_start..block_content_end];
                    let content = raw_content.trim().to_string();

                    blocks.push(ParsedBlock {
                        block_id,
                        is_focused,
                        full_start: line_start,
                        full_end: block_content_end,
                        open_tag: None,
                        close_tag: None,
                        content,
                    });

                    cursor = block_content_end;
                    continue;
                } else {
                    cursor = comment_end;
                    continue;
                }
            } else {
                cursor = next_lt + 4;
                continue;
            }
        } else {
            if let Some(tag_end_rel) = markdown[next_lt..].find('>') {
                let tag_str = &markdown[next_lt..next_lt + tag_end_rel + 1];
                let has_block_id = tag_str.contains("data-block-id");
                let has_ai_focus = tag_str.contains("data-ai-focus=\"true\"") || tag_str.contains("data-ai-focus='true'");

                if has_block_id || has_ai_focus {
                    let tag_inner = tag_str.trim_start_matches('<').trim_end_matches('>').trim();
                    let tag_name = tag_inner.split_whitespace().next().unwrap_or("").trim_end_matches('/');

                    let mut block_id = None;
                    if has_block_id {
                        if let Some(part) = tag_str.split("data-block-id=").nth(1) {
                            let quote_char = part.chars().next().unwrap_or('"');
                            if quote_char == '"' || quote_char == '\'' {
                                let val = part[1..].split(quote_char).next().unwrap_or("");
                                if !val.is_empty() {
                                    block_id = Some(val.to_string());
                                }
                            }
                        }
                    }

                    let is_focused = has_ai_focus;
                    let is_self_closing = tag_str.ends_with("/>");

                    if is_self_closing || tag_name.is_empty() {
                        blocks.push(ParsedBlock {
                            block_id,
                            is_focused,
                            full_start: next_lt,
                            full_end: next_lt + tag_end_rel + 1,
                            open_tag: Some(tag_str.to_string()),
                            close_tag: None,
                            content: tag_str.to_string(),
                        });
                        cursor = next_lt + tag_end_rel + 1;
                        continue;
                    } else {
                        let close_needle = format!("</{}>", tag_name);
                        let content_start = next_lt + tag_end_rel + 1;
                        if let Some(close_rel) = markdown[content_start..].find(&close_needle) {
                            let content_end = content_start + close_rel;
                            let full_end = content_end + close_needle.len();
                            let inner_content = &markdown[content_start..content_end];

                            blocks.push(ParsedBlock {
                                block_id,
                                is_focused,
                                full_start: next_lt,
                                full_end,
                                open_tag: Some(tag_str.to_string()),
                                close_tag: Some(close_needle),
                                content: inner_content.trim().to_string(),
                            });
                            cursor = full_end;
                            continue;
                        } else {
                            let line_end = markdown[next_lt..].find('\n').map(|i| next_lt + i).unwrap_or(len);
                            blocks.push(ParsedBlock {
                                block_id,
                                is_focused,
                                full_start: next_lt,
                                full_end: line_end,
                                open_tag: Some(tag_str.to_string()),
                                close_tag: None,
                                content: tag_str.to_string(),
                            });
                            cursor = line_end;
                            continue;
                        }
                    }
                } else {
                    cursor = next_lt + 1;
                    continue;
                }
            } else {
                cursor = next_lt + 1;
                continue;
            }
        }
    }

    blocks
}

fn find_block_by_id(markdown: &str, block_id: &str) -> Option<ParsedBlock> {
    let blocks = parse_blocks(markdown);
    if let Some(b) = blocks.into_iter().find(|b| b.block_id.as_deref() == Some(block_id)) {
        return Some(b);
    }

    let needle_data_attr = format!("data-block-id=\"{}\"", block_id);
    let needle_data_attr_sq = format!("data-block-id='{}'", block_id);
    let needle_comment = format!("block_id: {}", block_id);
    let needle_comment_no_space = format!("block_id:{}", block_id);

    let match_pos = markdown.find(&needle_data_attr)
        .or_else(|| markdown.find(&needle_data_attr_sq))
        .or_else(|| markdown.find(&needle_comment))
        .or_else(|| markdown.find(&needle_comment_no_space));

    if let Some(pos) = match_pos {
        let line_start = markdown[..pos].rfind('\n').map(|i| i + 1).unwrap_or(0);
        let search_start = markdown[pos..].find('\n').map(|i| pos + i + 1).unwrap_or(markdown.len());
        let end_pos = markdown[search_start..].find("\n\n")
            .map(|i| search_start + i)
            .unwrap_or(markdown.len());

        let raw = &markdown[line_start..end_pos];
        let content = if let Some(c_start) = raw.find("<!--") {
            if let Some(c_end) = raw[c_start..].find("-->") {
                let mut stripped = raw[..c_start].to_string();
                stripped.push_str(&raw[c_start + c_end + 3..]);
                stripped.trim().to_string()
            } else {
                raw.trim().to_string()
            }
        } else {
            raw.trim().to_string()
        };

        return Some(ParsedBlock {
            block_id: Some(block_id.to_string()),
            is_focused: raw.contains("ai-focus"),
            full_start: line_start,
            full_end: end_pos,
            open_tag: None,
            close_tag: None,
            content,
        });
    }

    None
}
