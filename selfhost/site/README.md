# 当前生产网站运行副本

这里的运行模块、dist 和 drizzle 来自完整快照，文件指纹见 `../../docs/production-code-manifest.json`。生产版本29。

运行时还需要私密 `config/`、数据库 `data/`、Windows 依赖和服务账户权限；这些全部在加密快照中。仅复制这里的公开文件不能恢复真实生产系统。使用仓库根目录的 `scripts/restore-full.ps1`。

`initialize.mjs` 用于历史首次建库；恢复完整数据库时不要再次运行。`site-integration/` 中的历史 TypeScript 集成示例不是此完整构建的可重编译原始工程。
