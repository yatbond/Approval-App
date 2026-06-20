export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0f1113] text-neutral-100">
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-md border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-semibold">Approval App</p>
          <p className="mt-2 text-sm text-neutral-400">Loading workspace</p>
        </div>
      </div>
    </div>
  );
}
