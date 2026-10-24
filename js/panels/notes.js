import { registerPanel } from '../core/registry.js';
import { miniMarkdown } from '../core/util.js';

registerPanel({
  type: 'notes',
  name: 'Notes',
  description: 'A message or checklist you write from the editor.',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 2, h: 1 },
  settings: [
    { key: 'title', label: 'Title', type: 'text', default: 'This week' },
    { key: 'body', label: 'Text', type: 'textarea', default: '[ ] Return library books\n[x] Email advisor\n[ ] Laundry on Sunday\n\nRemember: **drink water**.',
      help: 'Supports **bold**, _italic_, "- " bullets, "[ ]" and "[x]" checkboxes, and "# " headings.' },
    { key: 'size', label: 'Text size', type: 'select', default: 'medium', options: ['small', 'medium', 'large'] },
  ],

  mount(ctx) {
    const s = ctx.settings;
    ctx.el.innerHTML = `
      <div class="notes" data-size="${ctx.esc(s.size)}">
        ${s.title ? `<h3 class="panel-title">${ctx.esc(s.title)}</h3>` : ''}
        <div class="notes-body">${miniMarkdown(s.body)}</div>
      </div>`;
  },

  css: `
    .notes { height: 100%; display: flex; flex-direction: column; gap: 3cqh; }
    .notes-body { flex: 1; min-height: 0; overflow: hidden; line-height: 1.45; color: var(--text);
      font-size: min(6cqh, 4.6cqw); mask-image: linear-gradient(to bottom, #000 85%, transparent); }
    .notes[data-size="small"] .notes-body { font-size: min(4.8cqh, 3.7cqw); }
    .notes[data-size="large"] .notes-body { font-size: min(8cqh, 6cqw); }
    .notes-body p, .notes-body h4 { margin: 0; }
    .notes-body h4 { color: var(--accent); font-weight: 600; font-size: 1em; }
    .notes-body .gap { height: .6em; }
    .notes-body ul { margin: 0; padding: 0 0 0 1.1em; }
    .notes-body li { margin: .15em 0; }
    .notes-body li.check { list-style: none; margin-left: -1.1em; display: flex; gap: .6em; align-items: baseline; }
    .notes-body .box { flex: none; width: .78em; height: .78em; border: 1.5px solid var(--text-faint); border-radius: .2em;
      transform: translateY(.08em); position: relative; }
    .notes-body li.done { color: var(--text-faint); text-decoration: line-through; text-decoration-color: var(--line-strong); }
    .notes-body li.done .box { border-color: var(--accent); background: var(--accent); }
    .notes-body li.done .box::after { content: ""; position: absolute; left: .22em; top: .04em; width: .2em; height: .42em;
      border: solid var(--ink); border-width: 0 .12em .12em 0; transform: rotate(45deg); }
  `,
});
