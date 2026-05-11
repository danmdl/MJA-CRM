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
}
