"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@vlworkhub.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    let response: Response;

    try {
      response = await fetch(`${platformLinks.api}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
    } catch {
      setLoading(false);
      setError(`Unable to reach the API at ${platformLinks.api}. Start the API server and try again.`);
      return;
    }

    setLoading(false);

    if (!response.ok) {
      setError("Authentication failed. Check credentials and API configuration.");
      return;
    }

    router.push("/dashboard");
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
        />
      </div>
      <div>
        <label className="mb-2 block text-sm text-slate-300">Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-0"
        />
      </div>
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
