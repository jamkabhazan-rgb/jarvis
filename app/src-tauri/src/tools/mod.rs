//! Tool / skill framework. Every capability is a function-calling tool with
//! a JSON schema. The core routes calls, executes them, returns a
//! human-readable result, and emits a Tauri event so the panel re-renders.
//!
//! Sprint 4 wires the router and registers the first tools (tasks, goals,
//! reminders). No shell execution in the base build (§13/§17).

pub mod tasks;
