# The report

Write it in the request's language. Lead with the result, then what was checked and fixed, then what could not be
done. Use tables for numbers. Send the files with SendUserFile (the page with `display: attach`, the stills with
`render`).

## 中文模板

```markdown
**[机器名] 模拟器做好了**，[一句话：能做什么]。文件：`dist/<slug>-live.html`（[大小]，离线可用）[，视频 `<slug>-tour.mp4`]。

## 数据和来源
| 数值 | 来源 |
|---|---|
| … | 用户给的 / 资料（链接）/ 推算 / 估计 / 我的选择（原因） |

手算验证：…（一两行关键算式和结论）

## 检查了什么
1. 碰撞：[N] 对运动件，覆盖整个[输入范围]，全部通过
2. 连续性：每 0.01 秒采样 [N] 个量，没有跳变
3. 每个节拍一张静帧，逐张看完：[N] 张
4. 每个过渡每 0.2 秒一帧：[N] 帧
5. render(t) 纯函数：乱序重画逐字节一致
6. 网页：着色器预热后新编译 0 个；接管/25 秒回到导览/拖动/缩放/H/P 全部正常

## 发现并修好的问题
| 问题 | 修改前 | 修改 | 修改后 |
|---|---|---|---|

## 需要你知道的
- 估计值和我的选择：…
- 这个环境没有显卡：网页的实际帧率请在你的电脑上用 `?perf` 看
```

## English template

```markdown
**The [machine] simulator is done**: [one line]. File: `dist/<slug>-live.html` ([size], works offline)[, video `<slug>-tour.mp4`].

## Numbers and sources
| value | source |
|---|---|

Hand check: …

## What I checked
1. Clearance: [N] moving pairs over the whole [input range] — all clear
2. Continuity: [N] quantities every 0.01 s — no jumps
3. A still at every beat, read full size: [N]
4. Every transition at 0.2 s: [N] frames
5. render(t) is pure: out-of-order redraws byte-identical
6. Live page: 0 shaders compiled after warm-up; hand-off, 25 s return, orbit, zoom, H, P all pass

## What I found and fixed
| problem | before | fix | after |
|---|---|---|---|

## Worth knowing
- Estimates and choices: …
- No GPU here: check the real frame rate on your machine with `?perf`
```
