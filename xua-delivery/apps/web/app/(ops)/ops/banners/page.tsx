"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Image, Info, Layers, Palette, Pencil, Plus, Save, Trash2, Type, X } from "lucide-react";
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

/* ── Componentes auxiliares do formulário ── */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2 pb-1">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#5697E9]/10 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-[#5697E9]" />
      </div>
      <div>
        <p className="text-xs font-semibold font-heading text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ColorInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border-[#d9dde3] text-sm flex-1"
      />
      {value && /^#[0-9a-fA-F]{3,8}$/.test(value) && (
        <div
          className="h-8 w-8 shrink-0 rounded-lg border border-[#d9dde3]"
          style={{ backgroundColor: value }}
        />
      )}
    </div>
  );
}

/* ── Formulário principal ── */

function BannerForm({
  draft,
  onChange,
}: {
  draft: BannerDraft;
  onChange: (d: BannerDraft) => void;
}) {
  const isCarousel = draft.type === "CAROUSEL";

  return (
    <div className="space-y-5">
      {/* ─ Tipo e posição ─ */}
      <div>
        <SectionHeader
          icon={Layers}
          title="Tipo e posição"
          description="Onde o banner aparece na tela de catálogo do consumidor"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Tipo *" hint={isCarousel
            ? "Slides rotativos no topo do catálogo (aceita vários)"
            : "Card de destaque abaixo dos produtos (apenas 1 ativo)"
          }>
            <select
              value={draft.type}
              onChange={(e) => onChange({ ...draft, type: e.target.value as BannerType })}
              className="w-full rounded-xl border border-[#d9dde3] bg-white px-3 py-2 text-sm"
            >
              <option value="CAROUSEL">Carrossel (topo)</option>
              <option value="FEATURED">Destaque (abaixo dos produtos)</option>
            </select>
          </Field>
          <Field label="Ordem" hint="Ordem de exibição (menor = primeiro)">
            <Input
              type="number"
              value={draft.sort_order}
              onChange={(e) => onChange({ ...draft, sort_order: Number(e.target.value) || 0 })}
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
        </div>
      </div>

      {/* ─ Conteúdo ─ */}
      <div>
        <SectionHeader
          icon={Type}
          title="Conteúdo"
          description="Textos exibidos no banner"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Título *" hint="Texto principal do banner">
            <Input
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              placeholder="Ex: Primeira compra? R$10 OFF!"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          <Field label="Subtítulo" hint="Texto secundário abaixo do título">
            <Input
              value={draft.subtitle}
              onChange={(e) => onChange({ ...draft, subtitle: e.target.value })}
              placeholder="Ex: Use o cupom:"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          <Field label="Tag" hint="Etiqueta pequena acima do título">
            <Input
              value={draft.tag}
              onChange={(e) => onChange({ ...draft, tag: e.target.value })}
              placeholder="Ex: OFERTA DE BOAS-VINDAS"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          {isCarousel && (
            <Field label="Destaque" hint="Texto em destaque (ex: nome do cupom)">
              <Input
                value={draft.highlight}
                onChange={(e) => onChange({ ...draft, highlight: e.target.value })}
                placeholder="Ex: XUAFRESH"
                className="rounded-xl border-[#d9dde3] text-sm"
              />
            </Field>
          )}
        </div>
      </div>

      {/* ─ Botão de ação (CTA) ─ */}
      <div>
        <SectionHeader
          icon={Info}
          title="Botão de ação (CTA)"
          description="Botão opcional que leva o consumidor a uma página"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Texto do botão" hint="Se vazio, o botão não aparece">
            <Input
              value={draft.cta_text}
              onChange={(e) => onChange({ ...draft, cta_text: e.target.value })}
              placeholder="Ex: Saiba mais"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          <Field label="URL do botão" hint="Link de destino ao clicar">
            <Input
              value={draft.cta_url}
              onChange={(e) => onChange({ ...draft, cta_url: e.target.value })}
              placeholder="https://..."
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
        </div>
      </div>

      {/* ─ Cores ─ */}
      <div>
        <SectionHeader
          icon={Palette}
          title="Aparência"
          description={isCarousel
            ? "Cores de gradiente do fundo do slide"
            : "Cor de fundo e texto do card de destaque"
          }
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {isCarousel ? (
            <>
              <Field label="Gradiente — cor inicial" hint="Cor da esquerda do degradê">
                <ColorInput
                  value={draft.bg_gradient_from}
                  onChange={(v) => onChange({ ...draft, bg_gradient_from: v })}
                  placeholder="#1B4A9A"
                />
              </Field>
              <Field label="Gradiente — cor final" hint="Cor da direita do degradê">
                <ColorInput
                  value={draft.bg_gradient_to}
                  onChange={(v) => onChange({ ...draft, bg_gradient_to: v })}
                  placeholder="#5697E9"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Cor de fundo" hint="Cor sólida do card">
                <ColorInput
                  value={draft.bg_color}
                  onChange={(v) => onChange({ ...draft, bg_color: v })}
                  placeholder="#FFFFFF"
                />
              </Field>
              <Field label="Cor do texto" hint="Cor dos textos do card">
                <ColorInput
                  value={draft.text_color}
                  onChange={(v) => onChange({ ...draft, text_color: v })}
                  placeholder="#000000"
                />
              </Field>
            </>
          )}
        </div>
      </div>

      {/* ─ Imagens ─ */}
      <div>
        <SectionHeader
          icon={Image}
          title="Imagens"
          description={isCarousel
            ? "Imagem decorativa que aparece no canto do slide"
            : "Imagem do produto exibida à direita do card"
          }
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-1">
          <Field
            label={isCarousel ? "Imagem de fundo do slide" : "Imagem do card"}
            hint="URL de uma imagem (PNG ou JPG)"
          >
            <Input
              value={isCarousel ? draft.bg_image_url : draft.image_url}
              onChange={(e) =>
                onChange(
                  isCarousel
                    ? { ...draft, bg_image_url: e.target.value }
                    : { ...draft, image_url: e.target.value }
                )
              }
              placeholder="https://exemplo.com/imagem.png"
              className="rounded-xl border-[#d9dde3] text-sm"
            />
          </Field>
          {(isCarousel ? draft.bg_image_url : draft.image_url) && (
            <div className="h-24 w-full rounded-xl overflow-hidden bg-[#e1e3e4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={isCarousel ? draft.bg_image_url : draft.image_url}
                alt="Preview"
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>
      </div>
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

  function reloadBanners() {
    fetch("/api/banners/all")
      .then((r) => r.json())
      .then((data) => setBanners(data.banners ?? []))
      .catch(() => {});
  }

  async function handleCreate() {
    if (!draft.title.trim()) {
      toast.error("Informe o título do banner");
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
      toast.error("Informe o título do banner");
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

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold font-heading text-foreground">Banners</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm"
          >
            <div className="h-4 w-48 rounded-lg bg-[#e1e3e4]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold font-heading text-foreground">Banners</h1>
          <p className="text-xs text-muted-foreground">
            Banners exibidos na tela de catálogo do consumidor
          </p>
        </div>
        {!creating && (
          <Button
            size="sm"
            className="rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none font-semibold"
            onClick={() => {
              setCreating(true);
              setEditId(null);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo
          </Button>
        )}
      </div>

      {/* Formulário de criação */}
      {creating && (
        <div className="rounded-2xl bg-white/95 p-5 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold font-heading">Novo banner</p>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setDraft({ ...EMPTY_DRAFT });
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <BannerForm draft={draft} onChange={setDraft} />
          <Button
            disabled={saving}
            onClick={handleCreate}
            className="rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none font-semibold"
          >
            <Save className="mr-1 h-4 w-4" />
            {saving ? "Salvando..." : "Criar banner"}
          </Button>
        </div>
      )}

      {/* Lista de banners */}
      <div className="space-y-3">
        {banners.map((banner) => {
          const isEditing = editId === banner.id;

          return (
            <div
              key={banner.id}
              className="rounded-2xl bg-white/95 p-4 shadow-[0_2px_12px_rgba(0,26,64,0.06)] backdrop-blur-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5697E9]/15">
                    <Image className="h-5 w-5 text-[#5697E9]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading leading-tight truncate">
                      {banner.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {banner.type === "CAROUSEL" ? "Carrossel (topo)" : "Destaque (abaixo dos produtos)"}{" "}
                      &middot; Ordem {banner.sort_order}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={banner.is_active ? "default" : "secondary"}
                  className={banner.is_active ? "bg-primary text-white shrink-0" : "shrink-0"}
                >
                  {banner.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>

              {/* Preview resumido */}
              {!isEditing && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  {banner.tag && <span>Tag: {banner.tag}</span>}
                  {banner.subtitle && <span>Sub: {banner.subtitle}</span>}
                  {banner.cta_text && <span>CTA: {banner.cta_text}</span>}
                </div>
              )}

              {banner.image_url && !isEditing && (
                <div className="h-24 w-full rounded-xl overflow-hidden bg-[#e1e3e4]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={banner.image_url}
                    alt={banner.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              {isEditing ? (
                <div className="space-y-4 pt-3 border-t border-[#e4e8f1]">
                  <BannerForm draft={editDraft} onChange={setEditDraft} />
                  <div className="flex gap-2">
                    <Button
                      disabled={saving}
                      onClick={() => handleUpdate(banner.id)}
                      className="rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none font-semibold"
                    >
                      <Save className="mr-1 h-4 w-4" />
                      {saving ? "Salvando..." : "Salvar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl"
                      onClick={() => setEditId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
                    onClick={() => {
                      setEditId(banner.id);
                      setEditDraft(draftFromBanner(banner));
                      setCreating(false);
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    className={
                      banner.is_active
                        ? "h-7 text-xs rounded-xl border-0 bg-[#e1e3e4] text-foreground hover:bg-[#d1d3d4]"
                        : "h-7 text-xs rounded-xl bg-[#C8F708] text-[#1a2600] hover:bg-[#C8F708]/90 shadow-none"
                    }
                    onClick={() => toggleActive(banner)}
                  >
                    {banner.is_active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
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
            <h2 className="mt-3 text-sm font-semibold font-heading text-foreground">
              Nenhum banner cadastrado
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie o primeiro banner para exibir no catálogo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
