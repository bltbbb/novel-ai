import type { Chapter, Project, RichTextMark, RichTextNode } from '@/types';

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'novel';
}

function applyMarks(text: string, marks?: RichTextMark[]) {
  if (!marks || marks.length === 0) {
    return text;
  }

  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case 'bold':
        return `**${current}**`;
      case 'italic':
        return `*${current}*`;
      case 'strike':
        return `~~${current}~~`;
      case 'code':
        return `\`${current}\``;
      default:
        return current;
    }
  }, text);
}

function renderInline(node: RichTextNode): string {
  if (node.type === 'hardBreak') {
    return '  \n';
  }

  if (typeof node.text === 'string') {
    return applyMarks(node.text, node.marks);
  }

  return (node.content ?? []).map(renderInline).join('');
}

function renderNode(node: RichTextNode, depth = 0): string {
  switch (node.type) {
    case 'paragraph': {
      const text = (node.content ?? []).map(renderInline).join('').trimEnd();
      return text ? `${text}\n\n` : '\n';
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      const text = (node.content ?? []).map(renderInline).join('').trim();
      return `${'#'.repeat(level)} ${text}\n\n`;
    }
    case 'bulletList': {
      return (node.content ?? []).map((item) => renderNode(item, depth)).join('') + '\n';
    }
    case 'orderedList': {
      return (
        (node.content ?? [])
          .map((item, index) => renderNode(item, depth).replace(/^-\s/, `${index + 1}. `))
          .join('') + '\n'
      );
    }
    case 'listItem': {
      const text = (node.content ?? [])
        .map((child) => renderNode(child, depth + 1).trimEnd())
        .filter(Boolean)
        .join('\n');
      const prefix = `${'  '.repeat(depth)}- `;
      return `${prefix}${text.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`)}\n`;
    }
    case 'blockquote': {
      const inner = (node.content ?? [])
        .map((child) => renderNode(child, depth).trimEnd())
        .filter(Boolean)
        .join('\n');
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
        .concat('\n\n');
    }
    case 'codeBlock': {
      const code = (node.content ?? []).map(renderInline).join('');
      return `\`\`\`\n${code}\n\`\`\`\n\n`;
    }
    case 'horizontalRule':
      return '---\n\n';
    default: {
      if (node.content?.length) {
        return node.content.map((child) => renderNode(child, depth)).join('');
      }

      return '';
    }
  }
}

export function documentToMarkdown(content: Chapter['content']) {
  return (content.content ?? [])
    .map((node) => renderNode(node))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chapterToMarkdown(chapter: Pick<Chapter, 'title' | 'content'>) {
  const body = documentToMarkdown(chapter.content);
  return [`# ${chapter.title || '未命名章节'}`, '', body].filter(Boolean).join('\n');
}

export function projectToMarkdown(project: Pick<Project, 'title' | 'description'>, chapters: Chapter[]) {
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  const parts = [`# ${project.title || '未命名项目'}`];

  if (project.description.trim()) {
    parts.push('', project.description.trim());
  }

  for (const chapter of sortedChapters) {
    parts.push('', `## ${chapter.title || '未命名章节'}`);
    const chapterBody = documentToMarkdown(chapter.content);
    if (chapterBody) {
      parts.push('', chapterBody);
    }
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function downloadMarkdown(fileName: string, markdown: string) {
  const blob = new Blob([markdown], {
    type: 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = sanitizeFileName(fileName);
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
