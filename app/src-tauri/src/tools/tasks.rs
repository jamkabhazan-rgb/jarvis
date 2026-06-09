//! Tasks / boards tool. Sprint 4 implements task_add / task_move / task_list
//! and board_add against the SQLite data model (§12).

/// The function definition the model sees (kept ≤ ~200 chars of description).
pub const TASK_ADD_SCHEMA: &str = r#"{
  "type": "function",
  "function": {
    "name": "task_add",
    "description": "Add a task. Call when the user asks to create/record a task.",
    "parameters": {
      "type": "object",
      "properties": {
        "title":  { "type": "string" },
        "board":  { "type": "string", "description": "board id, default 'main'" },
        "column": { "type": "string", "enum": ["backlog","today","progress","done"] },
        "due":    { "type": "string", "description": "YYYY-MM-DD, optional" }
      },
      "required": ["title"]
    }
  }
}"#;
