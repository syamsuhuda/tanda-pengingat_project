"use client";

export function sanitizeNumericPin6(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export function PinSixDotIndicator({ length }: { length: number }) {
  const clamped = Math.max(0, Math.min(length, 6));
  return (
    <div className="mt-2.5 flex items-center justify-center gap-2" aria-hidden="true">
      {Array.from({ length: 6 }, (_, idx) => {
        const filled = idx < clamped;
        return (
          <span
            key={idx}
            className={`h-2.5 w-2.5 rounded-full transition-all duration-150 ${
              filled
                ? "scale-110 bg-[var(--accent)]"
                : "bg-[var(--border-control)]/45"
            }`}
          />
        );
      })}
    </div>
  );
}
