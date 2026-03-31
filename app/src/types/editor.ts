export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: RichTextMark[];
  content?: RichTextNode[];
}

export interface RichTextDocument {
  type: 'doc';
  content: RichTextNode[];
}

export const EMPTY_DOCUMENT: RichTextDocument = {
  type: 'doc',
  content: [],
};
