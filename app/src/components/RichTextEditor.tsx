import { useEffect, useRef, useState } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { EMPTY_DOCUMENT, type RichTextDocument } from '@/types';

export interface SlashCommandItem {
  key: string;
  label: string;
  description?: string;
}

interface RichTextEditorProps {
  value: RichTextDocument;
  onChange: (value: RichTextDocument) => void;
  placeholder?: string;
  disabled?: boolean;
  slashCommands?: SlashCommandItem[];
  onSelectSlashCommand?: (commandKey: string) => void | Promise<void>;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '开始写作，输入 / 将在下一阶段接入 AI 指令...',
  disabled = false,
  slashCommands = [],
  onSelectSlashCommand,
}: RichTextEditorProps) {
  const isHydratingRef = useRef(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value as JSONContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'h-full min-h-[420px] px-5 py-4 text-base leading-8 text-neutral-200 focus:outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (showSlashMenu && slashCommands.length > 0) {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIndex((current) => (current + 1) % slashCommands.length);
            return true;
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex((current) => (current - 1 + slashCommands.length) % slashCommands.length);
            return true;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setShowSlashMenu(false);
            return true;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            const currentCommand = slashCommands[selectedIndex];

            if (currentCommand) {
              void handleSelectCommand(currentCommand.key);
            }

            return true;
          }
        }

        if (!disabled && slashCommands.length > 0 && event.key === '/') {
          setShowSlashMenu(true);
          setSelectedIndex(0);
        }

        return false;
      },
    },
    onUpdate({ editor: nextEditor }) {
      if (isHydratingRef.current) {
        return;
      }

      onChange((nextEditor.getJSON() as RichTextDocument) ?? EMPTY_DOCUMENT);
    },
  });

  async function handleSelectCommand(commandKey: string) {
    if (!editor) {
      return;
    }

    const from = editor.state.selection.from;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 1), from, '');

    if (textBefore === '/') {
      editor
        .chain()
        .focus()
        .deleteRange({
          from: from - 1,
          to: from,
        })
        .run();
    }

    setShowSlashMenu(false);
    await onSelectSlashCommand?.(commandKey);
  }

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentJson = JSON.stringify(editor.getJSON() ?? EMPTY_DOCUMENT);
    const nextJson = JSON.stringify(value ?? EMPTY_DOCUMENT);

    if (currentJson === nextJson) {
      return;
    }

    isHydratingRef.current = true;
    editor.commands.setContent((value ?? EMPTY_DOCUMENT) as JSONContent, false);
    isHydratingRef.current = false;
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div className="min-h-[420px] rounded-3xl border border-neutral-800 bg-neutral-950/70 px-5 py-4 text-sm text-neutral-500">
        正在加载编辑器...
      </div>
    );
  }

  return (
    <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950/70">
      <EditorContent editor={editor} className="h-full" />
      {showSlashMenu && slashCommands.length > 0 && (
        <div className="absolute left-4 top-4 z-20 w-72 rounded-2xl border border-neutral-700 bg-neutral-900/95 p-2 shadow-2xl shadow-black/40">
          <div className="px-3 py-2 text-xs uppercase tracking-[0.2em] text-neutral-500">AI 指令</div>
          <div className="space-y-1">
            {slashCommands.map((command, index) => (
              <button
                key={command.key}
                type="button"
                onClick={() => void handleSelectCommand(command.key)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${
                  index === selectedIndex
                    ? 'bg-indigo-500/15 text-indigo-200'
                    : 'text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                <p className="text-sm font-medium">{command.label}</p>
                {command.description && <p className="mt-1 text-xs text-neutral-500">{command.description}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
