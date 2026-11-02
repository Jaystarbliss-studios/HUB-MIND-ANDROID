import React, { useRef } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, Italic, Underline, Strikethrough, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, CheckSquare, Quote, Minus,
  Undo, Redo, Table as TableIcon, Image as ImageIcon, Link as LinkIcon,
  Subscript, Superscript, Eraser, Baseline
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ToolbarProps {
  editor: Editor;
}

const ToolbarButton = ({ 
  onClick, isActive = false, disabled = false, children, title
}: { 
  onClick: () => void, isActive?: boolean, disabled?: boolean, children: React.ReactNode, title?: string 
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center",
      isActive ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800",
      disabled && "opacity-50 cursor-not-allowed"
    )}
  >
    {children}
  </button>
);

export function DocumentToolbar({ editor }: ToolbarProps) {
  if (!editor) {
    return null;
  }

  
  
  const [promptState, setPromptState] = React.useState<{type: 'image' | 'link' | null, defaultVal: string}>({type: null, defaultVal: ''});

  const addImage = () => {
    setPromptState({type: 'image', defaultVal: ''});
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href || '';
    setPromptState({type: 'link', defaultVal: previousUrl});
  };

  const handlePromptSubmit = (val: string) => {
    if (promptState.type === 'image') {
      if (val) editor.chain().focus().setImage({ src: val }).run();
    } else if (promptState.type === 'link') {
      if (val === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      } else if (val !== null) {
        editor.chain().focus().extendMarkRange('link').setLink({ href: val }).run();
      }
    }
    setPromptState({type: null, defaultVal: ''});
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const fontFamilies = [
    { label: 'Inter', value: 'Inter, sans-serif' },
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Courier New', value: '"Courier New", Courier, monospace' },
    { label: 'Georgia', value: 'Georgia, serif' },
  ];

  const fontSizes = ['12px', '14px', '16px', '18px', '24px', '32px', '48px'];

  return (
    <div className="flex items-center gap-1 shrink-0 p-2 bg-slate-900 border-b border-slate-800 sticky top-0 z-10 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
<style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-slate-800">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
          <Redo className="w-4 h-4" />
        </ToolbarButton>
      </div>

      <div className="flex items-center gap-1 shrink-0 px-2 border-r border-slate-800">
        <select 
          onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
          value={editor.getAttributes('textStyle').fontFamily || fontFamilies[0].value}
          className="bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1.5 focus:outline-none"
        >
          {fontFamilies.map(font => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>
        
        <select 
          onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
          value={editor.getAttributes('textStyle').fontSize || '16px'}
          className="bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1.5 focus:outline-none w-16"
        >
          {fontSizes.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1 shrink-0 px-2 border-r border-slate-800">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold (Ctrl+B)">
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic (Ctrl+I)">
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline (Ctrl+U)">
          <Underline className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} title="Subscript">
          <Subscript className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} title="Superscript">
          <Superscript className="w-4 h-4" />
        </ToolbarButton>
        
        <div className="flex items-center gap-1 shrink-0 relative group">
          <ToolbarButton onClick={() => {}} title="Text Color">
            <Baseline className="w-4 h-4" />
            <input 
              type="color" 
              onInput={event => editor.chain().focus().setColor((event.target as HTMLInputElement).value).run()}
              value={editor.getAttributes('textStyle').color || '#ffffff'}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </ToolbarButton>
        </div>
        
        <div className="flex items-center gap-1 shrink-0 relative group">
          <ToolbarButton onClick={() => {}} isActive={editor.isActive('highlight')} title="Highlight Color">
            <Highlighter className="w-4 h-4" />
            <input 
              type="color" 
              onInput={event => editor.chain().focus().toggleHighlight({ color: (event.target as HTMLInputElement).value }).run()}
              value={editor.getAttributes('highlight').color || '#ffff00'}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </ToolbarButton>
        </div>

        <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear Formatting">
          <Eraser className="w-4 h-4" />
        </ToolbarButton>
      </div>

      <div className="flex items-center gap-1 shrink-0 px-2 border-r border-slate-800">
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })}>
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })}>
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })}>
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })}>
          <AlignJustify className="w-4 h-4" />
        </ToolbarButton>
      </div>

      <div className="flex items-center gap-1 shrink-0 px-2 border-r border-slate-800">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')}>
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')}>
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')}>
          <CheckSquare className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')}>
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="w-4 h-4" />
        </ToolbarButton>
      </div>
      
      <div className="flex items-center gap-1 shrink-0 px-2">
        <ToolbarButton onClick={setLink} isActive={editor.isActive('link')}>
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={addImage}>
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertTable}>
          <TableIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {editor.isActive('table') && (
        <div className="flex items-center gap-1 shrink-0 px-2 border-l border-slate-800 bg-accent/10 rounded-lg ml-2">
          <span className="text-xs font-semibold text-accent px-1">Table:</span>
          <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add Column Before">
            <span className="text-[10px] font-bold">+C&lt;</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add Column After">
            <span className="text-[10px] font-bold">+C&gt;</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete Column">
            <span className="text-[10px] font-bold">-C</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()} title="Add Row Before">
            <span className="text-[10px] font-bold">+R^</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="Add Row After">
            <span className="text-[10px] font-bold">+R_</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row">
            <span className="text-[10px] font-bold">-R</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().mergeCells().run()} title="Merge Cells">
            <span className="text-[10px] font-bold">Merge</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().splitCell().run()} title="Split Cell">
            <span className="text-[10px] font-bold">Split</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="Delete Table">
            <span className="text-[10px] font-bold text-red-400">Del</span>
          </ToolbarButton>
        </div>
      )}

    </div>
  );
}
