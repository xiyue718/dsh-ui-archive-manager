# @dsh-external/ui-archive-manager

在 DSH Web 客户端的“设置”页面中新增“归档管理”页面，用于统一管理所有已归档会话。

## 功能

- 以“工作区 → 会话”层级展示所有已归档会话，页面结构与“用量统计”插件保持一致：
  - 每个工作区以卡片形式展示，可独立展开/收缩。
  - 展开/收缩使用图标，不显示文字。
  - “一键全选”使用与单个归档会话一致的原生复选框样式，并位于工作区标题最左侧。
- 会话信息：
  - 会话标题
  - 会话 ID
  - 最后活动/归档参考时间
  - 创建时间
  - 是否仍为活跃会话 / 是否已持久化
- 单个恢复：取消归档，恢复到正常会话列表。
- 单个永久删除：删除归档会话的会话日志与工作区关联。
- 批量恢复：勾选多个会话后批量取消归档。
- 批量删除：勾选多个会话后批量永久删除。
- 搜索/筛选：按会话标题、会话 ID、日期（最后活动/创建日期）筛选。
- 操作确认：恢复和删除前都会使用项目内置 Modal 确认框。
- 操作反馈：操作完成后自动刷新列表，并通过项目内置 Toast 显示成功或失败提示。

## 安全说明

- 永久删除已归档会话（包括当前仍处于 live 状态的归档会话）时，会先弹出内置确认框，由用户明确确认后执行。
- 删除操作会：
  1. 从归档集合移除；
  2. 从所属工作区解绑；
  3. 从内存中的 live 会话/agent 注册表移除，避免删除后仍出现在“未分组”中；
  4. 删除对应的持久化会话目录。
- 删除不可恢复，请谨慎使用。

## 关于“归档时间”

当前 DSH 主程序只保存归档会话 ID 集合，没有单独保存每个会话的归档时间。因此本插件显示的是该会话的“最后活动/归档参考时间”（日志最后一条事件时间），并用创建时间辅助排序和搜索。

## Host API

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

## 安装到其他 DSH 客户端

### 方式一：超级模组注入器（推荐）

1. 复制插件目录或解压 `dsh-external-ui-archive-manager-0.0.1.tgz`。
2. 在目标 DSH 会话中执行：

   ```text
   dev_build_plugin  {"dir": "C:/Users/<user>/.dsh/plugins/ui-archive-manager"}
   dev_inject_plugin {"dir": "C:/Users/<user>/.dsh/plugins/ui-archive-manager"}
   ```

3. 打开或刷新 DSH Web，进入设置 → 归档管理。

### 方式二：使用 dsh 命令安装（项目官方方式）

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

## 使用步骤

1. 启动 DSH Web 客户端。
2. 打开设置面板。
3. 点击“归档管理”。
4. 查看归档会话列表。
5. 按工作区展开/收缩查看会话，可对单个工作区“一键全选”，也可勾选后批量操作，或对单个会话点击“恢复”/“删除”。
6. 根据确认提示完成操作，列表会自动刷新并显示结果。

## 构建产物

- host：`lib/index.js`
- client：`lib/client.js`
- 打包文件：`dsh-external-ui-archive-manager-0.0.1.tgz`
