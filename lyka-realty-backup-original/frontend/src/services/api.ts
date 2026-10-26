import {
  User,
  Property,
  PropertySearchParams,
  CustomerRequirements,
  SiteVisit,
  Lead,
  LeadStatus,
  AuditLog,
  UserRole
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

type SessionExpiryCallback = () => void;
let sessionExpiryHandler: SessionExpiryCallback | null = null;

export const setSessionExpiryHandler = (handler: SessionExpiryCallback | null) => {
  sessionExpiryHandler = handler;
};

class ApiService {
  private csrfToken: string | null = null;

  public getCsrfToken(): string | null {
    if (this.csrfToken) return this.csrfToken;
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)lyka_csrf_token=([^;]+)/);
      if (match) {
        this.csrfToken = decodeURIComponent(match[1]);
        return this.csrfToken;
      }
    }
    return null;
  }

  public async fetchCsrfToken(): Promise<string> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/csrf`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        this.csrfToken = data.csrf_token || null;
        return this.csrfToken || '';
      }
    } catch {
      // ignore
    }
    return '';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Attach CSRF protection header for mutating requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      let csrf = this.getCsrfToken();
      if (!csrf && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/register') && !endpoint.startsWith('/auth/csrf')) {
        csrf = await this.fetchCsrfToken();
      }
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: 'include', // Always send server-managed HttpOnly cookies
        headers,
      });

      if (response.status === 401) {
        if (endpoint !== '/auth/login' && endpoint !== '/auth/me') {
          sessionExpiryHandler?.();
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      if (endpoint !== '/auth/me' || (error.message && !error.message.includes('401'))) {
        console.warn(`API Error on ${endpoint}:`, error.message);
      }
      throw error;
    }
  }

  // Auth Endpoints
  async register(data: { email: string; password: string; full_name: string; phone?: string }): Promise<{ user: User; access_token?: string; csrf_token?: string }> {
    const result = await this.request<{ user: User; access_token?: string; csrf_token?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (result.csrf_token) {
      this.csrfToken = result.csrf_token;
    }
    return result;
  }

  async login(data: { email: string; password: string; expected_role?: string }): Promise<{ user: User; access_token?: string; csrf_token?: string }> {
    const result = await this.request<{ user: User; access_token?: string; csrf_token?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (result.csrf_token) {
      this.csrfToken = result.csrf_token;
    }
    return result;
  }

  async logout(): Promise<{ message: string }> {
    this.csrfToken = null;
    return this.request<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // Property Endpoints
  async searchProperties(params: PropertySearchParams): Promise<{ properties: Property[]; total: number; page: number; limit: number }> {
    return this.request<{ properties: Property[]; total: number; page: number; limit: number }>('/properties/search', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getPropertyById(id: number, requirements?: Partial<CustomerRequirements>): Promise<Property> {
    const reqQuery = requirements ? `?requirements=${encodeURIComponent(JSON.stringify(requirements))}` : '';
    return this.request<Property>(`/properties/${id}${reqQuery}`);
  }

  async getFeaturedProperties(): Promise<Property[]> {
    return this.request<Property[]>('/properties/featured');
  }

  async getFilterOptions(): Promise<{ locations: string[]; property_types: string[]; cities: string[]; max_price: number }> {
    return this.request<{ locations: string[]; property_types: string[]; cities: string[]; max_price: number }>('/properties/filter-options');
  }

  // AI Consultant Endpoints
  async chat(
    message: string,
    conversationId?: string,
    history?: { role: string; content: string }[],
    currentRequirements?: Partial<CustomerRequirements>,
    selectedPropertyId?: number,
    synthesizeAudio = false
  ): Promise<{
    response: string;
    conversation_id: string;
    properties: Property[];
    extracted_requirements: Partial<CustomerRequirements>;
    action_type: 'search' | 'compare' | 'details' | 'site_visit' | 'handoff' | 'general';
    audio_base64?: string;
    language: string;
    audio_error?: string;
  }> {
    return this.request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        history: history || [],
        requirements: currentRequirements || {},
        selected_property_id: selectedPropertyId,
        synthesize_audio: synthesizeAudio,
      }),
    });
  }

  async chatStream(
    message: string,
    conversationId?: string,
    history?: { role: string; content: string }[],
    currentRequirements?: Partial<CustomerRequirements>,
    selectedPropertyId?: number,
    synthesizeAudio = false,
    callbacks?: {
      onToken?: (token: string) => void;
      onMeta?: (meta: {
        conversation_id: string;
        properties: Property[];
        extracted_requirements: Partial<CustomerRequirements>;
        action_type: 'search' | 'compare' | 'details' | 'site_visit' | 'handoff' | 'general';
        language: string;
      }) => void;
      onDone?: (data: {
        response: string;
        conversation_id: string;
        properties: Property[];
        extracted_requirements: Partial<CustomerRequirements>;
        action_type: 'search' | 'compare' | 'details' | 'site_visit' | 'handoff' | 'general';
        audio_base64?: string;
        language: string;
        audio_error?: string;
      }) => void;
      onError?: (err: Error) => void;
    },
    signal?: AbortSignal
  ): Promise<{
    response: string;
    conversation_id: string;
    properties: Property[];
    extracted_requirements: Partial<CustomerRequirements>;
    action_type: 'search' | 'compare' | 'details' | 'site_visit' | 'handoff' | 'general';
    audio_base64?: string;
    language: string;
    audio_error?: string;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    let csrf = this.getCsrfToken();
    if (!csrf) {
      csrf = await this.fetchCsrfToken();
    }
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }

    const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      headers,
      signal,
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        history: history || [],
        requirements: currentRequirements || {},
        selected_property_id: selectedPropertyId,
        synthesize_audio: synthesizeAudio,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || `Request failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported by browser');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalResult: any = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          let eventName = 'message';
          let dataStr = '';

          for (const line of trimmed.split('\n')) {
            if (line.startsWith('event:')) {
              eventName = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              dataStr += line.substring(5).trim();
            }
          }

          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              if (eventName === 'token' && parsed.token) {
                callbacks?.onToken?.(parsed.token);
              } else if (eventName === 'meta') {
                callbacks?.onMeta?.(parsed);
              } else if (eventName === 'done') {
                finalResult = parsed;
                callbacks?.onDone?.(parsed);
              } else if (eventName === 'error') {
                throw new Error(parsed.detail || 'Streaming failed');
              }
            } catch (jsonErr: any) {
              if (eventName === 'error') throw jsonErr;
              console.warn('SSE parse warning:', jsonErr);
            }
          }
        }
      }
    } catch (err: any) {
      callbacks?.onError?.(err);
      throw err;
    }

    if (!finalResult) {
      throw new Error('Stream completed without done event');
    }
    return finalResult;
  }

  async compareProperties(propertyIds: number[], userPriorities?: string[]): Promise<{
    properties: Property[];
    comparison_summary: string;
    recommendation: string;
    pros_cons: Record<number, { pros: string[]; cons: string[] }>;
  }> {
    return this.request('/properties/compare', {
      method: 'POST',
      body: JSON.stringify({ property_ids: propertyIds, priorities: userPriorities || [] }),
    });
  }

  // Site Visits
  async scheduleSiteVisit(data: {
    property_id: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    preferred_date: string;
    preferred_time: string;
    notes?: string;
    conversation_id?: string;
  }): Promise<SiteVisit> {
    return this.request<SiteVisit>('/site-visits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCustomerVisits(): Promise<SiteVisit[]> {
    return this.request<SiteVisit[]>('/site-visits/my-visits');
  }

  async getAllVisits(): Promise<SiteVisit[]> {
    return this.request<SiteVisit[]>('/site-visits');
  }

  async updateVisitStatus(
    id: number,
    data: { status: string; assigned_agent_id?: number; rescheduled_date?: string; rescheduled_time?: string; confirmation_notes?: string } | string,
    notes?: string
  ): Promise<SiteVisit> {
    const body = typeof data === 'string'
      ? { status: data, ...(notes ? { confirmation_notes: notes } : {}) }
      : { ...data, ...(notes ? { confirmation_notes: notes } : {}) };
    return this.request<SiteVisit>(`/site-visits/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  // Lead Enquiry Tracking (Public / Phone search for Lead workspace)
  async trackLeadEnquiry(phone: string): Promise<{ found: boolean; message: string; leads: Lead[] }> {
    return this.request(`/leads/enquiry-status?phone=${encodeURIComponent(phone)}`);
  }

  // Sales Agent Score Override & AI Draft
  async overrideLeadScore(leadId: number, newScore: number, reason: string): Promise<Lead> {
    return this.request<Lead>(`/employee/leads/${leadId}/score-override`, {
      method: 'POST',
      body: JSON.stringify({ new_score: newScore, reason }),
    });
  }

  async generateLeadAIDraft(
    leadId: number,
    channel: 'WHATSAPP' | 'EMAIL' | 'CALL_SCRIPT' | 'whatsapp' | 'email' | 'call_script' = 'WHATSAPP',
    tone = 'PROFESSIONAL_WARM'
  ): Promise<{ draft: string; draft_message: string; suggested_subject?: string; talking_points: string[] }> {
    const formattedChannel = channel.toUpperCase() as 'WHATSAPP' | 'EMAIL' | 'CALL_SCRIPT';
    const res = await this.generateAIFollowupDraft(leadId, formattedChannel, tone);
    return {
      ...res,
      draft: res.draft_message,
    };
  }

  async generateAIFollowupDraft(
    leadId: number,
    channel: 'WHATSAPP' | 'EMAIL' | 'CALL_SCRIPT' = 'WHATSAPP',
    tone = 'PROFESSIONAL_WARM'
  ): Promise<{ draft_message: string; suggested_subject?: string; talking_points: string[] }> {
    return this.request(`/employee/leads/${leadId}/ai-draft`, {
      method: 'POST',
      body: JSON.stringify({ lead_id: leadId, channel, tone }),
    });
  }

  // Manager Pipeline & Workload
  async getManagerPipeline(): Promise<{
    total_leads: number;
    status_breakdown: Record<string, number>;
    overdue_followups: number;
    conversion_rate: number;
    avg_response_time_minutes: number;
  }> {
    return this.request('/manager/pipeline');
  }

  async getManagerWorkload(): Promise<{
    unassigned_leads: number;
    agents: { agent_id: number; agent_name: string; agent_email: string; active_leads: number; assigned_visits: number }[];
  }> {
    return this.request('/manager/team-workload');
  }

  async getManagerTeamWorkload(): Promise<{
    unassigned_leads: number;
    agents: { agent_id: number; agent_name: string; agent_email: string; active_leads: number; assigned_visits: number }[];
  }> {
    return this.getManagerWorkload();
  }

  async reassignLead(leadId: number, employeeId: number | null, reason?: string): Promise<Lead> {
    return this.request<Lead>(`/manager/leads/reassign?lead_id=${leadId}`, {
      method: 'POST',
      body: JSON.stringify({ employee_id: employeeId }),
    });
  }

  // Telephony & AI Calling
  async initiateCall(data: {
    phone?: string;
    phone_number?: string;
    lead_id?: number;
    customer_name?: string;
    custom_intro?: string;
    purpose?: string;
  }): Promise<any> {
    const phone = data.phone || data.phone_number || '';
    const custom_intro = data.custom_intro || data.purpose;
    return this.request('/telephony/calls', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        lead_id: data.lead_id,
        customer_name: data.customer_name,
        custom_intro,
      }),
    });
  }

  async getCallHistory(leadId?: number): Promise<any[]> {
    const q = leadId ? `?lead_id=${leadId}` : '';
    return this.request(`/telephony/calls${q}`);
  }

  async getDNCList(): Promise<{ id: number; phone: string; reason?: string; created_at: string }[]> {
    return this.request('/telephony/dnc');
  }

  async addDNC(phone: string, reason?: string): Promise<{ success: boolean; phone: string }> {
    return this.request('/telephony/dnc', {
      method: 'POST',
      body: JSON.stringify({ phone, reason }),
    });
  }

  async addToDNC(phone: string, reason?: string): Promise<{ success: boolean; phone: string }> {
    return this.addDNC(phone, reason);
  }

  async removeDNC(phone: string): Promise<{ success: boolean }> {
    return this.request(`/telephony/dnc/${encodeURIComponent(phone)}`, {
      method: 'DELETE',
    });
  }

  async removeFromDNC(phone: string): Promise<{ success: boolean }> {
    return this.removeDNC(phone);
  }

  async getTelephonySettings(): Promise<{
    provider: string;
    is_enabled: boolean;
    mock_mode: boolean;
    daily_call_limit: number;
    max_concurrency: number;
    monthly_budget_usd: number;
    mode_label: string;
  }> {
    return this.request('/telephony/settings');
  }

  async updateTelephonySettings(data: any): Promise<any> {
    return this.request('/telephony/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Super Admin & Audit
  async getAuditLogs(limit = 50, action?: string): Promise<AuditLog[]> {
    const q = action ? `?limit=${limit}&action=${encodeURIComponent(action)}` : `?limit=${limit}`;
    return this.request(`/admin/audit-logs${q}`);
  }

  async getAdminAuditLogs(limit = 50, action?: string): Promise<AuditLog[]> {
    return this.getAuditLogs(limit, action);
  }

  async getSuperAdminAuditTrail(limit = 100): Promise<any[]> {
    return this.request(`/super-admin/audit-trail?limit=${limit}`);
  }

  async getSuperAdminAdmins(): Promise<User[]> {
    return this.request<User[]>('/super-admin/admins');
  }

  async createAdminAccount(data: { email: string; password: string; full_name: string; phone?: string; role?: string }): Promise<User> {
    return this.request<User>('/super-admin/admins', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async assignSuperAdminRole(userId: number, role: string): Promise<User> {
    return this.request<User>('/super-admin/assign-role', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role }),
    });
  }

  async getPlatformConfig(): Promise<any> {
    return this.request('/super-admin/platform-config');
  }

  async updatePlatformConfig(data: any): Promise<any> {
    try {
      return await this.request('/super-admin/platform-config', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    } catch {
      return this.getPlatformConfig();
    }
  }

  // Profile & Password Reset
  async updateProfile(data: { full_name?: string; phone?: string }): Promise<User> {
    return this.request<User>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async requestPasswordReset(email: string): Promise<{ message: string; reset_token?: string }> {
    return this.request('/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  }

  async getHealth(): Promise<{ status: string; database: string; database_type: string }> {
    return this.request('/health');
  }

  // Shortlist
  async getShortlist(): Promise<Property[]> {
    return this.request<Property[]>('/customer/shortlist');
  }

  async toggleShortlist(propertyId: number): Promise<{ is_shortlisted: boolean }> {
    return this.request<{ is_shortlisted: boolean }>(`/customer/shortlist/${propertyId}`, {
      method: 'POST',
    });
  }

  // Human Handoff Request
  async requestAgentHandoff(data: {
    customer_name: string;
    customer_phone: string;
    customer_email?: string;
    requirement_summary: string;
    conversation_id?: string;
    interested_property_id?: number;
    preferred_language?: string;
    requirements?: Partial<CustomerRequirements>;
  }): Promise<{ id: number; status: string; message: string }> {
    return this.request<{ id: number; status: string; message: string }>('/handoff', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Employee CRM
  async getLeads(status?: string): Promise<Lead[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<Lead[]>(`/employee/leads${query}`);
  }

  async updateLeadStatus(id: number, status: LeadStatus): Promise<Lead> {
    return this.request<Lead>(`/employee/leads/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async addLeadNote(id: number, note: string): Promise<Lead> {
    return this.request<Lead>(`/employee/leads/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  async getCRMAnalytics(): Promise<{
    total_leads: number;
    hot_leads: number;
    scheduled_visits: number;
    conversion_rate: number;
    leads_by_status: Record<string, number>;
    leads_by_location: Record<string, number>;
    recent_activity: any[];
  }> {
    return this.request('/employee/analytics');
  }

  // Admin Endpoints
  async getAdminStats(): Promise<{
    total_users: number;
    total_properties: number;
    total_leads: number;
    total_site_visits: number;
    users_by_role: Record<string, number>;
  }> {
    return this.request('/admin/stats');
  }

  async getAdminUsers(): Promise<User[]> {
    return this.request<User[]>('/admin/users');
  }

  async createEmployee(data: { email: string; password: string; full_name: string; phone?: string }): Promise<User> {
    return this.request<User>('/admin/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async setUserActive(userId: number, isActive: boolean): Promise<User> {
    return this.request<User>(`/admin/users/${userId}/active?is_active=${isActive}`, {
      method: 'PATCH',
    });
  }

  async setUserRole(userId: number, role: UserRole): Promise<User> {
    return this.request<User>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async getAdminProperties(limit = 50, offset = 0): Promise<{ properties: Property[]; total: number; limit: number; offset: number }> {
    return this.request(`/admin/properties?limit=${limit}&offset=${offset}`);
  }

  async updateAdminProperty(propertyId: number, changes: Partial<Property>): Promise<Property> {
    return this.request<Property>(`/admin/properties/${propertyId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  }

  async setPropertyActive(propertyId: number, isActive: boolean): Promise<Property> {
    return this.request<Property>(`/admin/properties/${propertyId}/active?is_active=${isActive}`, {
      method: 'PATCH',
    });
  }

  // Deterministic EMI Calculator
  calculateEMI(
    propertyPrice: number,
    downPaymentPercent: number = 20,
    annualInterestRatePercent: number = 4.5,
    tenureYears: number = 25
  ): {
    principal: number;
    downPayment: number;
    monthlyEMI: number;
    totalInterest: number;
    totalRepayment: number;
  } {
    const downPayment = (propertyPrice * downPaymentPercent) / 100;
    const principal = propertyPrice - downPayment;
    const monthlyRate = annualInterestRatePercent / 12 / 100;
    const numberOfPayments = tenureYears * 12;

    if (monthlyRate === 0) {
      const monthlyEMI = principal / numberOfPayments;
      return {
        principal,
        downPayment,
        monthlyEMI: Math.round(monthlyEMI),
        totalInterest: 0,
        totalRepayment: principal,
      };
    }

    const monthlyEMI =
      (principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
      (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
    const totalRepayment = monthlyEMI * numberOfPayments;
    const totalInterest = totalRepayment - principal;

    return {
      principal: Math.round(principal),
      downPayment: Math.round(downPayment),
      monthlyEMI: Math.round(monthlyEMI),
      totalInterest: Math.round(totalInterest),
      totalRepayment: Math.round(totalRepayment),
    };
  }
}

export const api = new ApiService();
