"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { X, Key, ShieldAlert, CheckCircle, ExternalLink, Loader2, Sparkles } from "lucide-react";

interface ShoonyaConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShoonyaConnectModal: React.FC<ShoonyaConnectModalProps> = ({ isOpen, onClose }) => {
  const { loginToShoonya } = useApp();
  
  const [userId, setUserId] = useState("");
  const [clientId, setClientId] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [authCode, setAuthCode] = useState("");

  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  // Auto-fill client credentials from environment/defaults if they are set on client side
  useEffect(() => {
    if (!isOpen) return;

    fetch("/api/shoonya/config")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load environment credentials");
        return res.json();
      })
      .then((data) => {
        if (data.userId) setUserId(data.userId);
        if (data.clientId) setClientId(data.clientId);
        if (data.secretCode) setSecretCode(data.secretCode);
        if (data.isConfigured !== undefined) setIsConfigured(data.isConfigured);
      })
      .catch((err) => {
        console.warn("[ShoonyaConnectModal] Could not fetch server-side environment values:", err);
        setUserId(process.env.NEXT_PUBLIC_SHOONYA_USER_ID || "");
        setClientId(process.env.NEXT_PUBLIC_SHOONYA_CLIENT_ID || "");
      });
  }, [isOpen]);

  const handleAutoLogin = async () => {
    setLoading(true);
    setErrorMsg("");
    setSuccess(false);

    try {
      await loginToShoonya(undefined, undefined, undefined, undefined, true);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Automated credentials login failed. Please check your .env settings.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authCode) {
      setErrorMsg("Authorization code is required.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccess(false);

    try {
      await loginToShoonya(authCode, secretCode || undefined, clientId || undefined, userId || undefined);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to exchange authorization code. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  const getAuthorizeUrl = () => {
    const client_id = clientId || "<your_api_key>";
    return `https://api.shoonya.com/OAuthlogin/authorize/oauth?client_id=${client_id}`;
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Modal Card */}
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col">
        {/* Glow Effects */}
        <div className="absolute w-60 h-60 bg-emerald-500/10 rounded-full blur-[80px] -top-10 -left-10 pointer-events-none" />
        <div className="absolute w-60 h-60 bg-teal-500/10 rounded-full blur-[80px] -bottom-10 -right-10 pointer-events-none" />

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800/80 z-10">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-1.5 rounded-lg text-white font-bold">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                Connect Shoonya API
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              </h2>
              <p className="text-[10px] text-slate-505 mt-0.5 font-medium">Link your Finvasia live account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 hover:bg-slate-800 border border-transparent hover:border-slate-700/50 rounded-lg text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 z-10 overflow-y-auto max-h-[75vh]">
          {errorMsg && (
            <div className="text-xs bg-rose-500/5 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl flex items-start gap-2.5 font-medium leading-relaxed">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {success && (
            <div className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl flex items-start gap-2.5 font-bold leading-relaxed">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400 animate-bounce" />
              <span>Shoonya connected successfully! Activating live feed desk...</span>
            </div>
          )}

          {/* Programmatic auto-login helper */}
          {isConfigured && (
            <div className="bg-slate-955 border border-emerald-500/10 rounded-xl p-4 flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="relative flex h-2 w-2 mt-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Programmatic Auto Login Available</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    A complete set of credentials has been detected in your server&apos;s <code className="text-emerald-400 font-mono">.env</code> configuration. Click below to automatically connect without a browser.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAutoLogin}
                disabled={loading || success}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/25 hover:border-emerald-500/40 font-bold text-xs py-2 rounded-lg transition-all cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                )}
                <span>One-Click Programmatic Login</span>
              </button>
            </div>
          )}



          <div className="border-t border-slate-800/80 my-1 pt-4">
            <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2">
              <span>Step 1: Get Authorization Code</span>
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-3 font-medium">
              Click the button below to authorize. Once logged in, copy the <code className="text-emerald-400 font-bold font-mono bg-slate-950 px-1 py-0.5 rounded">code=...</code> parameter from the redirect browser URL and paste it below.
            </p>
            <a
              href={getAuthorizeUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 text-slate-300 font-bold text-xs px-4 py-2.5 rounded-lg border border-slate-700/50 hover:border-emerald-500/25 transition-all shadow-md cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Shoonya Login Portal
            </a>
          </div>

          <div className="border-t border-slate-800/80 pt-4">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
              Step 2: Paste Authorization Code
            </label>
            <input
              type="text"
              required
              placeholder="Paste the redirect code (e.g. 5f98cfad45a...)"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.trim())}
              disabled={loading || success}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-200 focus:outline-none placeholder-slate-700 font-medium transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs py-3 rounded-lg shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:bg-slate-800 disabled:from-slate-850 disabled:to-slate-850 disabled:text-slate-600 uppercase tracking-wider transition-all cursor-pointer mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating Connection...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Authenticate & Connect
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
