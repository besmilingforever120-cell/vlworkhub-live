"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";
import { Eye, EyeOff } from "lucide-react";

const PASSWORD_HELP = "Use at least 12 characters including uppercase, lowercase, number, and special character.";
type PasswordField = "current" | "new" | "confirm";

export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [focusedField, setFocusedField] = useState<PasswordField | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  function updateCapsLockState(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState("CapsLock"));
  }

  function renderCapsLockWarning(field: PasswordField) {
    if (focusedField !== field || !capsLockOn) {
      return null;
    }

    return (
      <p className="mt-2 text-xs text-amber-300" role="status" aria-live="polite">
        Caps Lock is on
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Fill in all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`${platformLinks.api}/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
        setError(payload?.message || payload?.error || "Failed to update password.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach the API. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-white/10 bg-slate-900/70 p-8">
      <div>
        <label className="mb-2 block text-sm text-slate-300">Current Password</label>
          <div className="relative">
            <input
              ref={currentPasswordRef}
              type={showCurrentPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              onFocus={() => setFocusedField("current")}
              onBlur={() => setFocusedField((field) => (field === "current" ? null : field))}
              onKeyDown={updateCapsLockState}
              onKeyUp={updateCapsLockState}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white outline-none ring-0"
              autoComplete="current-password"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setShowCurrentPassword((value) => !value);
                currentPasswordRef.current?.focus();
              }}
              aria-label={showCurrentPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-300 hover:text-white"
            >
              {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {renderCapsLockWarning("current")}
      </div>
      <div>
        <label className="mb-2 block text-sm text-slate-300">New Password</label>
          <div className="relative">
            <input
              ref={newPasswordRef}
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              onFocus={() => setFocusedField("new")}
              onBlur={() => setFocusedField((field) => (field === "new" ? null : field))}
              onKeyDown={updateCapsLockState}
              onKeyUp={updateCapsLockState}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white outline-none ring-0"
              autoComplete="new-password"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setShowNewPassword((value) => !value);
                newPasswordRef.current?.focus();
              }}
              aria-label={showNewPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-300 hover:text-white"
            >
              {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {renderCapsLockWarning("new")}
      </div>
      <div>
        <label className="mb-2 block text-sm text-slate-300">Confirm New Password</label>
          <div className="relative">
            <input
              ref={confirmPasswordRef}
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onFocus={() => setFocusedField("confirm")}
              onBlur={() => setFocusedField((field) => (field === "confirm" ? null : field))}
              onKeyDown={updateCapsLockState}
              onKeyUp={updateCapsLockState}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white outline-none ring-0"
              autoComplete="new-password"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setShowConfirmPassword((value) => !value);
                confirmPasswordRef.current?.focus();
              }}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-300 hover:text-white"
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {renderCapsLockWarning("confirm")}
      </div>
      <p className="text-xs text-slate-400">{PASSWORD_HELP}</p>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
      >
        {saving ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}
