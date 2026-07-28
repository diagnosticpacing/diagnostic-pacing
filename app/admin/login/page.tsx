"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || isSubmitting) return;

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "The password was not accepted.");
      window.location.replace("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Administrator sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="adminLoginShell">
      <section className="adminLoginCard" aria-labelledby="admin-login-title">
        <p className="adminEyebrow">Diagnostic Pacing</p>
        <h1 id="admin-login-title">Knowledge-Base Administration</h1>
        <p className="adminLoginIntro">Enter the administrator password to continue.</p>

        <form onSubmit={handleSubmit} className="adminLoginForm">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            required
          />
          {message && <p className="adminLoginError" role="alert">{message}</p>}
          <button type="submit" disabled={isSubmitting || !password}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
