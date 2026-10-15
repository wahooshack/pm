import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";

type Member = { username: string; displayName: string; role: "editor" | "viewer" };
type MembersPanelProps = { boardId: number; boardName: string; onClose: (changed: boolean) => void; onSessionExpired: () => void };

const selectClass = "rounded-xl border border-[var(--stroke)] bg-white px-2 py-1.5 text-sm";

export const MembersPanel = ({ boardId, boardName, onClose, onSessionExpired }: MembersPanelProps) => {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Member["role"]>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const url = `/api/boards/${boardId}/members`;

  useEffect(() => {
    const controller = new AbortController();
    api<Member[]>(url, undefined, controller.signal).then(setMembers).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      setError(cause instanceof ApiError ? cause.message : "Unable to load members.");
    });
    return () => controller.abort();
  }, [url, onSessionExpired]);

  const update = async (request: () => Promise<Member[]>) => {
    setBusy(true); setError(null);
    try {
      setMembers(await request()); setChanged(true);
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      setError(cause instanceof ApiError ? cause.message : "The change could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = username.trim().toLowerCase();
    if (name && await update(() => api<Member[]>(url, { username: name, role }))) setUsername("");
  };

  return (
    <section role="dialog" aria-label="Share board" className="mx-auto mt-4 max-w-[1800px] px-6">
      <div className="rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">Share</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">{boardName}</h2>
            <p className="mt-1 text-sm text-[var(--gray-text)]">Editors can change cards and columns; viewers can only read.</p>
          </div>
          <button type="button" onClick={() => onClose(changed)} className="rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--navy-dark)]">Done</button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p>}
        <form onSubmit={add} className="mt-4 flex flex-wrap items-center gap-2">
          <input value={username} onChange={event => setUsername(event.target.value)} required maxLength={32}
            aria-label="Username to share with" placeholder="Username"
            className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]" />
          <select aria-label="Role for new member" value={role} onChange={event => setRole(event.target.value as Member["role"])} className={selectClass}>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button type="submit" disabled={busy} className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white">Add member</button>
        </form>
        {members === null && !error && <p role="status" className="mt-4 text-sm">Loading members...</p>}
        {members?.length === 0 && <p className="mt-4 text-sm text-[var(--gray-text)]">Only you can see this board.</p>}
        {!!members?.length && (
          <ul className="mt-4 divide-y divide-[var(--stroke)]" aria-label="Board members">
            {members.map(member => (
              <li key={member.username} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-semibold text-[var(--navy-dark)]">{member.displayName}</span>
                <span className="text-[var(--gray-text)]">@{member.username}</span>
                <select aria-label={`Role for ${member.username}`} value={member.role} disabled={busy} className={`${selectClass} ml-auto`}
                  onChange={event => void update(() => api<Member[]>(url, { username: member.username, role: event.target.value }))}>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="button" disabled={busy} aria-label={`Remove ${member.username}`}
                  onClick={() => void update(() => api<Member[]>(`${url}/${encodeURIComponent(member.username)}`, {}, undefined, "DELETE"))}
                  className="rounded-full border border-[var(--stroke)] px-3 py-1 text-sm hover:border-red-300 hover:text-red-700">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
