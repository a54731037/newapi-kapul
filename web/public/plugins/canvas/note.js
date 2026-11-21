// Canvas plugin: bridge + editor demo.
// - editor(node): the panel opened by double-clicking the node
// - window.parent.postMessage: requests flowing back to the canvas
//
// Everything below runs inside `sandbox="allow-scripts"` (no same-origin), so
// the only channel to the app is postMessage.

const BRIDGE = '__plugin: "ai-studio"'

function send(payload) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  window.parent.postMessage({ __plugin: 'ai-studio', requestId, ...payload }, '*')
  return requestId
}

const styles = `
  html, body { margin: 0; height: 100%; }
  body {
    font: 12px/1.5 ui-sans-serif, system-ui, sans-serif;
    color: #18181b; background: #fff; padding: 10px; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 8px;
  }
  h4 { margin: 0; font-size: 12px; }
  p { margin: 0; color: #52525b; }
  input, textarea {
    width: 100%; box-sizing: border-box; font: inherit; padding: 6px 8px;
    border: 1px solid rgb(0 0 0 / 0.12); border-radius: 6px;
  }
  button {
    font: inherit; padding: 6px 10px; border-radius: 6px; cursor: pointer;
    border: 1px solid rgb(0 0 0 / 0.12); background: #f4f4f5;
  }
  button.primary { background: #6366f1; border-color: #6366f1; color: #fff; }
  .row { display: flex; gap: 6px; }
`

function editor(node) {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>${styles}</style></head>
<body>
  <h4>${node.title || 'Note'} · 设置</h4>
  <input id="title" placeholder="标题" value="${(node.title || '').replace(/"/g, '&quot;')}" />
  <textarea id="content" rows="4" placeholder="内容">${(node.content || '').replace(/</g, '&lt;')}</textarea>
  <div class="row">
    <button class="primary" id="save">保存</button>
    <button id="sticky">新建便签</button>
    <button id="image">请求生图</button>
  </div>
  <p id="status"></p>
  <script>
    const nodeId = ${JSON.stringify(node.id)}
    ${BRIDGE}
    const status = (text) => { document.getElementById('status').textContent = text }
    const send = (payload) => window.parent.postMessage(
      { __plugin: 'ai-studio', requestId: String(Date.now()) + Math.random(), ...payload },
      '*'
    )
    window.addEventListener('message', (event) => {
      const data = event.data
      if (!data || data.__plugin !== 'ai-studio:result') return
      status(data.ok ? '完成' : '失败: ' + data.error)
    })
    document.getElementById('save').addEventListener('click', () => {
      send({
        type: 'set-node',
        nodeId,
        fields: {
          title: document.getElementById('title').value,
          content: document.getElementById('content').value,
        },
      })
    })
    document.getElementById('sticky').addEventListener('click', () => {
      send({ type: 'add-node', kind: 'sticky', content: '来自插件的便签' })
    })
    document.getElementById('image').addEventListener('click', () => {
      const prompt = document.getElementById('content').value || 'a red circle on white'
      send({ type: 'generate-image', nodeId, prompt })
      status('生图请求已发送')
    })
  </script>
</body></html>`
}

export default {
  id: 'note',
  label: 'Bridge note',
  size: { width: 300, height: 200 },
  create() {
    return { title: 'Bridge note', content: '双击打开设置面板' }
  },
  render(node) {
    return `<!doctype html>
<html><head><meta charset="utf-8" /><style>${styles}</style></head>
<body>
  <h4>${(node.title || '').replace(/</g, '&lt;')}</h4>
  <p>${(node.content || '双击打开设置').replace(/</g, '&lt;')}</p>
</body></html>`
  },
  editor,
}
