import type { Metadata } from "next";

export const metadata: Metadata = {
  appleWebApp: {
    statusBarStyle: "black-translucent",
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-transparent">
      {children}
    </div>
  );
}
