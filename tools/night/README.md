# 6kpro 夜间任务

6kpro（中国 AI）的空闲时间是**北京时间 20:00 到次日 10:00**，也就是日本时间 21:00 到次日 11:00。这 14 个小时由我们用（用户 2026-10-22 决定）。

- Windows 的任务计划程序每天 **21:00（日本时间）** 启动 `run-night.ps1`，按顺序执行 `jobs.txt` 里的任务。
- 每个任务自己会检查时间（`--window 20-10`，按北京时间算）。过了北京时间 10:00 就停下来，不算失败。第二天晚上从上次停的地方接着做，已经做完的商品跳过。
- 6kpro 在这段时间内掉线的话，任务会等它恢复。
- 跑完后，进度和一览图（`docs/amazon-visual/all-status.md`、`docs/amazon-visual/all/`）会自动推送。日志在 `tools/night/logs/`，不进 git。

## 注册方法（在 Windows 上做一次）

在管理员 PowerShell 里执行：

```powershell
schtasks /Create /F /SC DAILY /ST 21:00 /TN anet-night-6kpro /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\maxinjian\source\jianpanerp\tools\night\run-night.ps1"
```

- 确认：`schtasks /Query /TN anet-night-6kpro`
- 手动跑一次：`schtasks /Run /TN anet-night-6kpro`
- 停用：`schtasks /Change /TN anet-night-6kpro /DISABLE`
- 前提：Windows 要开机并保持登录。

## 增减任务

编辑 `jobs.txt` 并推送即可，每晚开始时会先 `git pull`。每行写一条 `node` 后面的命令，行首加 `#` 表示不执行。
