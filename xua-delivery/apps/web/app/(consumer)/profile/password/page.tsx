"use client";

import { PageHeader } from "@/src/components/shared/page-header";
import { ChangePasswordForm } from "@/src/components/shared/change-password-form";

export default function ConsumerPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader back="/profile" title="Alterar senha" description="Depois de trocar, você entra de novo com a nova senha." />
      <div className="px-4 pb-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
