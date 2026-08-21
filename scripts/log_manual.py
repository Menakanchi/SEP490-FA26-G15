#!/usr/bin/env python3
"""
Manual AI usage logger — for team members using ANY AI tool.
Use this when your AI tool does NOT have automatic hook integration.

Usage (interactive):
  python scripts/log_manual.py

Usage (one-line):
  python scripts/log_manual.py --tool "chatgpt" --prompt "Asked ChatGPT to explain transformer architecture" --model "gpt-5.4"

Examples:
  # Tiến logs a ChatGPT session
  python scripts/log_manual.py --tool chatgpt --prompt "Brainstorm UI layout for /ai page"

  # Hoàng logs a Gemini web session
  python scripts/log_manual.py --tool gemini-web --prompt "Research risk scoring algorithms"

  # Quick interactive mode
  python scripts/log_manual.py
"""
import os
import sys
import argparse

from ai_log_common import append_entry, entry_id, git_identity, now_iso


def interactive_mode():
    """Prompt user for log info interactively."""
    print("\n📝 Manual AI Log Entry")
    print("=" * 40)

    tool = input("Tool name (e.g. chatgpt, gemini-web, copilot, other): ").strip()
    if not tool:
        tool = "unknown"

    model = input("Model (e.g. gpt-5.4, gemini-3-pro, skip to use tool name): ").strip()
    if not model:
        model = tool

    prompt = input("What did you ask/do? (brief summary): ").strip()
    if not prompt:
        print("[log] ❌ Prompt cannot be empty.", file=sys.stderr)
        sys.exit(1)

    result = input("Result/outcome (optional, press Enter to skip): ").strip()

    return tool, model, prompt, result


def main():
    parser = argparse.ArgumentParser(description="Manual AI usage logger")
    parser.add_argument("--tool", help="AI tool name (e.g. chatgpt, gemini-web)")
    parser.add_argument("--prompt", help="What you asked/did")
    parser.add_argument("--model", help="Model used (optional)")
    parser.add_argument("--result", help="Outcome/result (optional)", default="")
    args = parser.parse_args()

    if args.tool and args.prompt:
        tool = args.tool
        model = args.model or args.tool
        prompt = args.prompt
        result = args.result
    else:
        tool, model, prompt, result = interactive_mode()

    identity = git_identity()
    if not identity["student"]:
        identity["student"] = os.environ.get("USERNAME", os.environ.get("USER", "unknown"))
        print(f"[log] ⚠️  git email not set! Using fallback: {identity['student']}", file=sys.stderr)
        print('[log] Run: git config user.email "your@vinuni.edu.vn"', file=sys.stderr)

    entry = {
        "ts": now_iso(),
        "tool": tool,
        "event": "ManualLog",
        "entry_id": entry_id("manual"),
        "model": model,
        **identity,
        "prompt": prompt[:1000],
        "response_summary": result[:500] if result else "",
    }

    log_file = append_entry(entry)

    print(f"\n[log] ✅ Logged: [{tool}] {prompt[:80]}")
    print(f"[log] 📁 Saved to: {log_file}")


if __name__ == "__main__":
    main()
