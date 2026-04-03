"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { normalize } from '@/lib/normalize';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showSuccess, showError } from '@/utils/toast';
import { Send, Mail, MailOpen, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TeamUser { id: string; first_name: string | null; last_name: string | null; role: string | null; }
interface Msg { id: string; body: string; created_at: string; sender_id: string; sender_name?: string; recipients?: string[]; recipient_names?: string[]; read_at?: string | null; }

const Messages = () => {
  const { session, profile } = useSession();
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [inbox, setInbox] = useState<Msg[]>([]);
  const [outbox, setOutbox] = useState<Msg[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<Msg | null>(null);
  const [search, setSearch] = useState('');

  const userId = session?.user?.id;

  // Load team + name map
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name, role, church_id');
      const all = data || [];
      const map = new Map<string, string>();
      all.forEach(p => map.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre'));
      setNameMap(map);
      // Team = same church, exclude self
      const churchMembers = profile?.church_id ? all.filter(p => p.church_id === profile.church_id && p.id !== userId) : all.filter(p => p.id !== userId);
      setTeam(churchMembers.map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, role: p.role })));
    };
    load();
  }, [userId, profile?.church_id]);

  // Load inbox
  const loadInbox = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('message_recipients')
      .select('message_id, read_at, messages:message_id(id, body, created_at, sender_id)')
      .eq('recipient_id', userId)
      .order('message_id', { ascending: false });
    const msgs: Msg[] = (data || []).map((r: any) => ({
      id: r.messages.id,
      body: r.messages.body,
      created_at: r.messages.created_at,
      sender_id: r.messages.sender_id,
      read_at: r.read_at,
    }));
    setInbox(msgs);
  };

  // Load outbox
  const loadOutbox = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, message_recipients(recipient_id)')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false });
    const msgs: Msg[] = (data || []).map((m: any) => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      sender_id: m.sender_id,
      recipients: (m.message_recipients || []).map((r: any) => r.recipient_id),
    }));
    setOutbox(msgs);
  };

  useEffect(() => { loadInbox(); loadOutbox(); }, [userId]);

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`msg_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_recipients', filter: `recipient_id=eq.${userId}` }, () => loadInbox())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const markAsRead = async (msgId: string) => {
    await supabase.from('message_recipients').update({ read_at: new Date().toISOString() }).eq('message_id', msgId).eq('recipient_id', userId!).is('read_at', null);
    loadInbox();
  };

  const sendMessage = async () => {
    if (selectedIds.size === 0 || !body.trim()) { showError('Seleccioná destinatarios y escribí un mensaje.'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.from('messages').insert({ church_id: profile?.church_id || null, sender_id: userId, body: body.trim() }).select('id').single();
      if (error || !data) { showError('Error al enviar.'); return; }
      await supabase.from('message_recipients').insert(Array.from(selectedIds).map(id => ({ message_id: data.id, recipient_id: id })));
      showSuccess(`Mensaje enviado a ${selectedIds.size} persona(s).`);
      setBody(''); setSelectedIds(new Set()); setComposeOpen(false);
      loadOutbox();
    } catch { showError('Error inesperado.'); } finally { setSending(false); }
  };

  const filteredTeam = useMemo(() => {
    if (!recipientSearch) return team;
    const q = normalize(recipientSearch);
    return team.filter(u => normalize(`${u.first_name || ''} ${u.last_name || ''}`).includes(q));
  }, [team, recipientSearch]);

  const unreadCount = inbox.filter(m => !m.read_at).length;

  const filteredInbox = useMemo(() => {
    if (!search) return inbox;
    const q = normalize(search);
    return inbox.filter(m => normalize(m.body).includes(q) || normalize(nameMap.get(m.sender_id) || '').includes(q));
  }, [inbox, search, nameMap]);

  const filteredOutbox = useMemo(() => {
    if (!search) return outbox;
    const q = normalize(search);
    return outbox.filter(m => normalize(m.body).includes(q));
  }, [outbox, search]);

  const fmtDate = (ts: string) => { try { return format(new Date(ts), "d MMM yy, HH:mm", { locale: es }); } catch { return ts; } };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mensajes</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setComposeOpen(true)}>
          <Send className="h-4 w-4" /> Nuevo mensaje
        </Button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8 h-8 text-sm" placeholder="Buscar mensajes..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1.5">
            Bandeja de entrada
            {unreadCount > 0 && <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">{unreadCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="outbox">Enviados</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-1 mt-3">
          {filteredInbox.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin mensajes.</p>}
          {filteredInbox.map(m => {
            const isUnread = !m.read_at;
            return (
              <button
                key={m.id}
                className={`w-full text-left p-3 rounded border hover:bg-muted/30 transition-colors ${isUnread ? 'bg-primary/5 border-primary/20' : ''}`}
                onClick={() => { setSelectedMsg(m); if (isUnread) markAsRead(m.id); }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isUnread ? <Mail className="h-4 w-4 text-primary shrink-0" /> : <MailOpen className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className={`text-sm truncate ${isUnread ? 'font-semibold' : ''}`}>{nameMap.get(m.sender_id) || 'Desconocido'}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(m.created_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate ml-6">{m.body}</p>
              </button>
            );
          })}
        </TabsContent>

        <TabsContent value="outbox" className="space-y-1 mt-3">
          {filteredOutbox.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin mensajes enviados.</p>}
          {filteredOutbox.map(m => (
            <button key={m.id} className="w-full text-left p-3 rounded border hover:bg-muted/30 transition-colors" onClick={() => setSelectedMsg(m)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm truncate">
                  Para: {(m.recipients || []).map(id => nameMap.get(id) || 'Desconocido').join(', ')}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(m.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{m.body}</p>
            </button>
          ))}
        </TabsContent>
      </Tabs>

      {/* Read message dialog */}
      <Dialog open={!!selectedMsg} onOpenChange={(o) => { if (!o) setSelectedMsg(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedMsg?.sender_id === userId ? 'Mensaje enviado' : `De: ${nameMap.get(selectedMsg?.sender_id || '') || 'Desconocido'}`}
            </DialogTitle>
          </DialogHeader>
          {selectedMsg && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{fmtDate(selectedMsg.created_at)}</p>
              {selectedMsg.sender_id === userId && selectedMsg.recipients && (
                <p className="text-xs text-muted-foreground">Para: {selectedMsg.recipients.map(id => nameMap.get(id) || 'Desconocido').join(', ')}</p>
              )}
              <div className="p-3 rounded border bg-muted/30 text-sm whitespace-pre-wrap">{selectedMsg.body}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Nuevo Mensaje</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Destinatarios</label>
              <Input placeholder="Buscar..." value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} className="mt-1 h-8 text-sm" />
              <div className="max-h-36 overflow-auto border rounded mt-1.5">
                {filteredTeam.map(u => (
                  <label key={u.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b last:border-b-0 hover:bg-muted/30 cursor-pointer text-sm">
                    <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; }); }} className="rounded" />
                    <span>{`${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Sin nombre'}</span>
                    {u.role && <span className="text-[10px] text-muted-foreground ml-auto">{u.role}</span>}
                  </label>
                ))}
              </div>
              {selectedIds.size > 0 && <p className="text-xs text-muted-foreground mt-1">{selectedIds.size} seleccionado(s)</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mensaje</label>
              <Textarea placeholder="Escribe tu mensaje..." value={body} onChange={e => setBody(e.target.value)} rows={4} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setComposeOpen(false)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5" onClick={sendMessage} disabled={sending}>
                <Send className="h-3.5 w-3.5" /> {sending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Messages;
