export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary via-accent to-primary/80 px-4">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">{children}</div>
    </div>
  );
}
