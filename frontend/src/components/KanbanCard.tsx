import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, Column } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card; columnId: string; columns: Column[]; disabled: boolean; editing: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string, details: string) => void;
  onMove: (id: string, columnId: string) => void;
  onEditingChange: (id: string | null) => void;
};

const iconButton = "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--gray-text)] transition-colors hover:bg-[var(--surface)] disabled:hover:bg-transparent";
const iconProps = {
  "aria-hidden": true, width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
} as const;

export const KanbanCard = ({ card, columnId, columns, disabled, editing, onDelete, onEdit, onMove, onEditingChange }: KanbanCardProps) => {
  const setEditing = (open: boolean) => onEditingChange(open ? card.id : null);
  const titleInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (editing) titleInput.current?.focus(); }, [editing]);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: disabled || editing });

  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx("rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]", isDragging && "opacity-60")}
      data-testid={`card-${card.id}`}>
      <div className="flex justify-between gap-2">
        <button id={`drag-${card.id}`} ref={setActivatorNodeRef} type="button" disabled={disabled || editing}
          {...attributes} {...listeners} aria-label={`Drag ${card.title}`} title="Drag to move"
          className={clsx(iconButton, "cursor-grab touch-none hover:text-[var(--navy-dark)] active:cursor-grabbing")}>
          <svg {...iconProps} fill="currentColor" stroke="none">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <button type="button" disabled={disabled} onClick={() => { if (window.confirm(`Delete "${card.title}"? This cannot be undone.`)) onDelete(card.id); }}
          aria-label={`Delete ${card.title}`} title="Delete card" className={clsx(iconButton, "hover:bg-red-50 hover:text-red-700")}>
          <svg {...iconProps}>
            <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
          </svg>
        </button>
      </div>
      {editing ? (
        <form onSubmit={event => {
          event.preventDefault();
          if (!disabled && title.trim()) { onEdit(card.id, title.trim(), details); setEditing(false); }
        }} className="mt-3 space-y-2">
          <label className="block text-sm">Card title<input ref={titleInput} required maxLength={200} disabled={disabled} value={title}
            onChange={event => setTitle(event.target.value)} className="block w-full rounded border px-2 py-1" /></label>
          <label className="block text-sm">Card details<textarea maxLength={5000} disabled={disabled} value={details}
            onChange={event => setDetails(event.target.value)} className="block w-full rounded border px-2 py-1" /></label>
          <button type="submit" disabled={disabled} className="rounded bg-[var(--secondary-purple)] px-3 py-1 text-sm text-white">Save card</button>
          <button type="button" onClick={() => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }} className="ml-2 text-sm">Cancel</button>
        </form>
      ) : (
        <>
          <h3 className="mt-2 font-display text-base font-semibold text-[var(--navy-dark)]">{card.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">{card.details}</p>
          <button id={`edit-${card.id}`} ref={editButton} type="button" disabled={disabled} aria-label={`Edit ${card.title}`} onClick={() => {
            setTitle(card.title); setDetails(card.details); setEditing(true);
          }} className="mt-3 rounded text-sm text-[var(--secondary-purple)]">Edit</button>
          <label className="mt-2 block text-xs">Move to
            <select id={`move-${card.id}`} aria-label={`Move ${card.title} to column`} disabled={disabled} value={columnId}
              onChange={event => onMove(card.id, event.target.value)} className="mt-1 block w-full rounded border bg-white p-1">
              {columns.map(column => <option key={column.id} value={column.id}>{column.title}</option>)}
            </select>
          </label>
        </>
      )}
    </article>
  );
};
