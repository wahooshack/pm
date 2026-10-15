import { useEffect, useState } from "react";
import { api, ApiError, type User } from "@/lib/api";

type AdminPanelProps = { user: User; onSessionExpired: () => void };
type Update = { isActive?: boolean; isAdmin?: boolean; password?: string };

const action = "rounded-full border border-[var(--stroke)] px-3 py-1 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]";

export const AdminPanel = ({ user, onSessionExpired }: AdminPanelProps) => {
  const [users, setUsers] = useState<User[] | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<User[]>("/api/admin/users", undefined, controller.signal).then(setUsers).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      setMessage({ text: cause instanceof ApiError ? cause.message : "Unable to load users.", error: true });
    });
    return () => controller.abort();
  }, [onSessionExpired]);

  const update = async (username: string, changes: Update, done: string) => {
    setBusy(true); setMessage(null);
    try {
      const saved = await api<User>(`/api/admin/users/${encodeURIComponent(username)}`, changes);
      setUsers(current => current?.map(entry => entry.username === username ? saved : entry) ?? null);
      setMessage({ text: done, error: false });
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      setMessage({ text: cause instanceof ApiError ? cause.message : "The change could not be saved.", error: true });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">Administration</p>
        <h2 className="mt-1 font-display text-3xl font-semibold text-[var(--navy-dark)]">Users</h2>
        <p className="mt-1 text-sm text-[var(--gray-text)]">Disabling a user or resetting their password signs them out everywhere.</p>
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm font-medium text-red-700" : "text-sm font-medium text-[var(--navy-dark)]"}>{message.text}</p>
      )}
      {users === null && !message && <p role="status">Loading users...</p>}
      {users && (
        <div className="overflow-x-auto rounded-3xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.15em] text-[var(--gray-text)]">
              <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--stroke)]">
              {users.map(entry => {
                const self = entry.username === user.username;
                return (
                  <tr key={entry.username}>
                    <td className="px-4 py-3"><span className="font-semibold text-[var(--navy-dark)]">{entry.displayName}</span> <span className="text-[var(--gray-text)]">@{entry.username}</span></td>
                    <td className="px-4 py-3">{entry.isAdmin ? "Admin" : "Member"}</td>
                    <td className="px-4 py-3">{entry.isActive ? "Active" : <span className="font-semibold text-red-700">Disabled</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" disabled={busy || self} className={action} aria-label={`${entry.isActive ? "Disable" : "Enable"} ${entry.username}`}
                          onClick={() => void update(entry.username, { isActive: !entry.isActive }, `${entry.username} ${entry.isActive ? "disabled" : "enabled"}.`)}>
                          {entry.isActive ? "Disable" : "Enable"}
                        </button>
                        <button type="button" disabled={busy || self} className={action} aria-label={`${entry.isAdmin ? "Remove admin from" : "Make admin"} ${entry.username}`}
                          onClick={() => void update(entry.username, { isAdmin: !entry.isAdmin }, `${entry.username} is now ${entry.isAdmin ? "a member" : "an admin"}.`)}>
                          {entry.isAdmin ? "Remove admin" : "Make admin"}
                        </button>
                        {resetting === entry.username ? (
                          <form className="flex items-center gap-2" onSubmit={async event => {
                            event.preventDefault();
                            if (await update(entry.username, { password }, `Password reset for ${entry.username}.`)) { setResetting(null); setPassword(""); }
                          }}>
                            <input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={100}
                              aria-label={`New password for ${entry.username}`} autoComplete="new-password"
                              className="w-40 rounded-xl border border-[var(--stroke)] px-2 py-1" />
                            <button type="submit" disabled={busy} className={action}>Set</button>
                            <button type="button" onClick={() => { setResetting(null); setPassword(""); }} className="text-sm text-[var(--gray-text)]">Cancel</button>
                          </form>
                        ) : (
                          <button type="button" disabled={busy || self} className={action} aria-label={`Reset password for ${entry.username}`}
                            onClick={() => { setResetting(entry.username); setPassword(""); }}>
                            Reset password
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};
