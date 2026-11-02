import { Extension } from '@tiptap/core';

const STYLE_PROPS = [
  'margin-top','margin-right','margin-bottom','margin-left','text-indent',
  'line-height','letter-spacing','white-space',
  'padding-top','padding-right','padding-bottom','padding-left',
  'vertical-align','page-break-before','page-break-after',
] as const;

function readStyle(element: HTMLElement, prop: string) {
  return element.style.getPropertyValue(prop) || null;
}

function renderStyle(attributes: Record<string, any>) {
  const parts = STYLE_PROPS.map(prop => attributes[prop] ? `${prop}: ${attributes[prop]}` : '').filter(Boolean);
  return parts.length ? { style: parts.join('; ') } : {};
}

export const DocumentFormatting = Extension.create({
  name: 'documentFormatting',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'listItem', 'blockquote'],
      attributes: Object.fromEntries(STYLE_PROPS.map(prop => [
        prop,
        {
          default: null,
          parseHTML: (element: HTMLElement) => readStyle(element, prop),
          renderHTML: (attributes: Record<string, any>) => renderStyle(attributes),
        },
      ])),
    }];
  },
});
