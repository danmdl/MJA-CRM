"use client";
import { useState } from 'react';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId?: string;
}

const InviteUserDialog = ({ open, onOpenChange, churchId }: InviteUserDialogProps) => {
  const [email, setEmail] = useState('');

  console.log('[DEBUG] InviteUserDialog rendered, open:', open);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      padding: '20px',
      border: '1px solid #ccc',
      borderRadius: '8px',
      zIndex: 1000,
      minWidth: '400px'
    }}>
      <h2>Invitar a un nuevo miembro</h2>
      <p>Introduce el correo electrónico para invitar a un nuevo miembro.</p>
      {churchId && <p>Church ID: {churchId}</p>}
      
      <div style={{ marginTop: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px' }}>Correo Electrónico:</label>
        <input
          type="email"
          placeholder="nombre@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
      </div>
      
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          style={{
            padding: '8px 16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            alert('Invitación enviada con éxito (simulado)');
            setEmail('');
            onOpenChange(false);
          }}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#007bff',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Enviar Invitación
        </button>
      </div>
    </div>
  );
};

export default InviteUserDialog;