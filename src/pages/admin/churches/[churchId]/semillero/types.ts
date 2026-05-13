export interface Zona { id: string; nombre: string; }
export interface Barrio { id: string; nombre: string; zona_id: string; }
export interface Cuerda { id: string; numero: string; zona_id: string; is_church_cuerda?: boolean; territory_geojson?: string | null; }

export interface Cell {
  id: string; name: string; church_id: string; cuerda_id: string | null;
  address: string | null; lat: number | null; lng: number | null;
  meeting_day: string | null; meeting_time: string | null;
}

export interface Contact {
  id: string; first_name: string; last_name: string | null;
  phone: string | null; address: string | null; barrio: string | null;
  zona_id: string | null; zona?: string | null;
  conector: string | null; fecha_contacto: string | null;
  numero_cuerda: string | null; edad: string | null;
  cell_id: string | null; estado_seguimiento?: string | null;
  lat?: number | null; lng?: number | null;
  sexo?: string | null;
  estado_civil?: string | null;
  is_external?: boolean;
  pending_external_send?: boolean;
  pending_assignment_cell_id?: string | null;
  responsable_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  // Set by the mark_contact_received_from_mja trigger when a user from
  // an is_church_cuerda=true cuerda (MJA Central, MJA CABA, MJA Moreno,
  // Puerta 8, …) reassigns this contact to a regular cuerda. Cleared
  // back to null when the receiving cuerda's tab is clicked.
  received_from_mja_at?: string | null;
  received_from_mja_seen_at?: string | null;
  // Reverse direction — set when a non-MJA user reassigns a contact
  // INTO an MJA-side cuerda. The MJA-side referente's locked tab uses
  // these to badge inbound contacts.
  sent_to_mja_at?: string | null;
  sent_to_mja_seen_at?: string | null;
}
