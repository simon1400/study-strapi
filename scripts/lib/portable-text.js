'use strict';

/**
 * Portable Text (Sanity) -> HTML.
 * Разметка повторяет сериализаторы старого сайта (src/app/methods/serializers)
 * и дефолты @sanity/block-content-to-react, чтобы вёрстка осталась 1:1.
 */

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (value) => escapeHtml(value).replace(/"/g, '&quot;');

const DECORATORS = {
  strong: (c) => `<strong>${c}</strong>`,
  em: (c) => `<em>${c}</em>`,
  underline: (c) => `<u>${c}</u>`,
  'strike-through': (c) => `<s>${c}</s>`,
  code: (c) => `<code>${c}</code>`,
  blockquote: (c) => `<blockquote>${c}</blockquote>`,
  infopositive: (c) => `<div class="info positive-info"><p>${c}</p></div>`,
  additions: (c) => `<div class="additions">${c}</div>`,
};

const BLOCK_TAGS = {
  normal: 'p',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  blockquote: 'blockquote',
};

function renderSpan(span, markDefs, warn) {
  let html = escapeHtml(span.text || '').replace(/\n/g, '<br />');
  const marks = span.marks || [];
  // применяем справа налево: последняя марка — самый внутренний тег
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const mark = marks[i];
    if (DECORATORS[mark]) {
      html = DECORATORS[mark](html);
      continue;
    }
    const def = (markDefs || []).find((d) => d._key === mark);
    if (def && def._type === 'link') {
      html = def.href
        ? `<a href="${escapeAttr(def.href)}" target="_blank" rel="noopener noreferrer">${html}</a>`
        : html;
      continue;
    }
    warn(`неизвестная марка "${mark}"`);
  }
  return html;
}

function renderBlock(block, warn) {
  const children = (block.children || [])
    .map((child) => {
      if (child._type !== 'span') {
        warn(`неизвестный child._type "${child._type}" внутри block`);
        return '';
      }
      return renderSpan(child, block.markDefs, warn);
    })
    .join('');
  const tag = BLOCK_TAGS[block.style] || 'p';
  return { tag, children };
}

/**
 * @param {Array} blocks массив Portable Text
 * @param {(msg: string) => void} [onWarn]
 * @returns {string} HTML
 */
function portableTextToHtml(blocks, onWarn) {
  const warn = onWarn || (() => {});
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  const out = [];
  let listTag = null; // 'ul' | 'ol'
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  for (const block of blocks) {
    if (!block || block._type !== 'block') {
      warn(`пропущен элемент _type="${block && block._type}" (не block)`);
      continue;
    }
    const { tag, children } = renderBlock(block, warn);

    if (block.listItem) {
      const wanted = block.listItem === 'number' ? 'ol' : 'ul';
      if (listTag !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        listTag = wanted;
      }
      out.push(`<li>${children}</li>`);
      continue;
    }

    closeList();
    if (!children.trim()) continue;
    out.push(`<${tag}>${children}</${tag}>`);
  }
  closeList();

  return out.join('\n');
}

module.exports = { portableTextToHtml, escapeHtml };
