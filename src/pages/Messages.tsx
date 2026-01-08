"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess } from '@/utils/toast';

interface TeamUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const Messages = () => {
  const { session, profile } = useSession();
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [body, setBody] = useState('');
  const [inbox, setInbox] = useState<any[]>([]);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const loadTeam = async () => {
      const assignableRoles = ['user', 'encargado_de_celula', 'piloto', 'pastor'];
      let query = supabase.from('profiles')
        .select('id, first_name, last_name, role, church_id')
        .in('role', assignableRoles);
      if (profile?.church_id) {
        query = query.eq('church_id', profile.church_id);
      }
      const { data } = await query;
      setTeam((data || []).map((p: any) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: null
      })));
    };
    const loadInbox = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, body, created_at, sender_id, church_id, message_recipients!inner(recipient_id)')
        .eq('message_recipients.recipient_id', session?.user.id);
      setInbox(data || []);
    };
    const loadOutbox = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, body, created_at, sender_id, church_id, message_recipients(recipient_id)')
        .eq('sender_id', session?.user.id);
      setOutbox(data || []);
    };
    loadTeam();
    loadInbox();
    loadOutbox();

    // Realtime: update inbox/outbox on new inserts
    const channels: any[] = [];
    if (session?.user.id) {
      const outCh = supabase
        .channel(`messages_out_${session.user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${session.user.id}` }, () => {
          loadOutbox();
        })
        .subscribe();
      channels.push(outCh);

      const inCh = supabase
        .channel(`messages_in_${session.user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_recipients', filter: `recipient_id=eq.${session.user.id}` }, () => {
          loadInbox();
        })
        .subscribe();
      channels.push(inCh);
    }
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [session?.user.id, profile?.church_id]);

  const filteredTeam = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return team;
    return team.filter(u => (`${u.first_name || ''} ${u.last_name || ''}`).toLowerCase().includes(q));
  }, [team, recipientSearch]);

  const toggleRecipient = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sendMessage = async () => {
    if (selectedIds.size === 0 || !body.trim()) return;
    const { data, error } = await supabase.from('messages').insert({
      church_id: profile?.church_id || null,
      sender_id: session?.user.id,
      body: body.trim()
    }).select('*').single();
    if (error) return;
    const msgId = data.id;
    await supabase.from('message_recipients').insert(Array.from(selectedIds).map(id => ({ message_id: msgId, recipient_id: id })));
    setBody('');
    setSelectedIds(new Set());
    showSuccess('Mensaje enviado');
    const { data: sent } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, church_id, message_recipients(recipient_id)')
      .eq('sender_id', session?.user.id);
    setOutbox(sent || []);
    const { data: inboxData } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, church_id, message_recipients!inner(recipient_id)')
      .eq('message_recipients.recipient_id', session?.user.id);
    setInbox(inboxData || []);
  };

  return (
    <div className="p-6">
      <Card className="mb-6">
        <CardHeader><CardTitle>Enviar Mensaje</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Buscar destinatarios..." value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)} />
          <div className="max-h-48 overflow-auto border rounded">
            {filteredTeam.map(u => (
              <label key={u.id} className="flex items-center gap-2 p-2 border-b last:border-b-0">
                <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleRecipient(u.id)} />
                <span>{`${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Sin nombre'}</span>
              </label>
            ))}
          </div>
          <Textarea placeholder="Escribe tu mensaje..." value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          <Button onClick={sendMessage}>Enviar</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList>
          <TabsTrigger value="inbox">Bandeja de entrada</TabsTrigger>
          <TabsTrigger value="outbox">Enviados</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>
        <TabsContent value="alerts">
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No hay alertas.</div>
            ) : alerts.map(a => {
              const wa = (a.phone || '').replace(/[^\d]/g, '');
              const days = a.lastContact ? Math.floor((Date.now() - new Date(a.lastContact).getTime()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <div key={a.id} className="border rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.lastContact ? `Último contacto: ${new Date(a.lastContact).toLocaleDateString()}` : 'Sin contactos previos'}
                      {days !== null && days >= 7 ? <Badge className="ml-2 bg-red-600 hover:bg-red-600">+7 días</Badge> : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={wa ? `https://wa.me/${wa}` : '#'}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-xs px-2 py-1 rounded border ${wa ? 'hover:bg-muted' : 'opacity-50 cursor-not-allowed'}`}
                      onClick={(e) => { if (!wa) e.preventDefault(); }}
                    >
                      Enviar Whatsapp
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="inbox">
          <div className="space-y-2">
            {inbox.map(m => (
              <div key={m.id} className="border rounded p-3">
                <div className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                <div>{m.body}</div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="outbox">
          <div className="space-y-2">
            {outbox.map(m => (
              <div key={m.id} className="border rounded p-3">
                <div className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                <div>{m.body}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Messages;