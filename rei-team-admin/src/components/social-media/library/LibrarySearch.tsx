"use client";
import { useEffect, useState } from "react";
import { Input } from "@/src/components/ui";

export function LibrarySearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(local);
    }, 300);
    return () => clearTimeout(timer);
  }, [local, onChange]);

  return (
    <Input
      type="search"
      placeholder="Search posts…"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      className="max-w-xs"
    />
  );
}
