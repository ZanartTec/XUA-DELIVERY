export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#0a1628]">
      {/* Water background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/water-bg.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-60"
      />
      {/* Frost overlay */}
      <div className="pointer-events-none fixed inset-0 bg-white/30 backdrop-blur-[2px]" />

      <div className="relative z-10 flex flex-1 flex-col px-6 py-12 sm:mx-auto sm:w-full sm:max-w-md">
        {children}
      </div>
    </div>
  );
}
