// Canvas plugin: colour swatch.
// Clicking a swatch copies its hex value to the clipboard inside the sandbox.
// Demonstrates that plugin bodies may be interactive while staying isolated.

export default {
  id: 'swatch',
  label: 'Swatch',
  size: { width: 240, height: 180 },
  create() {
    return { title: 'Swatch', content: '' }
  },
  render() {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; height: 100%; }
      body {
        background: #ffffff; color: #18181b; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
        display: flex; flex-direction: column; gap: 8px; padding: 10px; box-sizing: border-box;
      }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; flex: 1; }
      button { border: 1px solid rgb(0 0 0 / 0.08); border-radius: 6px; cursor: pointer; }
      code { font-variant-numeric: tabular-nums; }
    </style>
  </head>
  <body>
    <div class="grid" id="grid"></div>
    <code id="picked">pick a colour</code>
    <script>
      const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#0ea5e9', '#facc15', '#64748b'];
      const grid = document.getElementById('grid');
      const picked = document.getElementById('picked');
      palette.forEach((colour) => {
        const button = document.createElement('button');
        button.style.background = colour;
        button.addEventListener('click', () => {
          picked.textContent = colour;
          void navigator.clipboard?.writeText(colour).catch(() => {});
        });
        grid.appendChild(button);
      });
    </script>
  </body>
</html>`
  },
}
