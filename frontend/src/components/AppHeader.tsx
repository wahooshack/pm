import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { BoardSummary } from "@/lib/kanban";
import type { User } from "@/lib/api";

export type View = "board" | "profile" | "admin";

type AppHeaderProps = {
  user: User;
  view: View;
  onView: (view: View) => void;
  boards: BoardSummary[];
  currentId: number | null;
  busy: boolean;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onDelete: () => void;
  onShare: () => void;
  onLogout: () => void;
  children?: ReactNode;
};

const pill = "rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]";

export const AppHeader = ({ user, view, onView, boards, currentId, busy, onSelect, onCreate, onDelete, onShare, onLogout, children }: AppHeaderProps) => {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (creating) nameInput.current?.focus(); }, [creating]);
  const current = boards.find(board => board.id === currentId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    onCreate(name.trim());
    setName(""); setCreating(false);
  };

  return (
    <header className="border-b border-[var(--stroke)] bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-4 px-6 py-4">
        <h1 className="font-display text-xl font-semibold text-[var(--navy-dark)]">Kanban Studio</h1>
        <span className="h-6 w-px bg-[var(--stroke)]" />
        {boards.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Board
            <select aria-label="Board" value={currentId ?? ""} disabled={busy} onChange={event => onSelect(Number(event.target.value))}
              className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[var(--navy-dark)]">
              {boards.map(board => (
                <option key={board.id} value={board.id}>
                  {board.role === "owner" ? board.name : `${board.name} (${board.owner}, ${board.role})`}
                </option>
              ))}
            </select>
          </label>
        )}
        {creating ? (
          <form onSubmit={submit} className="flex items-center gap-2">
            <input ref={nameInput} value={name} onChange={event => setName(event.target.value)} maxLength={100} required
              aria-label="New board name" placeholder="Board name"
              className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]" />
            <button type="submit" disabled={busy} className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white">Create</button>
            <button type="button" onClick={() => { setCreating(false); setName(""); }} className="text-sm text-[var(--gray-text)]">Cancel</button>
          </form>
        ) : (
          <button type="button" disabled={busy} onClick={() => setCreating(true)} className={pill}>New board</button>
        )}
        {current?.role === "owner" && (
          <button type="button" disabled={busy} onClick={onShare} className={pill}>Share</button>
        )}
        {current?.role === "owner" && (
          <button type="button" disabled={busy} onClick={onDelete} className={`${pill} hover:border-red-300 hover:text-red-700`}>Delete board</button>
        )}
        {children}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-[var(--gray-text)]">Signed in as <strong className="text-[var(--navy-dark)]">{user.displayName}</strong></span>
          <nav aria-label="Account" className="flex items-center gap-2">
            {view !== "board" && <button type="button" onClick={() => onView("board")} className={pill}>Back to board</button>}
            <button type="button" aria-current={view === "profile" ? "page" : undefined} onClick={() => onView("profile")} className={pill}>Profile</button>
            {user.isAdmin && (
              <button type="button" aria-current={view === "admin" ? "page" : undefined} onClick={() => onView("admin")} className={pill}>Admin</button>
            )}
          </nav>
          <button type="button" onClick={onLogout} className={pill}>Log out</button>
        </div>
      </div>
    </header>
  );
};
