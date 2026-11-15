"use client";

import { useState, useRef, useEffect } from "react";
import { Lock, X } from "lucide-react";
import { APP_CONFIG } from "@/lib/config";

interface Props {
  mode?: "admin" | "player";
  onSuccess: (role: "admin" | "player") => void;
  onClose: () => void;
}

export default function AdminPinModal({ mode = "admin", onSuccess, onClose }: Props) {
  const [pin, setPin] = useState(["", "", "", ""]);
  const [shake, setShake] = useState(false);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    refs[0].current?.focus();
  }, []);

  function handleDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[index] = digit;
    setPin(next);

    if (digit && index < 3) {
      refs[index + 1].current?.focus();
    }

    if (index === 3 && digit) {
      const entered = [...next].join("");
      if (entered === APP_CONFIG.adminPin) {
        onSuccess("admin");
      } else if (mode === "player" && entered === APP_CONFIG.playerPin) {
        onSuccess("player");
      } else {
        setShake(true);
        setTimeout(() => {
          setPin(["", "", "", ""]);
          setShake(false);
          refs[0].current?.focus();
        }, 600);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
      <div className="bg-white rounded-3xl w-full max-w-xs p-8 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <div className="flex justify-center mb-5">
          <div className="bg-emerald-100 rounded-full p-4">
            <Lock className="text-emerald-600" size={28} />
          </div>
        </div>

        <h2 className="text-center text-xl font-bold mb-1">
          {mode === "player" ? "Player Access" : "Admin Access"}
        </h2>
        <p className="text-center text-sm text-gray-500 mb-7">
          {mode === "player"
            ? "Enter the 4-digit Player PIN to add a player"
            : "Enter the 4-digit Admin PIN to continue"}
        </p>

        <div
          className={`flex justify-center gap-4 mb-2 ${shake ? "animate-bounce" : ""}`}
          style={shake ? { animation: "shake 0.4s ease-in-out" } : {}}
        >
          {pin.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-14 h-14 text-center text-2xl font-bold rounded-2xl border-2 outline-none transition-colors
                ${d ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-gray-50"}
                ${shake ? "border-red-400 bg-red-50" : ""}
                focus:border-emerald-500`}
            />
          ))}
        </div>
        {shake && (
          <p className="text-center text-xs text-red-500 mt-2">Incorrect PIN — try again</p>
        )}

        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-8px); }
            40%, 80% { transform: translateX(8px); }
          }
        `}</style>
      </div>
    </div>
  );
}
