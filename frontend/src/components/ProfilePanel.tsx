import { useState, type FormEvent } from "react";
import { api, ApiError, type User } from "@/lib/api";

type ProfilePanelProps = { user: User; onUserChange: (user: User) => void; onSessionExpired: () => void };

const input = "mt-1 block w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]";
const card = "rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]";
const submit = "mt-4 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white";

export const ProfilePanel = ({ user, onUserChange, onSessionExpired }: ProfilePanelProps) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string>) => {
    setBusy(true); setMessage(null);
    try {
      setMessage({ text: await action(), error: false });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      setMessage({ text: cause instanceof ApiError ? cause.message : "The change could not be saved.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      onUserChange(await api<User>("/api/me", { displayName }));
      return "Display name saved.";
    });
  };

  const savePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (next !== confirm) { setMessage({ text: "New passwords do not match.", error: true }); return; }
    void run(async () => {
      await api("/api/me/password", { currentPassword: current, newPassword: next });
      setCurrent(""); setNext(""); setConfirm("");
      return "Password changed. Other sessions were signed out.";
    });
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">Profile</p>
        <h2 className="mt-1 font-display text-3xl font-semibold text-[var(--navy-dark)]">@{user.username}</h2>
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"}
          className={message.error ? "text-sm font-medium text-red-700" : "text-sm font-medium text-[var(--navy-dark)]"}>{message.text}</p>
      )}
      <form onSubmit={saveName} className={card}>
        <label className="block text-sm font-medium text-[var(--navy-dark)]">Display name
          <input value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={60} className={input} />
        </label>
        <button type="submit" disabled={busy} className={submit}>Save name</button>
      </form>
      <form onSubmit={savePassword} className={card}>
        <h3 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Change password</h3>
        <label className="mt-3 block text-sm font-medium text-[var(--navy-dark)]">Current password
          <input type="password" value={current} onChange={event => setCurrent(event.target.value)} required maxLength={100}
            autoComplete="current-password" className={input} />
        </label>
        <label className="mt-3 block text-sm font-medium text-[var(--navy-dark)]">New password
          <input type="password" value={next} onChange={event => setNext(event.target.value)} required minLength={8} maxLength={100}
            autoComplete="new-password" className={input} />
        </label>
        <label className="mt-3 block text-sm font-medium text-[var(--navy-dark)]">Confirm new password
          <input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} required maxLength={100}
            autoComplete="new-password" className={input} />
        </label>
        <button type="submit" disabled={busy} className={submit}>Change password</button>
      </form>
    </main>
  );
};
