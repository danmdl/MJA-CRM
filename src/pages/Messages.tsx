"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

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

  useEffect(() => {
    const loadTeam = async () => {
      if (!profile?.church_id) return;
      const { data } = await supabase.from('profiles').select('id, first_name, last_name').eq('church_id', profile.church_id);
      setTeam((data || []).map((p: any) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, email: null })));
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
    if (!profile?.church_id || selectedIds.size === 0 || !body.trim()) return;
    const { data, error } = await supabase.from('messages').insert({
      church_id: profile.church_id,
      sender_id: session?.user.id,
      body: body.trim()
    }).select('*').single();
    if (error) return;
    const msgId = data.id;
    await supabase.from('message_recipients').insert(Array.from(selectedIds).map(id => ({ message_id: msgId, recipient_id: id })));
    setBody('');
    setSelectedIds(new Set());
    const { data: sent } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, church_id, message_recipients(recipient_id)')
      .eq('sender_id', session?.user.id);
    setOutbox(sent || []);
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
        </TabsList>
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