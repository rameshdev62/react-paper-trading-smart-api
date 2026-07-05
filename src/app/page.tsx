"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { token, loading } = useApp();

  useEffect(() => {
    if (!loading) {
      if (token) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }
  }, [token, loading, router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <span className="text-sm font-semibold tracking-wide text-slate-400">Loading Smart Trading...</span>
      </div>
    </div>
  );
}
