export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          church_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          church_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          church_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_banner: {
        Row: {
          enabled: boolean
          id: number
          message: string
          resurface_minutes: number
          updated_at: string
          updated_by: string | null
          variant: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          message?: string
          resurface_minutes?: number
          updated_at?: string
          updated_by?: string | null
          variant?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          message?: string
          resurface_minutes?: number
          updated_at?: string
          updated_by?: string | null
          variant?: string
        }
        Relationships: []
      }
      attendance_events: {
        Row: {
          cell_id: string | null
          church_id: string
          created_at: string
          created_by: string | null
          cuerda_id: string | null
          deleted_at: string | null
          event_date: string
          event_time: string | null
          id: string
          notes: string | null
          stage: string
          title: string | null
        }
        Insert: {
          cell_id?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          cuerda_id?: string | null
          deleted_at?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          notes?: string | null
          stage: string
          title?: string | null
        }
        Update: {
          cell_id?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          cuerda_id?: string | null
          deleted_at?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          notes?: string | null
          stage?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_cuerda_id_fkey"
            columns: ["cuerda_id"]
            isOneToOne: false
            referencedRelation: "cuerdas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_cuerda_id_fkey"
            columns: ["cuerda_id"]
            isOneToOne: false
            referencedRelation: "cuerdas_with_geojson"
            referencedColumns: ["id"]
          },
        ]
      }
      barrios: {
        Row: {
          created_at: string | null
          id: string
          nombre: string
          zona_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nombre: string
          zona_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nombre?: string
          zona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barrios_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_members: {
        Row: {
          cell_id: string
          created_at: string | null
          id: string
          profile_id: string
          role: string | null
        }
        Insert: {
          cell_id: string
          created_at?: string | null
          id?: string
          profile_id: string
          role?: string | null
        }
        Update: {
          cell_id?: string
          created_at?: string | null
          id?: string
          profile_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cell_members_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
        ]
      }
      cells: {
        Row: {
          address: string | null
          anfitrion_id: string | null
          anfitrion_name: string | null
          church_id: string
          closed_at: string | null
          closed_by: string | null
          closed_reason: string | null
          created_at: string | null
          cuerda_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          encargado_id: string | null
          id: string
          lat: number | null
          leader_name: string | null
          lng: number | null
          meeting_day: string | null
          meeting_time: string | null
          name: string | null
        }
        Insert: {
          address?: string | null
          anfitrion_id?: string | null
          anfitrion_name?: string | null
          church_id: string
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
          created_at?: string | null
          cuerda_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          encargado_id?: string | null
          id?: string
          lat?: number | null
          leader_name?: string | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string | null
        }
        Update: {
          address?: string | null
          anfitrion_id?: string | null
          anfitrion_name?: string | null
          church_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
          created_at?: string | null
          cuerda_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          encargado_id?: string | null
          id?: string
          lat?: number | null
          leader_name?: string | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cells_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cells_cuerda_id_fkey"
            columns: ["cuerda_id"]
            isOneToOne: false
            referencedRelation: "cuerdas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cells_cuerda_id_fkey"
            columns: ["cuerda_id"]
            isOneToOne: false
            referencedRelation: "cuerdas_with_geojson"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cells_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          importance: number | null
          published_at: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          importance?: number | null
          published_at?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          importance?: number | null
          published_at?: string | null
          title?: string
        }
        Relationships: []
      }
      changelog_dismissed: {
        Row: {
          dismissed_at: string | null
          dismissed_date: string
          id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          dismissed_date: string
          id?: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          dismissed_date?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      church_pastors: {
        Row: {
          church_id: string | null
          created_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          church_id?: string | null
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_pastors_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_pastors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      churches: {
        Row: {
          address: string | null
          created_at: string | null
          hours: string | null
          id: string
          is_pinned: boolean | null
          lat: number | null
          lng: number | null
          name: string
          pastor_id: string | null
          pin_order: number | null
          slug: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          hours?: string | null
          id?: string
          is_pinned?: boolean | null
          lat?: number | null
          lng?: number | null
          name: string
          pastor_id?: string | null
          pin_order?: number | null
          slug: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          hours?: string | null
          id?: string
          is_pinned?: boolean | null
          lat?: number | null
          lng?: number | null
          name?: string
          pastor_id?: string | null
          pin_order?: number | null
          slug?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "churches_pastor_id_fkey"
            columns: ["pastor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_logs: {
        Row: {
          action: string | null
          context: Json | null
          created_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          level: string | null
          payload: Json | null
          resolved: boolean | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          context?: Json | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          level?: string | null
          payload?: Json | null
          resolved?: boolean | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          context?: Json | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          level?: string | null
          payload?: Json | null
          resolved?: boolean | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_attendance: {
        Row: {
          contact_id: string
          event_id: string
          id: string
          notes: string | null
          recorded_at: string
          recorded_by: string | null
          status: string
        }
        Insert: {
          contact_id: string
          event_id: string
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          status: string
        }
        Update: {
          contact_id?: string
          event_id?: string
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_attendance_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_duplicates_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attendance_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "attendance_events"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_dedupe_dismissals: {
        Row: {
          contact_id_a: string
          contact_id_b: string
          dismissed_at: string
          dismissed_by: string | null
        }
        Insert: {
          contact_id_a: string
          contact_id_b: string
          dismissed_at?: string
          dismissed_by?: string | null
        }
        Update: {
          contact_id_a?: string
          contact_id_b?: string
          dismissed_at?: string
          dismissed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_dedupe_dismissals_contact_id_a_fkey"
            columns: ["contact_id_a"]
            isOneToOne: false
            referencedRelation: "contact_duplicates_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_dedupe_dismissals_contact_id_a_fkey"
            columns: ["contact_id_a"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_dedupe_dismissals_contact_id_b_fkey"
            columns: ["contact_id_b"]
            isOneToOne: false
            referencedRelation: "contact_duplicates_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_dedupe_dismissals_contact_id_b_fkey"
            columns: ["contact_id_b"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_logs: {
        Row: {
          contact_date: string
          contact_id: string
          contact_method: string | null
          contacted_by: string | null
          created_at: string | null
          id: string
          notes: string | null
        }
        Insert: {
          contact_date?: string
          contact_id: string
          contact_method?: string | null
          contacted_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          contact_date?: string
          contact_id?: string
          contact_method?: string | null
          contacted_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_duplicates_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_logs_contacted_by_fkey"
            columns: ["contacted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_processes: {
        Row: {
          church_id: string
          contact_id: string
          created_at: string
          id: string
          metadata: Json | null
          moved_at: string
          moved_by: string | null
          notes: string | null
          stage: string
        }
        Insert: {
          church_id: string
          contact_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          stage?: string
        }
        Update: {
          church_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_processes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_processes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contact_duplicates_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_processes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_transfers: {
        Row: {
          contact_id: string
          created_at: string | null
          from_cell_id: string | null
          from_cuerda: string | null
          from_zona: string | null
          id: string
          notes: string | null
          to_cell_id: string | null
          to_cuerda: string | null
          to_zona: string | null
          transfer_type: string | null
          transferred_by: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          from_cell_id?: string | null
          from_cuerda?: string | null
          from_zona?: string | null
          id?: string
          notes?: string | null
          to_cell_id?: string | null
          to_cuerda?: string | null
          to_zona?: string | null
          transfer_type?: string | null
          transferred_by?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          from_cell_id?: string | null
          from_cuerda?: string | null
          from_zona?: string | null
          id?: string
          notes?: string | null
          to_cell_id?: string | null
          to_cuerda?: string | null
          to_zona?: string | null
          transfer_type?: string | null
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_transfers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_duplicates_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_transfers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_transfers_from_cell_id_fkey"
            columns: ["from_cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_transfers_to_cell_id_fkey"
            columns: ["to_cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          apartment_number: string | null
          barrio: string | null
          cell_id: string | null
          church_id: string
          conector: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          edad: number | null
          email: string | null
          estado_civil: string | null
          estado_seguimiento: string | null
          fecha_contacto: string | null
          first_name: string
          id: string
          is_external: boolean | null
          last_name: string | null
          lat: number | null
          leader_assigned: string | null
          lng: number | null
          numero_cuerda: string | null
          observaciones: string | null
          pedido_de_oracion: string | null
          pending_assignment_cell_id: string | null
          pending_external_send: boolean
          phone: string | null
          pool_assigned_at: string | null
          pool_assigned_by: string | null
          received_from_mja_at: string | null
          received_from_mja_seen_at: string | null
          responsable_id: string | null
          search_haystack: string | null
          search_name: string | null
          sent_to_mja_at: string | null
          sent_to_mja_seen_at: string | null
          sexo: string | null
          ultimo_seguimiento: string | null
          zona: string | null
          zona_id: string | null
        }
        Insert: {
          address?: string | null
          apartment_number?: string | null
          barrio?: string | null
          cell_id?: string | null
          church_id: string
          conector?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edad?: number | null
          email?: string | null
          estado_civil?: string | null
          estado_seguimiento?: string | null
          fecha_contacto?: string | null
          first_name: string
          id?: string
          is_external?: boolean | null
          last_name?: string | null
          lat?: number | null
          leader_assigned?: string | null
          lng?: number | null
          numero_cuerda?: string | null
          observaciones?: string | null
          pedido_de_oracion?: string | null
          pending_assignment_cell_id?: string | null
          pending_external_send?: boolean
          phone?: string | null
          pool_assigned_at?: string | null
          pool_assigned_by?: string | null
          received_from_mja_at?: string | null
          received_from_mja_seen_at?: string | null
          responsable_id?: string | null
          search_haystack?: string | null
          search_name?: string | null
          sent_to_mja_at?: string | null
          sent_to_mja_seen_at?: string | null
          sexo?: string | null
          ultimo_seguimiento?: string | null
          zona?: string | null
          zona_id?: string | null
        }
        Update: {
          address?: string | null
          apartment_number?: string | null
          barrio?: string | null
          cell_id?: string | null
          church_id?: string
          conector?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edad?: number | null
          email?: string | null
          estado_civil?: string | null
          estado_seguimiento?: string | null
          fecha_contacto?: string | null
          first_name?: string
          id?: string
          is_external?: boolean | null
          last_name?: string | null
          lat?: number | null
          leader_assigned?: string | null
          lng?: number | null
          numero_cuerda?: string | null
          observaciones?: string | null
          pedido_de_oracion?: string | null
          pending_assignment_cell_id?: string | null
          pending_external_send?: boolean
          phone?: string | null
          pool_assigned_at?: string | null
          pool_assigned_by?: string | null
          received_from_mja_at?: string | null
          received_from_mja_seen_at?: string | null
          responsable_id?: string | null
          search_haystack?: string | null
          search_name?: string | null
          sent_to_mja_at?: string | null
          sent_to_mja_seen_at?: string | null
          sexo?: string | null
          ultimo_seguimiento?: string | null
          zona?: string | null
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_import_logs: {
        Row: {
          church_id: string | null
          created_at: string
          entity_type: string
          failure_count: number
          failures: Json
          filename: string | null
          id: string
          imported_rows: Json | null
          success_count: number
          total_rows: number
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          entity_type: string
          failure_count?: number
          failures?: Json
          filename?: string | null
          id?: string
          imported_rows?: Json | null
          success_count?: number
          total_rows?: number
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          entity_type?: string
          failure_count?: number
          failures?: Json
          filename?: string | null
          id?: string
          imported_rows?: Json | null
          success_count?: number
          total_rows?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "csv_import_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      cuerdas: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          is_church_cuerda: boolean
          lat: number | null
          lng: number | null
          meeting_day: string | null
          meeting_time: string | null
          numero: string
          referente_name: string | null
          supervisor_name: string | null
          territory: unknown
          territory_updated_at: string | null
          territory_updated_by: string | null
          zona_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_church_cuerda?: boolean
          lat?: number | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          numero: string
          referente_name?: string | null
          supervisor_name?: string | null
          territory?: unknown
          territory_updated_at?: string | null
          territory_updated_by?: string | null
          zona_id: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_church_cuerda?: boolean
          lat?: number | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          numero?: string
          referente_name?: string | null
          supervisor_name?: string | null
          territory?: unknown
          territory_updated_at?: string | null
          territory_updated_by?: string | null
          zona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuerdas_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hogares_de_paz: {
        Row: {
          address: string | null
          anfitrion_name: string | null
          church_id: string
          closed_at: string | null
          closed_by: string | null
          closed_reason: string | null
          created_at: string | null
          created_by: string | null
          cuerda_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          fecha_apertura: string | null
          fecha_cierre_estimada: string | null
          id: string
          lat: number | null
          leader_name: string | null
          lng: number | null
          meeting_day: string | null
          meeting_time: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          anfitrion_name?: string | null
          church_id: string
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          cuerda_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          fecha_apertura?: string | null
          fecha_cierre_estimada?: string | null
          id?: string
          lat?: number | null
          leader_name?: string | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          anfitrion_name?: string | null
          church_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          cuerda_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          fecha_apertura?: string | null
          fecha_cierre_estimada?: string | null
          id?: string
          lat?: number | null
          leader_name?: string | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hogares_de_paz_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hogares_de_paz_cuerda_id_fkey"
            columns: ["cuerda_id"]
            isOneToOne: false
            referencedRelation: "cuerdas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hogares_de_paz_cuerda_id_fkey"
            columns: ["cuerda_id"]
            isOneToOne: false
            referencedRelation: "cuerdas_with_geojson"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_logs: {
        Row: {
          caller_email: string | null
          caller_id: string
          created_at: string
          id: string
          ip_address: string | null
          target_email: string | null
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          caller_email?: string | null
          caller_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          target_email?: string | null
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          caller_email?: string | null
          caller_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          target_email?: string | null
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      kiosco_bolsas: {
        Row: {
          cantidad: number
          created_at: string | null
          gramos: number
          id: string
          nombre: string
          precio_bolsa: number
          updated_at: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          gramos: number
          id?: string
          nombre: string
          precio_bolsa?: number
          updated_at?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          gramos?: number
          id?: string
          nombre?: string
          precio_bolsa?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      kiosco_products: {
        Row: {
          category: string
          created_at: string | null
          id: string
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          name: string
          price: number
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      message_recipients: {
        Row: {
          archived_at: string | null
          id: string
          message_id: string | null
          read_at: string | null
          recipient_id: string | null
        }
        Insert: {
          archived_at?: string | null
          id?: string
          message_id?: string | null
          read_at?: string | null
          recipient_id?: string | null
        }
        Update: {
          archived_at?: string | null
          id?: string
          message_id?: string | null
          read_at?: string | null
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          church_id: string | null
          created_at: string
          id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          church_id?: string | null
          created_at?: string
          id?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          church_id?: string | null
          created_at?: string
          id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          church_id: string | null
          created_at: string | null
          id: string
          link: string | null
          message: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_leader_matches: {
        Row: {
          cell_id: string
          created_at: string | null
          id: string
          matched_name: string
          profile_id: string
          status: string | null
        }
        Insert: {
          cell_id: string
          created_at?: string | null
          id?: string
          matched_name: string
          profile_id: string
          status?: string | null
        }
        Update: {
          cell_id?: string
          created_at?: string | null
          id?: string
          matched_name?: string
          profile_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_leader_matches_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_leader_matches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          access_all_churches: boolean
          add_contacts: boolean | null
          add_members: boolean | null
          add_users: boolean
          base_datos_total: boolean | null
          can_assign_contacts: boolean | null
          can_auto_assign: boolean
          can_edit_celulas: boolean | null
          can_edit_cuerda: boolean | null
          can_edit_cuerdas: boolean | null
          can_filter_all_contacts: boolean
          can_import_csv: boolean | null
          can_restore_deleted: boolean | null
          can_see_asistencia: boolean
          can_see_celulas: boolean | null
          can_see_cuerdas: boolean | null
          can_see_eventos: boolean
          can_see_historial: boolean | null
          can_see_mapa: boolean
          can_see_papelera: boolean
          can_see_pool: boolean | null
          can_see_procesos: boolean
          can_see_rutas: boolean
          can_see_validador: boolean
          can_send_messages: boolean | null
          can_send_whatsapp: boolean | null
          can_use_templates: boolean
          change_user_role: boolean
          edit_delete_contacts: boolean | null
          edit_delete_members: boolean | null
          edit_delete_users: boolean
          role: string
          see_all_analytics: boolean
          see_all_churches: boolean
          see_own_church_analytics: boolean
        }
        Insert: {
          access_all_churches?: boolean
          add_contacts?: boolean | null
          add_members?: boolean | null
          add_users?: boolean
          base_datos_total?: boolean | null
          can_assign_contacts?: boolean | null
          can_auto_assign?: boolean
          can_edit_celulas?: boolean | null
          can_edit_cuerda?: boolean | null
          can_edit_cuerdas?: boolean | null
          can_filter_all_contacts?: boolean
          can_import_csv?: boolean | null
          can_restore_deleted?: boolean | null
          can_see_asistencia?: boolean
          can_see_celulas?: boolean | null
          can_see_cuerdas?: boolean | null
          can_see_eventos?: boolean
          can_see_historial?: boolean | null
          can_see_mapa?: boolean
          can_see_papelera?: boolean
          can_see_pool?: boolean | null
          can_see_procesos?: boolean
          can_see_rutas?: boolean
          can_see_validador?: boolean
          can_send_messages?: boolean | null
          can_send_whatsapp?: boolean | null
          can_use_templates?: boolean
          change_user_role?: boolean
          edit_delete_contacts?: boolean | null
          edit_delete_members?: boolean | null
          edit_delete_users?: boolean
          role: string
          see_all_analytics?: boolean
          see_all_churches?: boolean
          see_own_church_analytics?: boolean
        }
        Update: {
          access_all_churches?: boolean
          add_contacts?: boolean | null
          add_members?: boolean | null
          add_users?: boolean
          base_datos_total?: boolean | null
          can_assign_contacts?: boolean | null
          can_auto_assign?: boolean
          can_edit_celulas?: boolean | null
          can_edit_cuerda?: boolean | null
          can_edit_cuerdas?: boolean | null
          can_filter_all_contacts?: boolean
          can_import_csv?: boolean | null
          can_restore_deleted?: boolean | null
          can_see_asistencia?: boolean
          can_see_celulas?: boolean | null
          can_see_cuerdas?: boolean | null
          can_see_eventos?: boolean
          can_see_historial?: boolean | null
          can_see_mapa?: boolean
          can_see_papelera?: boolean
          can_see_pool?: boolean | null
          can_see_procesos?: boolean
          can_see_rutas?: boolean
          can_see_validador?: boolean
          can_send_messages?: boolean | null
          can_send_whatsapp?: boolean | null
          can_use_templates?: boolean
          change_user_role?: boolean
          edit_delete_contacts?: boolean | null
          edit_delete_members?: boolean | null
          edit_delete_users?: boolean
          role?: string
          see_all_analytics?: boolean
          see_all_churches?: boolean
          see_own_church_analytics?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          church_id: string | null
          email: string | null
          first_name: string
          id: string
          last_login_at: string | null
          last_name: string
          numero_cuerda: string | null
          phone: string | null
          profile_completed: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          zona_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          church_id?: string | null
          email?: string | null
          first_name: string
          id: string
          last_login_at?: string | null
          last_name: string
          numero_cuerda?: string | null
          phone?: string | null
          profile_completed?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          zona_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          church_id?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_login_at?: string | null
          last_name?: string
          numero_cuerda?: string | null
          phone?: string | null
          profile_completed?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string | null
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id?: string | null
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string | null
        }
        Relationships: []
      }
      seedling_filter_tabs: {
        Row: {
          church_id: string | null
          created_at: string
          filters: Json
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          filters?: Json
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seedling_filter_tabs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seedling_filter_tabs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_routes: {
        Row: {
          church_id: string | null
          contact_notes: Json
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          name: string | null
          notes: string
          notes_seen_at: string | null
          notes_updated_at: string | null
          numero_cuerda: string | null
          ordered_contact_ids: string[]
          share_token: string
          start_address: string | null
          start_lat: number | null
          start_lng: number | null
          total_meters: number | null
          total_seconds: number | null
          visited: Json
        }
        Insert: {
          church_id?: string | null
          contact_notes?: Json
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          name?: string | null
          notes?: string
          notes_seen_at?: string | null
          notes_updated_at?: string | null
          numero_cuerda?: string | null
          ordered_contact_ids: string[]
          share_token: string
          start_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
          total_meters?: number | null
          total_seconds?: number | null
          visited?: Json
        }
        Update: {
          church_id?: string | null
          contact_notes?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          name?: string | null
          notes?: string
          notes_seen_at?: string | null
          notes_updated_at?: string | null
          numero_cuerda?: string | null
          ordered_contact_ids?: string[]
          share_token?: string
          start_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
          total_meters?: number | null
          total_seconds?: number | null
          visited?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shared_routes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          created_at: string
          device_id_hash: string
          device_name: string | null
          id: string
          last_city: string | null
          last_country: string | null
          last_region: string | null
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id_hash: string
          device_name?: string | null
          id?: string
          last_city?: string | null
          last_country?: string | null
          last_region?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id_hash?: string
          device_name?: string | null
          id?: string
          last_city?: string | null
          last_country?: string | null
          last_region?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body: string
          church_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          image_url: string | null
          is_default: boolean | null
          is_system: boolean
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          church_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_default?: boolean | null
          is_system?: boolean
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          church_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_default?: boolean | null
          is_system?: boolean
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zonas: {
        Row: {
          church_id: string
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          church_id: string
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          church_id?: string
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "zonas_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contact_duplicates_v: {
        Row: {
          cell_id: string | null
          church_id: string | null
          created_at: string | null
          first_name: string | null
          group_size: number | null
          id: string | null
          last_name: string | null
          normalized_name: string | null
          numero_cuerda: string | null
          phone: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts_per_cell_mv: {
        Row: {
          cell_id: string | null
          church_id: string | null
          contact_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      cuerdas_with_geojson: {
        Row: {
          address: string | null
          created_at: string | null
          id: string | null
          is_church_cuerda: boolean | null
          lat: number | null
          lng: number | null
          meeting_day: string | null
          meeting_time: string | null
          numero: string | null
          referente_name: string | null
          supervisor_name: string | null
          territory: unknown
          territory_geojson: string | null
          territory_updated_at: string | null
          territory_updated_by: string | null
          zona_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string | null
          is_church_cuerda?: boolean | null
          lat?: number | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          numero?: string | null
          referente_name?: string | null
          supervisor_name?: string | null
          territory?: unknown
          territory_geojson?: never
          territory_updated_at?: string | null
          territory_updated_by?: string | null
          zona_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string | null
          is_church_cuerda?: boolean | null
          lat?: number | null
          lng?: number | null
          meeting_day?: string | null
          meeting_time?: string | null
          numero?: string | null
          referente_name?: string | null
          supervisor_name?: string | null
          territory?: unknown
          territory_geojson?: never
          territory_updated_at?: string | null
          territory_updated_by?: string | null
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuerdas_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      can_view_profile: {
        Args: { target_church_id: string; target_user_id: string }
        Returns: boolean
      }
      cleanup_old_logs: {
        Args: never
        Returns: {
          activity_deleted: number
          client_deleted: number
        }[]
      }
      compute_church_slug: { Args: { p_name: string }; Returns: string }
      current_user_can_use_templates: { Args: never; Returns: boolean }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      email_needs_setup: { Args: { p_email: string }; Returns: boolean }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      find_duplicates_in_church: {
        Args: { p_church_id: string }
        Returns: {
          cell_id: string
          church_id: string
          created_at: string
          first_name: string
          group_size: number
          id: string
          last_name: string
          normalized_name: string
          numero_cuerda: string
          phone: string
        }[]
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_all_users: {
        Args: never
        Returns: {
          email: string
          first_name: string
          id: string
          last_name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }[]
      }
      get_contacts_per_cell: {
        Args: { p_church_id: string }
        Returns: {
          cell_id: string
          contact_count: number
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_mja_contacts_seen: {
        Args: { p_church_id: string; p_cuerda: string }
        Returns: number
      }
      normalize_conector: { Args: { input: string }; Returns: string }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      set_cuerda_territory: {
        Args: { p_cuerda_id: string; p_geojson?: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unaccent: { Args: { "": string }; Returns: string }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      contact_status:
        | "nuevo"
        | "contactado"
        | "visito_celula"
        | "activo"
        | "inactivo"
      user_role:
        | "admin"
        | "general"
        | "pastor"
        | "piloto"
        | "encargado_de_celula"
        | "gestor_de_cuerda"
        | "user"
        | "referente"
        | "conector"
        | "supervisor"
        | "anfitrion"
        | "consolidador"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contact_status: [
        "nuevo",
        "contactado",
        "visito_celula",
        "activo",
        "inactivo",
      ],
      user_role: [
        "admin",
        "general",
        "pastor",
        "piloto",
        "encargado_de_celula",
        "gestor_de_cuerda",
        "user",
        "referente",
        "conector",
        "supervisor",
        "anfitrion",
        "consolidador",
      ],
    },
  },
} as const
