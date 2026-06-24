# 对话导出

**相关资源**：按主题整理的结构化笔记见 [`../investment-notes/`](../investment-notes/) 目录。

## 轮次说明（重要）

DeepSeek 原始对话界面显示 **378 轮**（通常按每条用户/助手消息各计 1 轮）。  
当前 Markdown 仅为 **176 个问答对**（约 352 条消息），且助手回答有压缩，**不完整**。  
详见 [`COUNTING.md`](COUNTING.md)。

## 投资策略长对话（Markdown · 当前压缩版）

**目录入口**：[`investment-conversation-index.md`](investment-conversation-index.md)

| 文件 | 轮次 |
|------|------|
| `investment-conversation-part-01-rounds-1-44.md` | 第 1–44 轮 |
| `investment-conversation-part-02-rounds-45-88.md` | 第 45–88 轮 |
| `investment-conversation-part-03-rounds-89-132.md` | 第 89–132 轮 |
| `investment-conversation-part-04-rounds-133-178.md` | 第 133–178 轮（含附录速查表） |
| `investment-conversation-full.md` | 第 1–178 轮合并版 |

每轮格式：`## 第N轮` → **用户提问** / **助手回答**。

## 从 DeepSeek 原始文件重建 378 轮

1. 将完整对话导出为 `exports/deepseek-chat.docx` 或 `.json`
2. 运行：`python3 exports/import_deepseek.py exports/deepseek-chat.docx`
3. 脚本按 **消息级** 重新编号并覆盖分卷文件
