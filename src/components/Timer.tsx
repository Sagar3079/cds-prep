"use client";

export default function Timer({ seconds }: { seconds: number }) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  const urgent = seconds <= 60;
  return (
    <div
      className={`text-xl font-bold tabular-nums tracking-wider ${
        urgent ? "timer-urgent" : "text-lavender-700"
      }`}
    >
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </div>
  );
}
