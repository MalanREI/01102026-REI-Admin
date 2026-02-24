"use client";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/src/components/ui";

export function LibrarySearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  // Keep a ref to the latest onChange to avoid adding it as an effect dependency
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChangeRef.current(local);
    }, 300);
    return () => clearTimeout(timer);
  }, [local]);

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
