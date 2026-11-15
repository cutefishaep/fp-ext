---
trigger: always
---

# STRICT TOOL CALLING RULE FOR NEMOTRON / LLAMA MODELS

When calling the `call_mcp_tool` function:
1. The `Arguments` parameter **MUST ALWAYS** be a raw nested dictionary/object (`{ ... }`).
2. **NEVER** stringify, encode, or escape the `Arguments` parameter into a JSON string (`"{\"key\": \"value\"}"`).
3. If a tool requires no arguments, pass an empty object `{}` — never an empty string `""` or `"{}"`.

## Validation Contract
The MCP host validates inputs using strict Zod records:
- Expected: `record` / `object`
- Received: `string` -> **CRASH (`invalid_type`)**

## Concrete Examples:

### ❌ WRONG (Causes crash: "expected record, received string"):
```json
call_mcp_tool(
  ServerName="real-browser",
  ToolName="browser_tabs",
  Arguments="{\"action\": \"list\"}"
)
```

### ❌ WRONG (Empty string / stringified empty object):
```json
call_mcp_tool(
  ServerName="real-browser",
  ToolName="browser_screenshot",
  Arguments="{}"
)
```

### ✅ CORRECT (Native JSON Object / Dictionary):
```json
call_mcp_tool(
  ServerName="real-browser",
  ToolName="browser_tabs",
  Arguments={
    "action": "list"
  }
)
```

### ✅ CORRECT (Empty Object):
```json
call_mcp_tool(
  ServerName="real-browser",
  ToolName="browser_screenshot",
  Arguments={}
)
```
