"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ShieldCheck, Mail, Lock, Sparkles, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, token, loading } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!loading && token) {
      router.push("/dashboard");
    }
  }, [token, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Email and password are required.");
      return;
    }

    setAuthLoading(true);
    setErrorMsg("");

    try {
      await login(email, password);
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed. Please check credentials.");
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-80 h-80 bg-teal-500/10 rounded-full blur-[100px] -bottom-20 -right-20 pointer-events-none" />

      <div className="max-w-md w-full flex flex-col gap-6 z-10">
        <div className="text-center">
          <div className="inline-flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-600 p-3 rounded-2xl text-white font-extrabold shadow-lg shadow-emerald-500/25 mb-4 text-xl">
            SmartPT
          </div>
          <h2 className="text-3xl font-extrabold text-slate-100 tracking-tight">
            Welcome to SmartPT
          </h2>
          <p className="text-sm text-slate-500 mt-2 flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Learn trading risk-free with simulated cash
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/45">
          {errorMsg && (
            <div className="mb-4 text-xs font-semibold bg-rose-500/5 border border-rose-500/25 text-rose-400 px-4 py-3 rounded-lg">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 w-4 h-4 text-slate-655" />
                <input
                  type="email"
                  required
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-200 focus:outline-none placeholder-slate-700 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-slate-655" />
                <input
                  type="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-200 focus:outline-none placeholder-slate-700 font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs py-3 rounded-lg shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/25 disabled:bg-slate-800 disabled:text-slate-655 uppercase tracking-wider transition-all cursor-pointer mt-2"
            >
              {authLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Access Simulator
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
