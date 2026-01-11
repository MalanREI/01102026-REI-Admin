import { ReactNode } from "react";

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-lg border px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-gray-300",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-lg border px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-gray-300",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const variant = props.variant ?? "primary";
  const base =
    "rounded-lg px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-black"
      : "bg-transparent hover:bg-gray-100 border";
  return <button {...props} className={[base, styles, props.className ?? ""].join(" ")} />;
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border bg-gray-50 px-2 py-0.5 text-xs">{children}</span>;
}
