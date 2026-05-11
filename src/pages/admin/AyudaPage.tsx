"use client";
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/hooks/use-session';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Pencil, Trash2, ChevronRight, HelpCircle } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { normalize } from '@/lib/normalize';

interface Article {
  id: string;
  title: string;
  body: string;
  category: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const AyudaPage = () => {
  const { profile } = useSession();
  const qc = useQueryClient();
  const isEditor = profile?.role === 'admin' || profile?.role === 'general';

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [editing, setEditing] = useState<Article | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: articles = [], isLoading } = useQuery<Article[]>({
    queryKey: ['help-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_articles')
        .select('id, title, body, category, sort_order, created_at, updated_at')
        .is('deleted_at', null)
        .order('sort_order')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Article[];
    },
    staleTime: 5 * 60_000,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    articles.forEach(a => { if (a.category) set.add(a.category); });
    return Array.from(set).sort();
  }, [articles]);

  const filtered = useMemo(() => {
    let list = articles;
    if (selectedCategory) list = list.filter(a => a.category === selectedCategory);
    if (search.trim()) {
      const q = normalize(search);
      list = list.filter(a =>
        normalize(a.title).includes(q) || normalize(a.body).includes(q),
      );
    }
    return list;
  }, [articles, selectedCategory, search]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, Article[]>();
    filtered.forEach(a => {
      const cat = a.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="p-3 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-primary" />
            Centro de Ayuda
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Tutoriales, preguntas frecuentes y guías sobre la app.</p>
        </div>
        {isEditor && (
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo artículo
          </Button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Buscar en la ayuda..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              selectedCategory === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'
            }`}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                selectedCategory === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Articles */}
      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Cargando...</p>}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {articles.length === 0 ? (
            <>
              <HelpCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Todavía no hay artículos de ayuda.</p>
              {isEditor && <p className="text-xs mt-2">Hacé clic en "Nuevo artículo" para crear el primero.</p>}
            </>
          ) : (
            <p>No se encontraron resultados para "{search}".</p>
          )}
        </div>
      )}

      {groupedByCategory.map(([cat, items]) => (
        <div key={cat} className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{cat}</h2>
          <div className="space-y-1">
            {items.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedArticle(a)}
                className="w-full text-left p-3 rounded border hover:bg-muted/30 hover:border-primary/40 transition-colors flex items-center justify-between group"
              >
                <span className="text-sm font-medium">{a.title}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Article reader */}
      <Dialog open={!!selectedArticle} onOpenChange={(o) => { if (!o) setSelectedArticle(null); }}>
        <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
          {selectedArticle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2 pr-6">
                  <span>{selectedArticle.title}</span>
                  {isEditor && (
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(selectedArticle); setSelectedArticle(null); }} className="h-7 gap-1">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                </DialogTitle>
                {selectedArticle.category && (
                  <Badge variant="outline" className="w-fit mt-1">{selectedArticle.category}</Badge>
                )}
              </DialogHeader>
              <div className="text-sm whitespace-pre-wrap leading-relaxed mt-2">
                {selectedArticle.body}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit / Create dialog */}
      <ArticleEditor
        open={creating || !!editing}
        article={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['help-articles'] }); setCreating(false); setEditing(null); }}
      />
    </div>
  );
};

interface ArticleEditorProps {
  open: boolean;
  article: Article | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

const ArticleEditor = ({ open, article, onClose, onSaved }: ArticleEditorProps) => {
  const { session } = useSession();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [sortOrder, setSortOrder] = useState(100);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setTitle(article?.title || '');
      setBody(article?.body || '');
      setCategory(article?.category || '');
      setSortOrder(article?.sort_order ?? 100);
    }
  }, [open, article]);

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      showError('Título y contenido son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        category: category.trim() || null,
        sort_order: sortOrder,
      };
      const op = article
        ? supabase.from('help_articles').update(payload).eq('id', article.id)
        : supabase.from('help_articles').insert({ ...payload, created_by: session?.user?.id });
      const { error } = await op;
      if (error) { showError(error.message); return; }
      showSuccess(article ? 'Artículo actualizado.' : 'Artículo creado.');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async () => {
    if (!article) return;
    if (!confirm(`¿Eliminar "${article.title}"?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('help_articles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', article.id);
      if (error) { showError(error.message); return; }
      showSuccess('Artículo eliminado.');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{article ? 'Editar artículo' : 'Nuevo artículo'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Cómo asignar contactos a una célula" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Categoría</label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ej: Semillero" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Orden (menor = arriba)</label>
              <Input type="number" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 100)} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Contenido</label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={10} placeholder="Escribe el contenido del artículo..." className="mt-1 font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          {article && (
            <Button variant="ghost" size="sm" onClick={deleteArticle} disabled={saving} className="text-red-400 hover:text-red-300 mr-auto gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Guardando...' : article ? 'Actualizar' : 'Crear'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AyudaPage;
