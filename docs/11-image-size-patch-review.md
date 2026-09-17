# image-size 安全修复复核

## 2026-09-17：改用已发布修复版

当天 npm 最新版本为 `2.0.4`，两份 OSV 公告均标记最后受影响版本为 `2.0.2`。本次将 dashboard 的 `image-size` override 固定到 `2.0.4`，移除旧的 Bun 补丁及两条例外。原有三份零长度畸形输入仍由 CJS / ESM 的公开入口、直接解析器执行，保留每个子进程 2 秒超时；断言改为已发布修复版对畸形输入的明确拒绝结果，并增加正常 1×1 PNG 的两个模块系统对照测试。安全 gate 继续先检查解析器，再扫描 OSV 和 Gitleaks。

## 历史记录：2026-09-08 的补丁复核

2026-09-08，正常推送检查发现 `image-size@2.0.2` 的两项已有扫描例外到期。该包由 vinext 引入，仓库已经通过 Bun `patchedDependencies` 回补解析器修复。本次没有新增忽略项，也没有替换或缩减原测试。

## 上游状态与影响

当天查询 npm，最新发布仍为 `2.0.2`。OSV 两份公告（最后更新 2026-08-07）均列出受影响版本截至 `2.0.2`，没有已发布修复版本：

- [GHSA-5p2g-fcmc-qvqq](https://osv.dev/GHSA-5p2g-fcmc-qvqq)：JXL / HEIF 的零长度 box 使解析偏移量不前进，造成无限循环。
- [GHSA-w3rx-r6r6-pgpr](https://osv.dev/GHSA-w3rx-r6r6-pgpr)：ICNS 的零长度条目导致同类无限循环。

扫描器按锁文件中的原始 npm 版本匹配，不识别本仓库的源码补丁。当时的例外仅用于已回补这两项问题的安装结果。

## 复核证据

- [当时的补丁](https://github.com/nocoo/gecko/blob/3d2506b1fb7738329d53260fd8b3dde41be9f84d/apps/web-dashboard/patches/image-size%402.0.2.patch)覆盖 CJS / ESM 的公开入口、直接解析器及分发文件；零长度字段使偏移量至少前进 8 字节。
- 在临时目录读取未经修改的 npm 发布包，使用 ICNS、HEIF、JXL 三份零长度输入作反例；三个子进程均在 2 秒限制内未能终止，由测试进程结束。下载 tarball 的 SHA-256 为 `7a47b434cf3c1d3f50dd23f6de2587c5cb0bd55bf044c2546cbb60d979f00d36`。
- 对当时已安装补丁执行[现有回归测试](../apps/web-dashboard/src/__tests__/image-size-security.test.ts)，6 个 CJS / ESM 用例全部通过；每个用例检查公开入口和直接解析器。畸形 ICNS / HEIF 有限返回尺寸，JXL 有限返回输入结束错误，结果与预期一致。

## 当时的后续检查约定

[安全检查入口](../apps/web-dashboard/scripts/gate-security.ts)当时先执行这组现有回归测试，补丁行为不通过则立即失败；随后仍运行完整 OSV 与 Gitleaks 检查。两个已有例外在上述复核后限期续至 **2026-10-08**，其他依赖和公告照常检查。

到期前重新查询上游并复测。上游发布适用的修复版本后，优先升级依赖，移除补丁和相应扫描例外，再运行正常检查。若回归测试失败，先修复安装或补丁，不延长例外。
