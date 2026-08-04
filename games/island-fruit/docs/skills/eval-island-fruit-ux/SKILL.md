---
name: eval-island-fruit-ux
description: >-
  Design-time UX review for the Island Fruit web game (games/island-fruit).
  Use when the user asks to review UI/interaction, usability, mobile layout,
  feedback, or whether a newbie can start in 30 seconds. Never add in-game
  evaluator UI. Output findings only.
---

# 岛上采果 · UI 交互评测（设计期）

## 范围

- **只评测** `games/island-fruit/` 的界面与操作
- **不要**往游戏里加评测入口、角色选择、说明 NPC
- **不要**在终局揭穿「其实在比喻投资」

## 何时使用

用户说类似：「用 UI 视角评一下」「交互走查」「好不好点」时启用。

## 必玩路径（保证可比）

1. 打开游戏，**不读完长文**，直接开一局（混合规矩）
2. 再开一局，走一遍「岛民传言」的听 / 不听
3. 终局点「同一天气 · 换策略」，确认能换策略重开

## 检查清单（每项 1–5 分）

| 项 | 问自己 |
|----|--------|
| 开玩 | 30 秒内能不能开始？字是不是太多？ |
| 反馈 | 点采摘后，天气/地块/背包/日志有没有马上变？ |
| 误触 | 出传言时，「下一步」有没有先禁用？ |
| 手机 | 小屏按钮好不好点？日志能不能滑？ |
| 节奏 | 12 天会不会太拖？传言会不会太烦？ |
| 看得清 | 数字、按钮对比度够不够？ |

## 一票否决（出现就写 FAIL）

- 点了没反应
- 终局回不去「同一天气再玩」
- 只有结果、看不到过程相关反馈

## 输出格式

```
UX 总分：x/30
结论：可上线微调 / 需改版 / 阻断
Top 3 问题：（步骤 + 现象）
可马上改：（预计 <1 小时）
不要改成：（避免说教、避免加评测 UI）
```

## 改代码规则

默认**只出报告**。只有用户明确说「按评测改」才动 `index.html` / `styles.css` / `game.js`。
