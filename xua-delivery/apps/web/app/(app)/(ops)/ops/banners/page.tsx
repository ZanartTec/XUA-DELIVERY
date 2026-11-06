"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ConfirmAction } from "@/src/components/shared/confirm-action";
import { EmptyState } from "@/src/components/shared/empty-state";
import { PageHeader } from "@/src/components/shared/page-header";
import { ResponsiveDialog } from "@/src/components/shared/responsive-dialog";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { StickyActionBar } from "@/src/components/shared/sticky-action-bar";
import { PromoBannerCarousel, type BannerSlide } from "@/src/components/consumer/promo-banner-carousel";
import { cn } from "@/src/lib/utils";
import { Eye, EyeOff, Image, Info, Layers, Loader2, MoreVertical, Palette, Pencil, Plus, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import type { BannerType } from "@xua/shared/enums";

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

/* -- Componentes auxiliares do formulário -- */

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
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky/10 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-sky" />
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
        className="h-11 flex-1 rounded-xl"
      />
      {value && /^#[0-9a-fA-F]{3,8}$/.test(value) && (
        <div
          className="h-8 w-8 shrink-0 rounded-lg border border-hairline"
          style={{ backgroundColor: value }}
        />
      )}
    </div>
  );
}

/* -- Formulário principal -- */

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
      {/* - Tipo e posição - */}
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
              className="w-full rounded-xl border border-hairline bg-white px-3 py-2 text-sm"
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
              className="h-11 rounded-xl"
            />
          </Field>
        </div>
      </div>

      {/* - Conteúdo - */}
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
              className="h-11 rounded-xl"
            />
          </Field>
          <Field label="Subtítulo" hint="Texto secundário abaixo do título">
            <Input
              value={draft.subtitle}
              onChange={(e) => onChange({ ...draft, subtitle: e.target.value })}
              placeholder="Ex: Use o cupom:"
              className="h-11 rounded-xl"
            />
          </Field>
          <Field label="Tag" hint="Etiqueta pequena acima do título">
            <Input
              value={draft.tag}
              onChange={(e) => onChange({ ...draft, tag: e.target.value })}
              placeholder="Ex: OFERTA DE BOAS-VINDAS"
              className="h-11 rounded-xl"
            />
          </Field>
          {isCarousel && (
            <Field label="Destaque" hint="Texto em destaque (ex: nome do cupom)">
              <Input
                value={draft.highlight}
                onChange={(e) => onChange({ ...draft, highlight: e.target.value })}
                placeholder="Ex: XUAFRESH"
                className="h-11 rounded-xl"
              />
            </Field>
          )}
        </div>
      </div>

      {/* - Botão de ação (CTA) - */}
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
              className="h-11 rounded-xl"
            />
          </Field>
          <Field label="URL do botão" hint="Link de destino ao clicar">
            <Input
              value={draft.cta_url}
              onChange={(e) => onChange({ ...draft, cta_url: e.target.value })}
              placeholder="https://..."
              className="h-11 rounded-xl"
            />
          </Field>
        </div>
      </div>

      {/* - Cores - */}
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

      {/* - Imagens - */}
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
              className="h-11 rounded-xl"
            />
          </Field>
          {(isCarousel ? draft.bg_image_url : draft.image_url) && (
            <div className="h-24 w-full rounded-xl overflow-hidden bg-surface-highest">
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

function previewSlide(d: BannerDraft): BannerSlide {
  const nn = (v: string) => (v.trim() ? v.trim() : null);
  return {
    id: "preview",
    tag: nn(d.tag),
    title: d.title || "Título do banner",
    subtitle: nn(d.subtitle),
    highlight: nn(d.highlight),
    bg_color: nn(d.bg_color),
    bg_gradient_from: nn(d.bg_gradient_from),
    bg_gradient_to: nn(d.bg_gradient_to),
    bg_image_url: nn(d.bg_image_url),
    text_color: nn(d.text_color),
    image_url: nn(d.image_url),
    cta_text: nn(d.cta_text),
    cta_url: nn(d.cta_url),
  };
}

export default function OpsBannersPage() {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ mode: "new" } | { mode: "edit"; banner: BannerItem } | null>(null);
  const [draft, setDraft] = useState<BannerDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<BannerItem | null>(null);

  useEffect(() => {
    fetch("/api/banners/all")
      .then((r) => r.json())
      .then((data) => setBanners(data.banners ?? []))
      .catch(() => toast.error("Erro ao carregar banners"))
      .finally(() => setLoading(false));
  }, []);

  function openForm(next: { mode: "new" } | { mode: "edit"; banner: BannerItem }) {
    setDraft(next.mode === "edit" ? draftFromBanner(next.banner) : { ...EMPTY_DRAFT });
    setForm(next);
  }

  async function handleSave() {
    if (!form) return;
    if (!draft.title.trim()) {
      toast.error("Informe o título do banner");
      return;
    }
    setSaving(true);
    try {
      const editing = form.mode === "edit";
      const res = await fetch(editing ? `/api/banners/${form.banner.id}` : "/api/banners", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBanners((prev) => (editing ? prev.map((b) => (b.id === data.banner.id ? data.banner : b)) : [...prev, data.banner]));
      setForm(null);
      toast.success(editing ? "Banner atualizado" : "Banner criado");
    } catch {
      toast.error("Erro ao salvar banner");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(banner: BannerItem, isActive: boolean) {
    try {
      const res = await fetch(`/api/banners/${banner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? data.banner : b)));
      toast.success(isActive ? "Banner no ar" : "Banner pausado");
    } catch {
      toast.error("Erro ao alterar status");
    }
  }

  async function handleDelete(banner: BannerItem) {
    try {
      const res = await fetch(`/api/banners/${banner.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setBanners((prev) => prev.filter((b) => b.id !== banner.id));
      toast.success("Banner excluído");
    } catch {
      toast.error("Erro ao excluir banner");
    }
  }

  const sorted = [...banners].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.sort_order - b.sort_order);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Banners" description="Destaques do topo do catálogo." />
      <div className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : sorted.length === 0 ? (
          <EmptyState icon={Image} title="Nenhum banner" description="Banners aparecem no topo do catálogo do cliente." />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
            {sorted.map((banner) => (
              <li key={banner.id} className={cn("flex items-center gap-3 px-4 py-3", !banner.is_active && "bg-surface-low")}>
                <span
                  aria-hidden
                  className="h-12 w-16 shrink-0 rounded-lg border border-hairline"
                  style={
                    banner.bg_color
                      ? { backgroundColor: banner.bg_color }
                      : { backgroundImage: `linear-gradient(to bottom right, ${banner.bg_gradient_from ?? "#1B4A9A"}, ${banner.bg_gradient_to ?? "#5697E9"})` }
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-semibold", banner.is_active ? "text-foreground" : "text-muted-foreground")}>{banner.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusBadge label={banner.is_active ? "No ar" : "Pausado"} tone={banner.is_active ? "success" : "neutral"} className="h-5 shrink-0 px-2 text-[11px]" />
                    <span className="truncate">
                      {banner.type === "FEATURED" ? "Destaque" : "Carrossel"} · posição {banner.sort_order}
                    </span>
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-touch" aria-label={`Ações do banner ${banner.title}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => openForm({ mode: "edit", banner })}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setActive(banner, !banner.is_active)}>
                      {banner.is_active ? <EyeOff /> : <Eye />} {banner.is_active ? "Pausar" : "Colocar no ar"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(banner)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StickyActionBar>
        <Button variant="cta" size="xl" onClick={() => openForm({ mode: "new" })}>
          <Plus aria-hidden /> Novo banner
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        title={form?.mode === "edit" ? "Editar banner" : "Novo banner"}
        className="sm:max-w-2xl"
        footer={
          <Button variant="cta" size="xl" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {form?.mode === "edit" ? "Salvar alterações" : "Criar banner"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Como o cliente vê</p>
            <div className="-mx-4 overflow-hidden">
              <PromoBannerCarousel banners={[previewSlide(draft)]} />
            </div>
          </div>
          <Alert className="border-warning/30 bg-warning-surface">
            <Info className="text-warning-foreground" aria-hidden />
            <AlertDescription className="text-warning-foreground">
              O checkout ainda não tem cupom de desconto nem frete grátis: não prometa isso no banner.
            </AlertDescription>
          </Alert>
          <BannerForm draft={draft} onChange={setDraft} />
        </div>
      </ResponsiveDialog>

      <ConfirmAction
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Excluir o banner “${removing?.title ?? ""}”?`}
        description="Ele some do catálogo e não dá para recuperar. Para tirar só por um tempo, use Pausar."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          if (removing) await handleDelete(removing);
          setRemoving(null);
        }}
      />
    </div>
  );
}
