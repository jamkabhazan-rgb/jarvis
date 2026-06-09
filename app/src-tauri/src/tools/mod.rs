//! Tool / skill framework. Every capability is a function-calling tool with
//! a JSON schema. The core advertises tools to the model, the orchestrator
//! runs the calls, emits a `tool_call` event so the matching panel applies
//! the change, and feeds a human-readable result back to the model.
//!
//! State lives in the frontend panels (localStorage today, SQLite in core
//! later), so `execute` here only formats the result string — the actual
//! mutation is applied by the frontend on the `tool_call` event.
//! No shell execution in the base build (§13/§17).

use serde_json::{json, Value};

pub mod tasks;

/// The tool definitions advertised to the model (kept descriptions short).
pub fn definitions() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "task_add",
                "description": "Add a task to the kanban board. Use when the user asks to create/record a task or to-do.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title":  { "type": "string" },
                        "column": { "type": "string", "enum": ["backlog","today","progress","done"], "description": "default 'today'" }
                    },
                    "required": ["title"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "note_add",
                "description": "Create a note in the knowledge vault. Use when the user wants to save/remember information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "body":  { "type": "string" },
                        "tags":  { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["title"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "finance_add_expense",
                "description": "Record an expense. Use when the user mentions spending money.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount":   { "type": "number" },
                        "category": { "type": "string", "description": "e.g. food, home, transport, leisure, health, workshop" },
                        "label":    { "type": "string" }
                    },
                    "required": ["amount"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "research_query",
                "description": "Queue a web-research task that searches and summarizes a topic.",
                "parameters": {
                    "type": "object",
                    "properties": { "query": { "type": "string" } },
                    "required": ["query"]
                }
            }
        }
    ])
}

/// Build a short, human-readable result for the model. The frontend applies
/// the real state change when it receives the matching `tool_call` event.
pub fn execute(name: &str, args: &Value) -> String {
    match name {
        "task_add" => {
            let title = args["title"].as_str().unwrap_or("(untitled)");
            let col = args["column"].as_str().unwrap_or("today");
            format!("Added task \"{}\" to {}.", title, col)
        }
        "note_add" => {
            let title = args["title"].as_str().unwrap_or("(untitled)");
            format!("Saved note \"{}\" to the vault.", title)
        }
        "finance_add_expense" => {
            let amount = args["amount"].as_f64().unwrap_or(0.0);
            let cat = args["category"].as_str().unwrap_or("uncategorized");
            format!("Recorded a ${:.0} expense in {}.", amount, cat)
        }
        "research_query" => {
            let q = args["query"].as_str().unwrap_or("");
            format!("Queued research on \"{}\" — searching and summarizing.", q)
        }
        other => format!("Unknown tool: {}", other),
    }
}
