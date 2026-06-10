//! Tool / skill framework. Every capability is a function-calling tool with
//! a JSON schema. The core advertises tools to the model, the orchestrator
//! runs the calls, emits a `tool_call` event for *mutating* tools so the
//! matching panel applies the change, and feeds a human-readable result back
//! to the model. *Read* tools answer from the per-turn `state` snapshot the
//! frontend passes in (panels own the data; SQLite-in-core comes later).
//!
//! Computer control (§17): the `computer_run` tool is advertised only when
//! the user has enabled it in Settings, and it never executes anything —
//! it proposes a command; the frontend shows a confirmation card and only
//! an explicit user click triggers the separate `system_execute` command.

use serde_json::{json, Value};

/// The tool definitions advertised to the model (descriptions kept short).
pub fn definitions() -> Value {
    json!([
        { "type":"function", "function": {
            "name":"task_add",
            "description":"Add a task to the kanban board. Use when the user wants to create/record a task or to-do.",
            "parameters":{"type":"object","properties":{
                "title":{"type":"string"},
                "column":{"type":"string","enum":["backlog","today","progress","done"],"description":"default 'today'"}
            },"required":["title"]}
        }},
        { "type":"function", "function": {
            "name":"task_move",
            "description":"Move an existing task to another column. Match the task by (part of) its title.",
            "parameters":{"type":"object","properties":{
                "title":{"type":"string","description":"task title or a distinctive part of it"},
                "column":{"type":"string","enum":["backlog","today","progress","done"]}
            },"required":["title","column"]}
        }},
        { "type":"function", "function": {
            "name":"task_list",
            "description":"List the user's tasks, optionally for a board. Use to answer what's on the board / due / in a column.",
            "parameters":{"type":"object","properties":{
                "board":{"type":"string","description":"board id or name, optional"}
            }}
        }},
        { "type":"function", "function": {
            "name":"board_add",
            "description":"Create a new task board.",
            "parameters":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}
        }},
        { "type":"function", "function": {
            "name":"goal_set",
            "description":"Set or update a goal's progress percentage. Match the goal by (part of) its title.",
            "parameters":{"type":"object","properties":{
                "title":{"type":"string"},
                "percent":{"type":"number","description":"0-100"}
            },"required":["title","percent"]}
        }},
        { "type":"function", "function": {
            "name":"habit_log",
            "description":"Mark today's habit as done or not done. Match the habit by (part of) its name.",
            "parameters":{"type":"object","properties":{
                "habit":{"type":"string"},
                "done":{"type":"boolean","description":"default true"}
            },"required":["habit"]}
        }},
        { "type":"function", "function": {
            "name":"note_add",
            "description":"Create a note in the knowledge vault. Use when the user wants to save/remember information.",
            "parameters":{"type":"object","properties":{
                "title":{"type":"string"},
                "body":{"type":"string"},
                "tags":{"type":"array","items":{"type":"string"}}
            },"required":["title"]}
        }},
        { "type":"function", "function": {
            "name":"vault_search",
            "description":"Search the knowledge vault by keyword. Use to recall what the user has noted.",
            "parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}
        }},
        { "type":"function", "function": {
            "name":"finance_add_expense",
            "description":"Record an expense. Use when the user mentions spending money.",
            "parameters":{"type":"object","properties":{
                "amount":{"type":"number"},
                "category":{"type":"string","description":"e.g. food, home, transport, leisure, health, workshop"},
                "label":{"type":"string"}
            },"required":["amount"]}
        }},
        { "type":"function", "function": {
            "name":"finance_summary",
            "description":"Summarize balances and this month's budget (spent/left, safe-to-spend).",
            "parameters":{"type":"object","properties":{}}
        }},
        { "type":"function", "function": {
            "name":"research_query",
            "description":"Queue a web-research task that searches and summarizes a topic.",
            "parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}
        }},
        { "type":"function", "function": {
            "name":"memory_save",
            "description":"Save a durable fact, preference or detail about the user to long-term memory so you remember it in future sessions. Use when the user shares something worth remembering (name, preferences, recurring projects, important people, how they like things done).",
            "parameters":{"type":"object","properties":{
                "fact":{"type":"string","description":"a concise, self-contained fact to remember, e.g. 'Prefers metric units' or 'Daughter is named Mia'"}
            },"required":["fact"]}
        }},
        { "type":"function", "function": {
            "name":"memory_forget",
            "description":"Remove a remembered fact from long-term memory. Match it by (part of) its text.",
            "parameters":{"type":"object","properties":{
                "query":{"type":"string","description":"text (or part) of the memory to forget"}
            },"required":["query"]}
        }},
        { "type":"function", "function": {
            "name":"computer_run",
            "description":"Propose ONE shell command to run on the user's computer (macOS: sh, Windows: cmd). It does NOT run immediately — the user sees the exact command and must approve it first. Use for opening apps/files/folders, finding files, or system info. Prefer simple, non-destructive commands.",
            "parameters":{"type":"object","properties":{
                "command":{"type":"string","description":"the exact shell command"},
                "why":{"type":"string","description":"one short line shown to the user explaining what it does"}
            },"required":["command"]}
        }}
    ])
}

/// Mutating tools emit a `tool_call` event so the panel applies the change.
/// Read tools just return data computed from the snapshot.
pub fn is_mutating(name: &str) -> bool {
    matches!(
        name,
        "task_add" | "task_move" | "board_add" | "goal_set" | "habit_log"
            | "note_add" | "finance_add_expense" | "research_query" | "computer_run"
            | "memory_save" | "memory_forget"
    )
}

/// Run a tool: mutating tools return a confirmation string (the frontend does
/// the actual change on the event); read tools answer from `state`.
pub fn execute(name: &str, args: &Value, state: &Value) -> String {
    match name {
        // ----- mutating: confirmations -----
        "task_add" => format!(
            "Added task \"{}\" to {}.",
            args["title"].as_str().unwrap_or("(untitled)"),
            args["column"].as_str().unwrap_or("today")
        ),
        "task_move" => format!(
            "Moved \"{}\" to {}.",
            args["title"].as_str().unwrap_or(""),
            args["column"].as_str().unwrap_or("")
        ),
        "board_add" => format!("Created board \"{}\".", args["name"].as_str().unwrap_or("")),
        "goal_set" => format!(
            "Set \"{}\" to {}%.",
            args["title"].as_str().unwrap_or(""),
            args["percent"].as_f64().unwrap_or(0.0).round()
        ),
        "habit_log" => format!(
            "Marked \"{}\" {}.",
            args["habit"].as_str().unwrap_or(""),
            if args["done"].as_bool().unwrap_or(true) { "done" } else { "not done" }
        ),
        "note_add" => format!("Saved note \"{}\" to the vault.", args["title"].as_str().unwrap_or("(untitled)")),
        "finance_add_expense" => format!(
            "Recorded a ${:.0} expense in {}.",
            args["amount"].as_f64().unwrap_or(0.0),
            args["category"].as_str().unwrap_or("uncategorized")
        ),
        "research_query" => format!(
            "Queued research on \"{}\" — searching and summarizing.",
            args["query"].as_str().unwrap_or("")
        ),
        "computer_run" => format!(
            "Proposed `{}` to the user — it runs only after they approve it on the confirmation card; the output will appear there. Tell the user it's awaiting their approval.",
            args["command"].as_str().unwrap_or("")
        ),
        "memory_save" => format!(
            "Saved to long-term memory: \"{}\".",
            args["fact"].as_str().unwrap_or("")
        ),
        "memory_forget" => format!(
            "Forgot memory matching \"{}\".",
            args["query"].as_str().unwrap_or("")
        ),

        // ----- read: answer from the snapshot -----
        "task_list" => task_list(args, state),
        "vault_search" => vault_search(args, state),
        "finance_summary" => finance_summary(state),

        other => format!("Unknown tool: {}", other),
    }
}

fn task_list(args: &Value, state: &Value) -> String {
    let boards = state["tasks"]["boards"].as_array();
    let Some(boards) = boards else { return "No tasks available.".into() };
    let want = args["board"].as_str().map(|s| s.to_lowercase());
    let mut out = String::new();
    for b in boards {
        let name = b["name"].as_str().unwrap_or("");
        let id = b["id"].as_str().unwrap_or("");
        if let Some(w) = &want {
            if !name.to_lowercase().contains(w) && !id.to_lowercase().contains(w) {
                continue;
            }
        }
        out.push_str(&format!("Board {}:\n", name));
        for col in ["today", "progress", "backlog", "done"] {
            let items: Vec<&str> = b["tasks"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter(|t| t["col"].as_str() == Some(col))
                        .filter_map(|t| t["text"].as_str())
                        .collect()
                })
                .unwrap_or_default();
            if !items.is_empty() {
                out.push_str(&format!("  {}: {}\n", col, items.join("; ")));
            }
        }
    }
    if out.is_empty() { "No tasks found.".into() } else { out }
}

fn vault_search(args: &Value, state: &Value) -> String {
    let q = args["query"].as_str().unwrap_or("").to_lowercase();
    let Some(notes) = state["vault"].as_array() else { return "Vault is empty.".into() };
    let hits: Vec<String> = notes
        .iter()
        .filter(|n| {
            let title = n["title"].as_str().unwrap_or("").to_lowercase();
            let tags = n["tags"].as_array().map(|a| {
                a.iter().filter_map(|t| t.as_str()).collect::<Vec<_>>().join(" ").to_lowercase()
            }).unwrap_or_default();
            q.is_empty() || title.contains(&q) || tags.contains(&q)
        })
        .filter_map(|n| n["title"].as_str().map(|s| s.to_string()))
        .collect();
    if hits.is_empty() {
        format!("No notes match \"{}\".", q)
    } else {
        format!("Found {} note(s): {}", hits.len(), hits.join("; "))
    }
}

fn finance_summary(state: &Value) -> String {
    let accounts = state["finance"]["accounts"].as_array();
    let cats = state["finance"]["cats"].as_array();
    let total: f64 = accounts
        .map(|a| a.iter().filter_map(|x| x["balance"].as_f64()).sum::<f64>())
        .unwrap_or(0.0);
    let (budget, spent): (f64, f64) = cats
        .map(|c| {
            c.iter().fold((0.0, 0.0), |(b, s), x| {
                (b + x["budget"].as_f64().unwrap_or(0.0), s + x["spent"].as_f64().unwrap_or(0.0))
            })
        })
        .unwrap_or((0.0, 0.0));
    let left = budget - spent;
    format!(
        "Total balance ${:.0}. This month: spent ${:.0} of ${:.0} ({} left). Safe to spend today ≈ ${:.0}.",
        total, spent, budget, format_money(left), (left / 14.0).max(0.0)
    )
}

fn format_money(v: f64) -> String {
    if v < 0.0 { format!("-${:.0}", -v) } else { format!("${:.0}", v) }
}
