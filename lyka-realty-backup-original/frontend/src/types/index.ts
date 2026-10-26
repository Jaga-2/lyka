export type UserRole = 'customer' | 'sales_agent' | 'employee' | 'manager' | 'admin' | 'super_admin';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  is_active?: boolean;
  token?: string;
}

export interface Property {
  id: number;
  title: string;
  address: string;
  location: string;
  city: string;
  rent_price: number;
  sale_price: number | null;
  currency: string;
  beds: number;
  baths: number;
  property_type: string;
  area_sqft: number;
  rent_per_sqft?: number;
  furnishing: string; // 'Furnished' | 'Unfurnished'
  purpose: string;    // 'For Rent' | 'For Sale' | 'Both'
  latitude?: number;
  longitude?: number;
  amenities: string[];
  images: string[];
  posted_date?: string;
  match_score?: number;
  match_reasons?: string[];
  investment_yield?: number;
  is_active?: boolean;
  emi_estimate?: number;
}

export interface CustomerRequirements {
  intent?: 'search' | 'compare' | 'details' | 'site_visit' | 'agent' | 'general';
  buy_or_rent?: 'buy' | 'rent';
  purpose?: 'buy' | 'rent' | null;
  location?: string;
  area?: string;
  property_type?: string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  budget?: number;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_target?: number;
  currency?: string;
  timeline?: string;
  furnished?: boolean | string;
  parking?: boolean | string;
  amenities?: string[];
  family_size?: number;
  financing?: boolean | string;
  investment_or_personal_use?: 'investment' | 'personal_use';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  properties?: Property[];
  extracted_requirements?: Partial<CustomerRequirements>;
  action_type?: 'search' | 'compare' | 'details' | 'site_visit' | 'handoff' | 'general';
  audio_base64?: string;
  language?: string;
}

export type SiteVisitStatus = 'REQUESTED' | 'ASSIGNED' | 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';

export interface SiteVisit {
  id: number;
  property_id: number;
  property_title?: string;
  property_location?: string;
  property_price?: number;
  property_image?: string;
  user_id?: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  preferred_date: string;
  preferred_time: string;
  notes?: string;
  status: SiteVisitStatus;
  assigned_agent_id?: number;
  rescheduled_date?: string;
  rescheduled_time?: string;
  confirmation_notes?: string;
  created_at: string;
}

export interface CallRecord {
  id: number;
  call_sid: string;
  provider: string;
  lead_id?: number;
  customer_name?: string;
  customer_phone: string;
  direction: string;
  status: string;
  duration_seconds: number;
  outcome?: string;
  summary?: string;
  transcript?: string;
  callback_scheduled_at?: string;
  created_at: string;
}

export type LeadStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'CONTACTED'
  | 'SITE_VISIT'
  | 'NEGOTIATION'
  | 'HOT'
  | 'WARM'
  | 'COLD'
  | 'CONVERTED'
  | 'LOST';

export interface Lead {
  id: number;
  customer_id?: number;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  requirements: Partial<CustomerRequirements>;
  conversation_summary?: string;
  intent?: string;
  budget?: number;
  budget_min?: number;
  budget_max?: number;
  location?: string;
  preferred_location?: string;
  bedrooms?: string | number;
  property_type?: string;
  furnished?: boolean;
  interested_property_id?: number;
  site_visit_id?: number;
  preferred_language?: string;
  assigned_employee_id?: number;
  conversation_id?: string;
  interested_property?: {
    id: number;
    title: string;
    location: string;
    purpose: string;
    bedrooms: number;
    listed_price_aed?: number | null;
  };
  site_visit?: SiteVisit;
  recent_conversation?: { role: string; content: string; created_at: string }[];
  next_action?: string;
  timeline?: string;
  lead_score: number;
  lead_status: LeadStatus;
  score_factors?: string[];
  created_at: string;
  updated_at: string;
  follow_up_notes?: string;
  lead_source?: string;
  contact_preference?: string;
  consent_contact?: boolean;
  follow_up_date?: string;
  score_override?: boolean | number | null;
  score_override_reason?: string | null;
  requirement_summary?: string;
  requirements_summary?: string;
  notes?: string[];
  assigned_agent_id?: number;
}

export interface AuditLog {
  id: number;
  user_id?: number | null;
  user_email?: string | null;
  user_role?: string | null;
  action: string;
  event_type?: string;
  resource_type: string;
  resource_id?: string | number | null;
  details?: string | null;
  ip_address?: string | null;
  created_at: string;
}

export interface HandoffRequest {
  id: number;
  user_id?: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  requirement_summary: string;
  status: 'PENDING' | 'RESOLVED';
  created_at: string;
}

export interface PropertySearchParams {
  query?: string;
  location?: string;
  city?: string;
  beds?: number | string;
  baths?: number | string;
  min_price?: number;
  max_price?: number;
  property_type?: string;
  furnishing?: string;
  purpose?: string;
  sort_by?: 'price_asc' | 'price_desc' | 'beds' | 'area' | 'match';
  limit?: number;
  offset?: number;
}
