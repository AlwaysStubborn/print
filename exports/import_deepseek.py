#!/usr/bin/env python3
"""Import DeepSeek chat export (docx or json) into message-level Markdown rounds."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROUNDS_PER_PART = 95


def load_docx(path: Path) -> list[tuple[str, str]]:
    try:
        from docx import Document
    except ImportError as exc:
        raise SystemExit("Install python-docx: pip install python-docx") from exc

    doc = Document(str(path))
    messages: list[tuple[str, str]] = []
    role: str | None = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal role, buf
        if role and buf:
            messages.append((role, "\n".join(buf).strip()))
        role, buf = None, []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        if text in ("用户", "User", "提问") or text.startswith("用户：") or text.startswith("User:"):
            flush()
            role = "user"
            rest = re.sub(r"^(用户|User)[：:]\s*", "", text)
            buf = [rest] if rest else []
        elif text in ("助手", "Assistant", "DeepSeek", "回答") or text.startswith("助手：") or text.startswith("Assistant:"):
            flush()
            role = "assistant"
            rest = re.sub(r"^(助手|Assistant|DeepSeek)[：:]\s*", "", text)
            buf = [rest] if rest else []
        elif role:
            buf.append(text)
    flush()
    return messages


def load_json(path: Path) -> list[tuple[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    messages: list[tuple[str, str]] = []
    # Common export shapes
    items = data if isinstance(data, list) else data.get("messages") or data.get("conversations") or []
    for item in items:
        if not isinstance(item, dict):
            continue
        role_raw = (item.get("role") or item.get("sender") or "").lower()
        content = item.get("content") or item.get("text") or item.get("message") or ""
        if isinstance(content, list):
            content = "\n".join(
                c.get("text", "") if isinstance(c, dict) else str(c) for c in content
            )
        if role_raw in ("user", "human"):
            messages.append(("user", str(content).strip()))
        elif role_raw in ("assistant", "ai", "bot"):
            messages.append(("assistant", str(content).strip()))
    return messages


def render_round(n: int, role: str, content: str) -> str:
    label = "**用户**" if role == "user" else "**助手**"
    return f"## 第{n}轮\n\n{label}：\n\n{content}\n\n---\n"


def write_parts(messages: list[tuple[str, str]], out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    total = len(messages)
    parts: list[str] = []
    header = (
        "# 投资策略对话 · 完整记录（消息级 · 合并版）\n\n"
        f"> 共 {total} 轮（每条用户/助手消息各计 1 轮）。导出自 DeepSeek 原始文件。\n\n---\n\n"
    )
    body = "".join(render_round(i, role, text) for i, (role, text) in enumerate(messages, 1))

    full_path = out_dir / "investment-conversation-full.md"
    full_path.write_text(header + body, encoding="utf-8")

    part_files: list[tuple[int, int, Path]] = []
    for start in range(0, total, ROUNDS_PER_PART):
        end = min(start + ROUNDS_PER_PART, total)
        chunk = messages[start:end]
        part_no = start // ROUNDS_PER_PART + 1
        start_n, end_n = start + 1, end
        part_path = out_dir / f"investment-conversation-part-{part_no:02d}-rounds-{start_n}-{end_n}.md"
        part_header = (
            f"# 投资策略对话 · 第 {start_n}–{end_n} 轮\n\n"
            f"> 本分卷为完整记录的第 {part_no} 部分（消息级计数）。\n\n---\n\n"
        )
        part_body = "".join(
            render_round(start + i + 1, role, text) for i, (role, text) in enumerate(chunk)
        )
        part_path.write_text(part_header + part_body, encoding="utf-8")
        part_files.append((start_n, end_n, part_path))

    index_lines = [
        "# 投资策略对话 · 目录\n",
        f"\n> 共 **{total} 轮**（消息级：每条用户/助手消息各 1 轮）。\n",
        "\n## 分卷\n\n",
    ]
    for start_n, end_n, part_path in part_files:
        index_lines.append(
            f"- [{part_path.name}]({part_path.name}) — 第 {start_n}–{end_n} 轮\n"
        )
    index_lines.append(
        f"\n## 合并版\n\n- [investment-conversation-full.md](investment-conversation-full.md)\n"
    )
    (out_dir / "investment-conversation-index.md").write_text("".join(index_lines), encoding="utf-8")
    return total


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <deepseek-chat.docx|json>")

    src = Path(sys.argv[1])
    if not src.exists():
        raise SystemExit(f"File not found: {src}")

    suffix = src.suffix.lower()
    if suffix == ".docx":
        messages = load_docx(src)
    elif suffix == ".json":
        messages = load_json(src)
    else:
        raise SystemExit("Supported formats: .docx, .json")

    if not messages:
        raise SystemExit("No messages parsed. Check export format.")

    total = write_parts(messages, src.parent)
    print(f"Wrote {total} message-level rounds to {src.parent}/")


if __name__ == "__main__":
    main()
