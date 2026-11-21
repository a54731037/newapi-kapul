// Canvas plugin: live clock.
// Loaded from /plugins/canvas/clock.js by the local plugin runtime.
// The render() output runs inside an iframe sandbox without same-origin access.

export default {
  id: 'clock',
  label: 'Clock',
  size: { width: 260, height: 160 },
  create() {
    return { title: 'Clock', content: '' }
  },
  render() {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; height: 100%; }
      body {
        display: flex; align-items: center; justify-content: center;
        font: 600 28px/1 ui-sans-serif, system-ui, sans-serif;
        color: #18181b; background: #ffffff; letter-spacing: 0.04em;
      }
      span { font-variant-numeric: tabular-nums; }
    </style>
  </head>
  <body><span id="t">--:--:--</span>
    <script>
      const el = document.getElementById('t');
      const tick = () => {
        el.textContent = new Date().toLocaleTimeString();
      };
      tick();
      setInterval(tick, 1000);
    </script>
  </body>
</html>`
  },
}
