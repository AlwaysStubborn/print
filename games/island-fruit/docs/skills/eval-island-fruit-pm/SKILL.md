---
name: eval-island-fruit-pm
description: >-
  Design-time product review for Island Fruit. Use when checking job-to-be-done,
  success metrics, scope, and anti-gambling patterns. Skills live in-repo only.
  Never ship evaluator UI inside the game. Do not require revealing the
  investment metaphor to players.
---

# 岛上采果 · 产品经理评测（设计期）

## 范围

- 评「这游戏到底干什么、有没有走偏」
- Skills 在仓库 `games/island-fruit/docs/skills/`，**不做进游戏**
- 终局**不必**解释投资隐喻

## 一句话目标（用来卡需求）

> 用几分钟，安全地体验：管不住天气时，规矩保护的是下限，不是每一局的面子。

新功能先问：是在加强这句话，还是在引诱人赌运气？

## 看什么算成功

优先看：

1. 玩完后，人能不能接受「选对也可能难看」
2. 会不会主动用「同一天气、换采法」再开一局对比
3. 过程相关反馈在不在（别只剩果子数量）

不要把「单局果子最高」当成功。

## 反模式检查（像不像小赌场）

| 检查 | 应该 |
|------|------|
| 差一点点就中的勾人特效 | 不要 |
| 排行榜攀比 | 不要 |
| 充值/开箱重置 | 不要 |
| 单局定生死的话术 | 弱化，引导再开对比 |
| 惩罚「不玩了」 | 不要 |

有一项「做成了」→ 产品方向 FAIL。

## 范围边界

**可以做：** 调数值、改文案、加强日志/种子对比、传言节奏  

**别做：** 接入真行情、社交排行、复杂养成、游戏内评测角色

## 必看材料

- `games/island-fruit/` 当前可玩版本
- `docs/eval-skills-brainstorm.md`（讨论结论）

## 输出格式

```
产品结论：方向对 / 有走偏 / 阻断
是否服务那句目标：是/否（原因）
反模式：通过 / 未通过（哪条）
P0 / P1 / P2 建议：
明确不做：
```

## 改代码规则

默认只出报告。用户明确要求落地再改；落地时仍不把本 skill 做成游戏功能。
