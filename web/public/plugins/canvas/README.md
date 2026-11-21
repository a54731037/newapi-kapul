# 本地画布插件

放在这个目录里的插件会在创作工作台 → 画布 打开时被自动加载；也可以在「插件 → 插件市场」里从远程清单安装（安装结果只存在浏览器 IndexedDB，不上传服务器）。

## 目录结构

```
web/public/plugins/canvas/
├─ index.json      # 清单：列出要加载的模块
├─ clock.js        # 示例：沙箱内实时时钟
├─ swatch.js       # 示例：调色板 + 剪贴板
└─ note.js         # 示例：editor 面板 + postMessage 桥
```

`index.json`：

```json
{
  "version": 1,
  "plugins": [{ "id": "clock", "entry": "/plugins/canvas/clock.js" }]
}
```

## 模块格式

```js
export default {
  id: 'my-node',                       // 必填，唯一，同时是节点类型 id
  label: 'My node',                    // 必填，显示在「添加节点」菜单
  size: { width: 280, height: 200 },   // 可选
  create() { return { title, content } },  // 可选，新建节点初始值
  render(node) { return '<!doctype html>…' },   // 节点正文
  editor(node) { return '<!doctype html>…' },   // 双击节点 / 面板「插件设置」打开的配置面板
}
```

## editor 面板

- 节点双击标题栏，或选中节点后点右侧「插件设置」，会弹出对话框，内容是 `editor(node)` 的 HTML。
- 面板同样运行在 `iframe sandbox="allow-scripts"`（无同源），所以改数据必须走 postMessage。

## postMessage 桥

插件页面 → 画布（`window.parent.postMessage`）：

```js
window.parent.postMessage(
  { __plugin: 'ai-studio', requestId: 'r1', type: 'set-node', nodeId, fields: { title: 'x' } },
  '*'
)
```

| type | 参数 | 说明 |
| --- | --- | --- |
| `get-node` | `nodeId` | 读回 `{ id, kind, title, content }` |
| `set-node` | `nodeId`, `fields.title/content` | 改节点标题或内容 |
| `add-node` | `kind`, `content?` | 新建节点，返回 `{ id }` |
| `generate-image` | `nodeId`, `prompt`, `size?` | 用画布当前选中的密钥生图，结果写回该节点 |
| `toast` | `message`, `level?` | 显示提示 |

画布 → 插件：

```js
{ __plugin: 'ai-studio:result', requestId, ok: true, data?, error? }
```

### 安全边界

- 只接受 `event.origin === 'null'` 的消息 —— 这正是 `sandbox="allow-scripts"`（不含 `allow-same-origin`）帧的源；同源页面无法伪造。
- 只能操作消息里声明的、当前存在的节点 id。
- `generate-image` 依赖画布右侧当前选中的密钥；没有选中时返回 `{ ok: false, error: 'no api key selected' }`。
- 模块本身仍是主应用上下文里的 `import()`，等于你信任这份本地文件；正文与 editor 的 HTML 则在沙箱里跑。

## 插件市场（同步到本地）

「插件 → 插件市场」：

1. 填一个清单地址（与本地 `index.json` 同格式，`entry` 可以是相对或绝对 URL）。
2. 「拉取」列出条目；「安装」把模块源码下载后**存进本浏览器 IndexedDB**（`ai-studio-canvas-plugins`），并以 Blob URL 执行、立即注册。
3. 「已安装到本浏览器」里可以移除；安装/移除后插件列表自动重新加载。

服务器只提供 `web/public` 里自带的插件，市场安装的内容不会写入服务器。

## 排错

- 打开画布时拉取 `index.json`，失败会显示在「插件」弹出层，画布照常可用。
- 改完本地插件文件点「重新加载」（必要时硬刷新绕过浏览器缓存）；市场安装的插件同样可以重新加载。
- 插件节点正文区域会吞掉指针事件：想拖动/选中节点请用标题栏。
