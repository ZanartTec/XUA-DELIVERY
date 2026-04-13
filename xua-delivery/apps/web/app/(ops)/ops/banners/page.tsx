"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Image, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type BannerType = "CAROUSEL" | "FEATURED";

interface BannerItem {
  id: string;
  type: BannerType;
  title: string;
  subtitle: string | null;
  tag: string | null;
  highlight: string | null;
  cta_text: string | null;
  cta_url: string | null;
  bg_color: string | null;
  bg_gradient_from: string | null;
  bg_gradient_to: string | null;
  bg_image_url: string | null;
  text_color: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BannerDraft {
  type: BannerType;
  title: string;
  subtitle: string;
  tag: string;
  highlight: string;
  cta_text: string;
  cta_url: string;
  bg_color: string;
  bg_gradient_from: string;
  bg_gradient_to: string;
  bg_image_url: string;
  text_color: string;
  image_url: string;
  sort_order: number;
}

const EMPTY_DRAFT: BannerDraft = {
  type: "CAROUSEL",
  title: "",
  subtitle: "",
  tag: "",
  highlight: "",
  cta_text: "",
  cta_url: "",
  bg_color: "",
  bg_gradient_from: "",
  bg_gradient_to: "",
  bg_image_url: "",
  text_color: "",
  image_url: "",
  sort_order: 0,
};

function draftFromBanner(b: BannerItem): BannerDraft {
  return {
    type: b.type,
    title: b.title,
    subtitle: b.subtitle ?? "",
    tag: b.tag ?? "",
    highlight: b.highlight ?? "",
    cta_text: b.cta_text ?? "",
    cta_url: b.cta_url ?? "",
    bg_color: b.bg_color ?? "",
    bg_gradient_from: b.bg_gradient_from ?? "",
    bg_gradient_to: b.bg_gradient_to ?? "",
    bg_image_url: b.bg_image_url ?? "",
    text_color: b.text_color ?? "",
    image_url: b.image_url ?? "",
    sort_order: b.sort_order,
  };
}

function draftToPayload(d: BannerDraft) {
  return {
    type: d.type,
    title: d.title,
    subtitle: d.subtitle || null,
    tag: d.tag || null,
    highlight: d.highlight || null,
    cta_text: d.cta_text || null,
    cta_url: d.cta_url || null,
    bg_color: d.bg_color || null,
    bg_gradient_from: d.bg_gradient_from || null,
    bg_gradient_to: d.bg_gradient_to || null,
    bg_image_url: d.bg_image_url || null,
    text_color: d.text_color || null,
    image_url: d.image_url || null,
    sort_order: d.sort_order,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function OpsBannersPage() {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<BannerDraft>({ ...EMPTY_DRAFT });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BannerDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/banners/all")
      .then((r) => r.json())
      .then((data) => setBanners(data.banners ?? []))
      .catch(() => toast.error("Erro ao carregar banners"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!draft.title.trim()) {
      toast.error("Informe o titulo do banner");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBanners((prev) => [...prev, data.banner]);
      setDraft({ ...EMPTY_DRAFT });
      setCreating(false);
      toast.success("Banner criado");
    } catch {
      toast.error("Erro ao criar banner");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editDraft.title.trim()) {
      toast.error("Informe o titulo do banner");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/banners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(editDraft)),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBanners((prev) => prev.map((b) => (b.id === id ? data.banner : b)));
      setEditId(null);
      toast.success("Banner atualizado");
    } catch {
      toast.error("Erro ao atualizar banner");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(banner: BannerItem) {
    try {
      const res = await fetch(`/api/banners/${banner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !banner.is_active }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? data.banner : b)));
      toast.success(data.banner.is_active ? "Banner ativado" : "Banner desativado");
    } catch {
      toast.error("Erro ao alterar status");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/banners/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setBanners((prev) => prev.filter((b) => b.id !== id));
      toast.success("Banner removido");
    } catch {
      toast.error("Erro ao remover banner");
    }
  }

  function renderDraftForm(d: BannerDraft, onChange: (v: BannerDraft) => void) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <select
            value={d.type}
            onChange={(e) => onChange({ ...d, type: e.target.value as BannerType })}
            className="w-full rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm"
          >
            <option value="CAROUSEL">Carousel</option>
            <option value="FEATURED">Featured</option>
          </select>
        </Field>
        <Field label="Ordem">
          <Input
            type="number"
            value={d.sort_order}
            onChange={(e) => onChange({ ...d, sort_order: Number(e.target.value) || 0 })}
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Titulo *">
          <Input
            value={d.title}
            onChange={(e) => onChange({ ...d, title: e.target.value })}
            placeholder="Titulo do banner"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Subtitulo">
          <Input
            value={d.subtitle}
            onChange={(e) => onChange({ ...d, subtitle: e.target.value })}
            placeholder="Subtitulo"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Tag">
          <Input
            value={d.tag}
            onChange={(e) => onChange({ ...d, tag: e.target.value })}
            placeholder="Ex: Novo"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Destaque">
          <Input
            value={d.highlight}
            onChange={(e) => onChange({ ...d, highlight: e.target.value })}
            placeholder="Texto de destaque"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="CTA texto">
          <Input
            value={d.cta_text}
            onChange={(e) => onChange({ ...d, cta_text: e.target.value })}
            placeholder="Ex: Saiba mais"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="CTA URL">
          <Input
            value={d.cta_url}
            onChange={(e) => onChange({ ...d, cta_url: e.target.value })}
            placeholder="https://..."
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Cor de fundo">
          <Input
            value={d.bg_color}
            onChange={(e) => onChange({ ...d, bg_color: e.target.value })}
            placeholder="#FFFFFF"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Cor do texto">
          <Input
            value={d.text_color}
            onChange={(e) => onChange({ ...d, text_color: e.target.value })}
            placeholder="#000000"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Gradiente de">
          <Input
            value={d.bg_gradient_from}
            onChange={(e) => onChange({ ...d, bg_gradient_from: e.target.value })}
            placeholder="#1B4A9A"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="Gradiente ate">
          <Input
            value={d.bg_gradient_to}
            onChange={(e) => onChange({ ...d, bg_gradient_to: e.target.value })}
            placeholder="#5697E9"
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="URL imagem do banner">
          <Input
            value={d.image_url}
            onChange={(e) => onChange({ ...d, image_url: e.target.value })}
            placeholder="https://..."
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
        <Field label="URL imagem de fundo">
          <Input
            value={d.bg_image_url}
            onChange={(e) => onChange({ ...d, bg_image_url: e.target.value })}
            placeholder="https://..."
            className="rounded-xl border-[#d9dde3] text-sm"
          />
        </Field>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Banners</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Banners</h1>
        {!creating && (
          <Button
            size="sm"
            className="rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none font-semibold"
            onClick={() => { setCreating(true); setEditId(null); }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold font-heading">Novo banner</p>
            <button type="button" onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {renderDraftForm(draft, setDraft)}
          <Button
            disabled={saving}
            onClick={handleCreate}
            className="rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none font-semibold"
          >
            <Save className="mr-1 h-4 w-4" />
            Criar banner
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {banners.map((banner) => {
          const isEditing = editId === banner.id;

          return (
            <div key={banner.id} className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5697E9]/15">
                    <Image className="h-5 w-5 text-[#5697E9]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading leading-tight truncate">{banner.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {banner.type === "CAROUSEL" ? "Carousel" : "Featured"} &middot; Ordem {banner.sort_order}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={banner.is_active ? "default" : "secondary"} className={banner.is_active ? "bg-primary text-white" : ""}>
                    {banner.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    size="sm"
                    className={banner.is_active ? "h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]" : "h-7 text-xs rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none"}
                    onClick={() => toggleActive(banner)}
                  >
                    {banner.is_active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </div>

              {banner.subtitle && <p className="text-xs text-muted-foreground">{banner.subtitle}</p>}

              {banner.image_url && (
                <div className="h-28 w-full rounded-xl overflow-hidden bg-[#e1e3e4]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={banner.image_url} alt={banner.title} className="h-full w-full object-cover" />
                </div>
              )}

              {isEditing ? (
                <div className="space-y-4 pt-2 border-t border-[#e4e8f1]">
                  {renderDraftForm(editDraft, setEditDraft)}
                  <div className="flex gap-2">
                    <Button
                      disabled={saving}
                      onClick={() => handleUpdate(banner.id)}
                      className="rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none font-semibold"
                    >
                      <Save className="mr-1 h-4 w-4" />
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setEditId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl text-xs"
                    onClick={() => {
                      setEditId(banner.id);
                      setEditDraft(draftFromBanner(banner));
                      setCreating(false);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-xl text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(banner.id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Remover
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {banners.length === 0 && !creating && (
          <div className="rounded-2xl bg-white/95 px-6 py-10 text-center shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5697E9]/15">
              <Image className="h-7 w-7 text-[#5697E9]" />
            </div>
            <h2 className="mt-3 text-sm font-semibold font-heading text-foreground">Nenhum banner cadastrado</h2>
            <p className="mt-1 text-xs text-muted-foreground">Crie o primeiro banner para exibir no app.</p>
          </div>
        )}
      </div>
    </div>
  );
}
