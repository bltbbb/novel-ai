import type { RichTextDocument, RichTextNode } from '@/types';

const BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
]);

function flattenNode(node: RichTextNode): string {
  if (node.text) {
    return node.text;
  }

  const nested = (node.content ?? []).map(flattenNode).join('');

  if (!nested) {
    return '';
  }

  return BLOCK_NODE_TYPES.has(node.type) ? `${nested}\n` : nested;
}

export function richTextToPlainText(document: RichTextDocument) {
  return document.content
    .map(flattenNode)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countDocumentCharacters(document: RichTextDocument) {
  return richTextToPlainText(document).replace(/\s/g, '').length;
}

export function createParagraphDocument(text = ''): RichTextDocument {
  const normalized = text.trim();

  if (!normalized) {
    return {
      type: 'doc',
      content: [],
    };
  }

  const paragraphs = normalized
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: paragraph,
        },
      ],
    })),
  };
}
