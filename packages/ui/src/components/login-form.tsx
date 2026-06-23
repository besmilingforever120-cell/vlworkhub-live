"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { platformLinks } from "@vlworkhub/config";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [capsLockKnown, setCapsLockKnown] = useState(false);

  function handlePasswordCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState("CapsLock"));
    setCapsLockKnown(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Enter both email and password.");
      return;
    }

    setLoading(true);
    setError("");

    let response: Response;

    try {
      response = await fetch(`${platformLinks.api}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password })
      });
    } catch {
      setLoading(false);
      setError(`Unable to reach the API at ${platformLinks.api}. Start the API server and try again.`);
      return;
    }

    setLoading(false);

    if (!response.ok) {
      console.error("Login failed");
      try {
        const data = await response.json();
        setError(data.message || "Authentication failed. Check credentials and API configuration.");
      } catch {
        setError("Authentication failed. Check credentials and API configuration.");
      }
      return;
    }

    let payload: { mustChangePassword?: boolean } = {};
    try {
      payload = (await response.json()) as { mustChangePassword?: boolean };
    } catch {
      payload = {};
    }

    router.push(payload.mustChangePassword ? "/change-password" : "/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-white/10 bg-slate-900/70 p-8">
      <div>
        <label className="mb-2 block text-sm text-slate-300">Email</label>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-0"
          autoComplete="username"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm text-slate-300">Password</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={handlePasswordCapsLock}
            onKeyUp={handlePasswordCapsLock}
            onBlur={() => {
              setCapsLockOn(false);
              setCapsLockKnown(false);
            }}
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white outline-none ring-0"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-300 hover:text-white focus-visible:outline-none"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {capsLockKnown && capsLockOn ? (
        <p className="text-xs text-amber-300" role="status" aria-live="polite">
          Caps Lock is on
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign in to VLWorkHub"}
      </button>
    </form>
  );
}
