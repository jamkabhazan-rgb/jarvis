//! Dialog orchestrator: builds context, lets the LLM call tools, runs them,
//! and streams the final reply back to the UI via events.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const DEFAULT_PERSONA: &str = "You are J.A.R.V.I.S., a calm, dry-witted personal assistant. \
Be concise and proactive — prefer doing over asking.";

const TOOLS_NOTE: &str = "You can manage the user's tasks, boards, goals, habits, notes, \
expenses and research via the provided tools; call them when appropriate, then confirm in one \
short line. When the user shares something durable about themselves (preferences, names, \
recurring projects), call memory_save so you recall it next session. Keep everything local and \
private; never claim to have done something you cannot.";

const SYSTEM_NOTE: &str = "Computer control is enabled: computer_run lets you propose ONE shell \
command at a time; it executes only after the user approves it on screen, so phrase your reply as \
'awaiting your approval', never as already done.";

fn build_system(persona: &Value) -> String {
    let base = persona["prompt"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_PERSONA);
    let mut sys = format!("{}\n\n{}", base, TOOLS_NOTE);
    if let Some(name) = persona["name"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        sys.push_str(&format!("\n\nThe user's name is {name}."));
    }
    sys
}

/// Main assistant turn — events on the `chat_*` channel, all tools.
pub async fn handle_turn(app: AppHandle, text: String, _mode: String, state: Value, persona: Value, history: Value) {
    if let Err(e) = run(&app, text, &state, &persona, "chat", None, &history).await {
        let _ = app.emit("chat_token", format!("⚠ {}", e));
    }
    let _ = app.emit("chat_done", ());
}

/// Sub-agent turn — events on the `agent_*` channel, tools restricted to the
/// agent's capabilities (spec §11).
pub async fn handle_agent_turn(app: AppHandle, text: String, state: Value, persona: Value, caps: Vec<String>, history: Value) {
    let allow = caps_to_tools(&caps);
    if let Err(e) = run(&app, text, &state, &persona, "agent", Some(allow), &history).await {
        let _ = app.emit("agent_token", format!("⚠ {}", e));
    }
    let _ = app.emit("agent_done", ());
}

/// Map agent capability ids to the tool names they're allowed to call.
fn caps_to_tools(caps: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for c in caps {
        match c.as_str() {
            "tasks" => out.extend(["task_add","task_move","task_list","board_add"].map(String::from)),
            "finance" => out.extend(["finance_add_expense","finance_summary"].map(String::from)),
            "vault" | "notes" => out.extend(["note_add","vault_search"].map(String::from)),
            "web" => out.push("research_query".into()),
            // shell access for agents — still gated by the global toggle and
            // still requires per-command approval in the agent run view (§17)
            "system" | "computer" => out.push("computer_run".into()),
            _ => {}
        }
    }
    out.sort();
    out.dedup();
    out
}

fn filtered_defs(allow: &Option<Vec<String>>) -> Value {
    let defs = crate::tools::definitions();
    match allow {
        None => defs,
        Some(list) => {
            let arr = defs.as_array().cloned().unwrap_or_default();
            let kept: Vec<Value> = arr
                .into_iter()
                .filter(|d| d["function"]["name"].as_str().map(|n| list.iter().any(|a| a.as_str() == n)).unwrap_or(false))
                .collect();
            Value::Array(kept)
        }
    }
}

async fn run(
    app: &AppHandle,
    text: String,
    state: &Value,
    persona: &Value,
    prefix: &str,
    allow: Option<Vec<String>>,
    history: &Value,
) -> Result<(), String> {
    let token_event = format!("{prefix}_token");
    let tool_event = format!("{prefix}_tool_call");

    // Computer control is opt-in (Settings toggle, mirrored in the state
    // snapshot): when off, the model never even sees the computer_run tool.
    let sys_enabled = state["system"]["enabled"].as_bool().unwrap_or(false);
    let mut sys_prompt = build_system(persona);
    if sys_enabled {
        sys_prompt.push_str(&format!("\n\n{}", SYSTEM_NOTE));
    }
    // Long-term memory: durable facts the user (or memory_save) stored before.
    if let Some(mems) = state["memories"].as_array() {
        let lines: Vec<String> = mems
            .iter()
            .filter_map(|m| m.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| format!("- {s}"))
            .collect();
        if !lines.is_empty() {
            sys_prompt.push_str(&format!(
                "\n\nLong-term memory about the user (recall and use naturally; do not recite verbatim):\n{}",
                lines.join("\n")
            ));
        }
    }

    let mut messages: Vec<Value> = vec![json!({ "role": "system", "content": sys_prompt })];
    // Prior turns (already trimmed by the frontend) give the model memory.
    if let Some(turns) = history.as_array() {
        for t in turns {
            if let (Some(role), Some(content)) = (t["role"].as_str(), t["content"].as_str()) {
                if matches!(role, "user" | "assistant") && !content.is_empty() {
                    messages.push(json!({ "role": role, "content": content }));
                }
            }
        }
    }
    messages.push(json!({ "role": "user", "content": text }));

    let mut defs = filtered_defs(&allow);
    if !sys_enabled {
        if let Some(arr) = defs.as_array_mut() {
            arr.retain(|d| d["function"]["name"].as_str() != Some("computer_run"));
        }
    }
    let tools_arg = if defs.as_array().map(|a| a.is_empty()).unwrap_or(true) { None } else { Some(defs) };

    // Round 1: let the model decide whether to call tools.
    let msg = crate::openai::chat::complete(app, Value::Array(messages.clone()), tools_arg).await?;

    if let Some(tool_calls) = msg["tool_calls"].as_array() {
        if !tool_calls.is_empty() {
            messages.push(msg.clone()); // assistant message with tool_calls

            for tc in tool_calls {
                let name = tc["function"]["name"].as_str().unwrap_or("").to_string();
                let args: Value = tc["function"]["arguments"]
                    .as_str()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_else(|| json!({}));

                // Mutating tools: tell the UI to apply the change.
                if crate::tools::is_mutating(&name) {
                    let _ = app.emit(&tool_event, json!({ "name": name, "args": args }));
                }

                let result = crate::tools::execute(&name, &args, state);
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result
                }));
            }

            // Round 2: stream the spoken confirmation / answer.
            return crate::openai::chat::stream_chat(app, Value::Array(messages), &token_event).await;
        }
    }

    // No tools — emit the content we already have.
    if let Some(content) = msg["content"].as_str() {
        if !content.is_empty() {
            let _ = app.emit(&token_event, content);
        }
    }
    Ok(())
}
