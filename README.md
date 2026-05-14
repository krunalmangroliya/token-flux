<div align="center">
  <h1>🌌 Token-Flux</h1>
  <p><b>The ultimate token-saving and quality-boosting toolkit for AI coding agents.</b></p>
  <p><i>Created by <a href="https://www.raininfotech.com/"><b>Rain Infotech</b></a></i></p>
  <p>
    <img src="https://img.shields.io/npm/v/token-flux" alt="NPM Version" />
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="Node Version" />
  </p>
</div>

---

## ⚠️ The Problem

AI coding agents are incredible, but they come with two massive trade-offs depending on the model you use:

- **Strong Models (e.g., Claude Opus-4.7 & Sonnet-4.6, GPT-5.5)**: They are brilliant but **expensive**. Agents tend to consume massive amounts of tokens reading irrelevant files, parsing verbose terminal outputs (like `npm test`), and using wordy prompts.
- **Weaker/Cheaper/Local Models**: They are cost-effective but often **hallucinate**, forget past mistakes, skip tests, and fail to understand the broader project architecture.

## 💡 The Solution

**Token-Flux** is an adaptive toolkit that sits between your code and your AI agent. It acts as a smart filter and a coach, ensuring you get the best of both worlds:

- 📉 **Spend fewer tokens** when using expensive models.
- 📈 **Get better coding results** when using lower-cost or local models.

### ✨ Core Features

- **🗺️ The Code Map**: Generates a compact `CODEMAP.md`. It feeds the agent ground truth (function signatures, imports, blast radius) *before* it blindly reads source code.
- **🧠 The Lessons Layer**: An append-only memory (`LESSONS.md`) of past mistakes. It ensures your agent never makes the same error twice.
- **🛡️ Strict Enforcement**: Weak models respect exit codes. We enforce strict verifications (`verify.sh`) before a task is considered "done".
- **✂️ Minimal Context & CLI Proxy**: Delivers *only* the exact files needed. Wraps noisy commands (like `npm test` or `git log`) to preserve only the critical errors and stack traces, saving millions of tokens over time.
- **🔌 Agent Agnostic**: Works seamlessly with your favorite tools: Cursor, Claude Code, Cline, Aider, VS Code, OpenCode, and more.

---

## 🛠️ Installation & Setup

You can install `token-flux` globally via npm:

```bash
npm install -g token-flux
```

Alternatively, run it instantly using `npx`:

```bash
npx token-flux init
```

### Initialize in your Repository

Navigate to your project's root directory and run:

```bash
token-flux init
# Or for a non-interactive setup: token-flux init --yes
```

*This will generate repository-local instructions and support files (e.g., `.agent-boost/`, `AGENT.md`, `CLAUDE.md`) tailored to your selected adapters.*

---

## ⚙️ Choose Your Mode

Token-Flux offers three intelligent operating modes. Set them depending on your current needs:

### 1. 🟢 Saver Mode
**Best for:** Strong or expensive models.
- **Focus:** Radical token reduction while preserving correctness.
- **Features:** Prompt compression, CLI proxy, context router, MCP setup.
```bash
token-flux mode set saver
```

### 2. 🚀 Boost Mode
**Best for:** Weaker, cheaper, or local models.
- **Focus:** Maximum quality and structural understanding.
- **Features:** Expert prompt enhancements, production gates, retry prompts, codemap, verifier.
```bash
token-flux mode set boost
```

### 3. ⚖️ Both (Default)
**Best for:** Most users.
- **Focus:** The perfect balance of cost-saving and quality rails. Adaptive behavior.
```bash
token-flux mode set both
```

---

## 🔄 Recommended Workflow

Here is how to effectively use Token-Flux in your daily development:

1. **Get Context Before Coding**:
   ```bash
   token-flux context "fix login session timeout bug"
   ```
   *Open only the files suggested by the context router.*

2. **Check Token Budget**:
   ```bash
   token-flux budget src/auth/session.ts src/auth/session.test.ts
   ```

3. **Tame Noisy Commands**:
   Wrap terminal commands to hide redundant logs and extract only the errors.
   ```bash
   token-flux proxy "npm test"
   token-flux proxy "git diff"
   ```

4. **Verify Work**:
   ```bash
   token-flux verify
   ```

5. **Track Your Savings**:
   ```bash
   token-flux token-status
   ```

---

## 🎛️ Advanced Usage

<details>
<summary><b>Minimal Context Router</b></summary>

Fetch a small, focused task packet:
```bash
token-flux context "review auth changes" --detail minimal
```
</details>

<details>
<summary><b>Prompt Compression</b></summary>

Compress long prompts while keeping critical code details:
```bash
token-flux compress --level ultra "Please help me fix this very long issue..."
```
*Levels available: `light`, `full`, `ultra`.*
</details>

<details>
<summary><b>Project Scanning</b></summary>

Refresh the intelligence files after a big refactor:
```bash
token-flux scan
```
</details>

---

## 🔌 MCP Integration Guide

For agents that support the **Model Context Protocol (MCP)**, Token-Flux provides a seamless local server.

**1. Install the MCP Server**
This updates your `.mcp.json` with the local `token-flux` server:
```bash
token-flux mcp install
```

*(Alternatively, you can start the server manually via `token-flux mcp serve`)*

**2. Available MCP Tools**
Once connected, your agent gains access to these powerful tools:
- 📦 `get_minimal_context`: Works like the CLI router to fetch the exact files needed.
- 💰 `check_budget`: Estimates token cost *before* the agent reads large files.
- 🗜️ `compress_prompt`: Compresses long prompts while preserving essential code blocks.

**3. Recommended Agent Rule**
Add this to your agent's system prompt for the best results:
> *Call `get_minimal_context` first. Use `detailLevel="minimal"` until the task risk requires more context.*

---

## 🤖 What to Tell Your Agent

To get the most out of Token-Flux, paste these rules into your agent's system prompt or custom instructions:

> 1. Run `token-flux context "<task>"` before doing broad source reads.
> 2. Always read `.agent-boost/cerebrum.md` to avoid past mistakes.
> 3. Open only the exact source files needed for correctness.
> 4. Use `token-flux proxy "<command>"` for noisy commands like tests or git logs.
> 5. Never omit routes, API contracts, auth checks, tests, file paths, or identifiers.
> 6. Run `token-flux verify` before calling a task complete.

---

## 🧹 Cleanup

To remove token-flux files from a repository:
```bash
token-flux uninstall
```

To completely uninstall the global package:
```bash
npm uninstall -g token-flux
```

---

<div align="center">
  <i>Built with ❤️ by <a href="https://www.raininfotech.com/"><b>Rain Infotech</b></a> to make AI coding agents smarter, faster, and cheaper.</i>
</div>
