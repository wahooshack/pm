import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, Column, Priority } from "@/lib/kanban";
import { formatDue, initials, isOverdue, parseLabels, PRIORITIES } from "@/lib/cards";

export type CardChanges = Omit<Card, "id">;

type KanbanCardProps = {
  card: Card; columnId: string; columns: Column[]; participants: string[];
  disabled: boolean; dragDisabled?: boolean; editing: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, changes: CardChanges) => void;
  onMove: (id: string, columnId: string) => void;
  onEditingChange: (id: string | null) => void;
};

const iconButton = "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--gray-text)] transition-colors hover:bg-[var(--surface)] disabled:hover:bg-transparent";
const iconProps = {
  "aria-hidden": true, width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
} as const;
const fieldClass = "block w-full rounded border px-2 py-1";
const priorityStyle: Record<Priority, string> = {
  high: "border-[var(--secondary-purple)] bg-[var(--secondary-purple)] text-white",
  medium: "border-[var(--accent-yellow)] bg-[#fdf3d7] text-[var(--navy-dark)]",
  low: "border-[var(--stroke)] bg-[var(--surface)] text-[#656565]",
};

export const CardMeta = ({ card }: { card: Card }) => {
  if (!card.priority && !card.dueDate && !card.labels.length && !card.assignee) return null;
  const overdue = isOverdue(card);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
      {card.priority && (
        <span className={clsx("rounded-full border px-2 py-0.5 capitalize", priorityStyle[card.priority])}>{card.priority} priority</span>
      )}
      {card.dueDate && (
        <span className={clsx("rounded-full border px-2 py-0.5", overdue ? "border-red-200 bg-red-50 text-red-700" : "border-[var(--stroke)] text-[var(--navy-dark)]")}>
          {overdue ? "Overdue" : "Due"} {formatDue(card.dueDate)}
        </span>
      )}
      {card.labels.map(label => (
        <span key={label} className="rounded-full bg-[#e3f2fa] px-2 py-0.5 text-[#14658c]">{label}</span>
      ))}
      {card.assignee && (
        <span title={`Assigned to ${card.assignee}`} aria-label={`Assigned to ${card.assignee}`}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-[var(--navy-dark)] text-[10px] text-white">
          {initials(card.assignee)}
        </span>
      )}
    </div>
  );
};

export const KanbanCard = ({ card, columnId, columns, participants, disabled, dragDisabled, editing, onDelete, onEdit, onMove, onEditingChange }: KanbanCardProps) => {
  const setEditing = (open: boolean) => onEditingChange(open ? card.id : null);
  const titleInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (editing) titleInput.current?.focus(); }, [editing]);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [priority, setPriority] = useState(card.priority ?? "");
  const [labels, setLabels] = useState(card.labels.join(", "));
  const [assignee, setAssignee] = useState(card.assignee ?? "");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: disabled || dragDisabled || editing });

  const openEditor = () => {
    setTitle(card.title); setDetails(card.details); setDueDate(card.dueDate ?? ""); setPriority(card.priority ?? "");
    setLabels(card.labels.join(", ")); setAssignee(card.assignee ?? "");
    setEditing(true);
  };

  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx("rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]", isDragging && "opacity-60")}
      data-testid={`card-${card.id}`}>
      <div className="flex justify-between gap-2">
        <button id={`drag-${card.id}`} ref={setActivatorNodeRef} type="button" disabled={disabled || dragDisabled || editing}
          {...attributes} {...listeners} aria-label={`Drag ${card.title}`} title={dragDisabled ? "Clear filters to drag" : "Drag to move"}
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
          if (disabled || !title.trim()) return;
          onEdit(card.id, { title: title.trim(), details, dueDate: dueDate || null, priority: (priority || null) as Priority | null,
            labels: parseLabels(labels), assignee: assignee || null });
          setEditing(false);
        }} className="mt-3 space-y-2">
          <label className="block text-sm">Card title<input ref={titleInput} required maxLength={200} disabled={disabled} value={title}
            onChange={event => setTitle(event.target.value)} className={fieldClass} /></label>
          <label className="block text-sm">Card details<textarea maxLength={5000} disabled={disabled} value={details}
            onChange={event => setDetails(event.target.value)} className={fieldClass} /></label>
          <label className="block text-sm">Due date<input type="date" aria-label="Due date" disabled={disabled} value={dueDate}
            onChange={event => setDueDate(event.target.value)} className={fieldClass} /></label>
          <label className="block text-sm">Priority<select aria-label="Priority" disabled={disabled} value={priority}
            onChange={event => setPriority(event.target.value)} className={clsx(fieldClass, "bg-white")}>
            <option value="">None</option>
            {PRIORITIES.map(level => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}
          </select></label>
          <label className="block text-sm">Labels<input aria-label="Labels" disabled={disabled} value={labels} placeholder="Comma separated"
            onChange={event => setLabels(event.target.value)} className={fieldClass} /></label>
          <label className="block text-sm">Assignee<select aria-label="Assignee" disabled={disabled} value={assignee}
            onChange={event => setAssignee(event.target.value)} className={clsx(fieldClass, "bg-white")}>
            <option value="">Unassigned</option>
            {[...new Set([...participants, ...(card.assignee ? [card.assignee] : [])])].map(name => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <button type="submit" disabled={disabled} className="rounded bg-[var(--secondary-purple)] px-3 py-1 text-sm text-white">Save card</button>
          <button type="button" onClick={() => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }} className="ml-2 text-sm">Cancel</button>
        </form>
      ) : (
        <>
          <h3 className="mt-2 font-display text-base font-semibold text-[var(--navy-dark)]">{card.title}</h3>
          {card.details && <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">{card.details}</p>}
          <CardMeta card={card} />
          <button id={`edit-${card.id}`} ref={editButton} type="button" disabled={disabled} aria-label={`Edit ${card.title}`} onClick={openEditor}
            className="mt-3 rounded text-sm text-[var(--secondary-purple)]">Edit</button>
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
