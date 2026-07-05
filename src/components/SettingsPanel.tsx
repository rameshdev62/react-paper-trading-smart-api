"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { Save, Key, HelpCircle, ShieldAlert, CheckCircle2, Trash2, Eye, EyeOff, Clock } from "lucide-react";

export const SettingsPanel: React.FC = () => {
  const { updateCredentials } = useApp();
  const [clientCode, setClientCode] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [configuredState, setConfiguredState] = useState<{
    configured: boolean;
    clientCode: string | null;
    apiKey: string | null;
    totpSecret: string | null;
    updatedAt: string | null;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  const fetchConfigStatus = async () => {
    try {
      const res = await fetch("/api/credentials", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setConfiguredState(data);
        if (data.configured) {
          setClientCode(data.clientCode || "");
        }
      }
    } catch (e) {
      console.error("Failed to load config status:", e);
    }
  };

  useEffect(() => {
    fetchConfigStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientCode || !password || !apiKey || !totpSecret) {
      setStatusMessage({ type: "error", text: "All fields are required to update credentials." });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      await updateCredentials({
        clientCode,
        password,
        apiKey,
        totpSecret,
      });
      setStatusMessage({ type: "success", text: "Angel One credentials saved and validated successfully!" });
      setPassword("");
      fetchConfigStatus();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to validate credentials with Angel One." });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Remove all Angel One credentials from this device?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/credentials", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!res.ok) throw new Error("Failed to clear credentials");
      setConfiguredState({ configured: false, clientCode: null, apiKey: null, totpSecret: null, updatedAt: null });
      setClientCode("");
      setPassword("");
      setApiKey("");
      setTotpSecret("");
      setStatusMessage({ type: "success", text: "Credentials cleared." });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Settings Form */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
        <div>
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-400" />
            Angel One SmartAPI Configuration
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure your Angel One credentials to enable live market quote feeds
          </p>
        </div>

        {/* ── Current Configuration Summary ── */}
        {configuredState?.configured && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Current Configuration</h4>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-slate-500">Client Code</span>
                <p className="text-slate-200 font-mono font-bold">{configuredState.clientCode}</p>
              </div>
              <div>
                <span className="text-slate-500">API Key</span>
                <p className="text-slate-200 font-mono">{configuredState.apiKey}</p>
              </div>
              <div>
                <span className="text-slate-500">TOTP Secret</span>
                <p className="text-slate-200 font-mono">{configuredState.totpSecret}</p>
              </div>
              <div>
                <span className="text-slate-500">Last Updated</span>
                <p className="text-slate-200 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {formatDate(configuredState.updatedAt)}
                </p>
              </div>
            </div>
          </div>
        )}

        {configuredState?.configured && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs text-slate-300">
              Live Feed credentials configured for client code: <strong className="text-emerald-400">{configuredState.clientCode}</strong>.
              To update, fill in the form below and re-authenticate.
            </span>
          </div>
        )}

        {statusMessage && (
          <div
            className={`text-xs px-4 py-3 rounded-lg border ${
              statusMessage.type === "success"
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/5 border-rose-500/20 text-rose-400"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                Client Code
              </label>
              <input
                type="text"
                placeholder="e.g. S123456"
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                Password
              </label>
              <input
                type={showSecrets ? "text" : "password"}
                placeholder="Angel One Login PIN/Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                Developer API Key
              </label>
              <input
                type={showSecrets ? "text" : "password"}
                placeholder="SmartAPI App API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                TOTP Secret Key (QR Secret)
              </label>
              <input
                type={showSecrets ? "text" : "password"}
                placeholder="e.g. ABCDEFGHIJKLMNOP"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs py-2.5 px-6 rounded-lg shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:bg-slate-800 disabled:text-slate-500 uppercase tracking-wider transition-all cursor-pointer"
            >
              {loading ? (
                "Validating..."
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save & Authenticate
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer px-3 py-2"
            >
              {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecrets ? "Hide" : "Show"} secret fields
            </button>

            {configuredState?.configured && (
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="flex items-center gap-1.5 text-[10px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer px-3 py-2 ml-auto"
              >
                <Trash2 className="w-3 h-3" />
                Clear Credentials
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Setup Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4 text-slate-300">
        <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
          <HelpCircle className="w-4 h-4 text-sky-400" />
          API Setup Guide
        </h3>

        <div className="flex flex-col gap-3.5 text-xs text-slate-400">
          <div className="flex gap-2">
            <span className="font-bold text-emerald-400">1.</span>
            <p>
              Create a free developer account on the{" "}
              <a
                href="https://smartapi.angelbroking.com/"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                Angel One SmartAPI Portal
              </a>
              .
            </p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-emerald-400">2.</span>
            <p>Create a new App in the dashboard. Choose a "WebSocket" type app. Copy your <strong className="text-slate-200">API Key</strong>.</p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-emerald-400">3.</span>
            <p>
              Enable 2FA (TOTP) on your retail trading app or by visiting{" "}
              <a
                href="https://smartapi.angelone.in/enable-totp"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                SmartAPI Enable TOTP
              </a>
              . Save the <strong className="text-slate-200">Secret Key</strong> shown during setup.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-emerald-400">4.</span>
            <p>Fill in the form above. Our backend generates TOTP codes on login and manages the WebSocket stream session.</p>
          </div>

          <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3 mt-2">
            <h4 className="font-bold text-[10px] text-rose-400 uppercase flex items-center gap-1.5 mb-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Security Warning
            </h4>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Never share your API Key or TOTP secrets. Credentials are saved locally in your device's database and are only used to authenticate with Angel One for live data feeds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
