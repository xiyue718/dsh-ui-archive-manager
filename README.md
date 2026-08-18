[中文](./README.md) | [English](./README_EN.md)

# @dsh-external/ui-archive-manager

## 介绍

`ui-archive-manager` 是 DSH Web 客户端的“归档会话管理”插件。它在“设置”页面中新增“归档管理”页面，以“工作区 → 会话”的层级结构统一展示所有已归档会话，并支持单个或批量恢复、永久删除、搜索筛选等操作。

## 安装

### 方式一：超级模组注入器

```text
dev_build_plugin  {"dir": "C:/Users/<user>/.dsh/plugins/ui-archive-manager"}
dev_inject_plugin {"dir": "C:/Users/<user>/.dsh/plugins/ui-archive-manager"}
```

打开或刷新 DSH Web，进入“设置 → 归档管理”。

### 方式二：dsh 命令安装（项目官方方式）

如果你已安装 `dsh` CLI，可以按项目官方教程使用 `dsh plugin` 命令安装：

```bash
# 从本地插件目录安装
dsh plugin --profile web add C:/Users/<user>/.dsh/plugins/ui-archive-manager

# 或从 GitHub 仓库安装
dsh plugin --profile web add github:xiyue718/dsh-ui-archive-manager
```

安装后启动：

```bash
dsh --profile web
```

查看组合配置：

```bash
dsh --profile web --dump-config
```

详细命令说明见项目文档：`docs/user/develop/basic/publish.md`。

构建产物：host 为 `lib/index.js`，client 为 `lib/client.js`，打包文件为 `dsh-external-ui-archive-manager-0.1.0.tgz`。

## 使用

1. 启动 DSH Web 客户端。
2. 打开“设置”面板。
3. 点击“归档管理”。
4. 按工作区展开/收缩查看归档会话。
5. 可对单个工作区“一键全选”，也可勾选多个会话后批量操作。
6. 点击“恢复”或“删除”后，在项目内置确认框中确认。
7. 操作完成后列表自动刷新，并通过项目内置 Toast 显示成功或失败提示。

## 功能

- 以“工作区 → 会话”层级展示所有已归档会话，页面结构与“用量统计”插件保持一致。
- 每个工作区以卡片形式展示，可独立展开/收缩。
- 展开/收缩使用图标，不显示文字。
- “一键全选”使用与单个归档会话一致的原生复选框样式，并位于工作区标题最左侧。
- 会话信息包含：会话标题、会话 ID、最后活动/归档参考时间、创建时间、是否仍为活跃会话、是否已持久化。
- 单个恢复：取消归档，恢复到正常会话列表。
- 单个永久删除：删除归档会话的会话日志与工作区关联。
- 批量恢复：勾选多个会话后批量取消归档。
- 批量删除：勾选多个会话后批量永久删除。
- 搜索/筛选：按会话标题、会话 ID、日期（最后活动/创建日期）筛选。
- 操作确认：恢复和删除前都会使用项目内置 Modal 确认框。
- 操作反馈：操作完成后自动刷新列表，并通过项目内置 Toast 显示成功或失败提示。
- 安全处理：删除会拒绝仍活跃的会话时保持明确反馈；删除前会从归档集合、工作区绑定、内存 live 注册表、持久化目录中逐层移除。

### Host API

```http
GET /@dsh-external/ui-archive-manager/api/archived
```

```http
POST /@dsh-external/ui-archive-manager/api/restore
Content-Type: application/json

{ "sessionIds": ["session-xxx"] }
```

```http
POST /@dsh-external/ui-archive-manager/api/delete
Content-Type: application/json

{ "sessionIds": ["session-xxx"] }
```

## 原理

插件由 host 和 client 两部分组成。

Host 侧通过 `webServer.register` 暴露归档管理 API。读取归档列表时，它从 `workspaceRegistry.archivedSessionIds` 获取归档会话 ID，再通过 `sessionQuery` / `sessionPersistence` 读取会话标题、创建时间、最后活动时间和活跃状态。恢复操作通过 `workspaceRegistry.setState` 从 `archivedSessionIds` 中移除目标 ID；永久删除则依次完成：取消归档、从所属工作区解绑、从内存 live 会话/agent 注册表移除、删除对应持久化会话目录。

当前 DSH 主程序只保存归档会话 ID 集合，没有单独保存每个会话的归档时间，因此插件显示的是“最后活动/归档参考时间”（日志最后一条事件时间），并用创建时间辅助排序和搜索。

Client 侧在设置页中注册“归档管理”页面，通过 Host API 获取数据并渲染层级列表，使用项目内置 Modal 和 Toast 完成确认与反馈。
