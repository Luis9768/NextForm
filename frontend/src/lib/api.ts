import axios from "axios";
import {
  AuthResponse,
  CallRecord,
  CallStatus,
  CreateEvaluationInput,
  CustomerInfo,
  CustomerLookupResponse,
  DashboardSummary,
  Evaluation,
  FlowExecutionResult,
  FormTemplate,
  FormTemplateInput,
  N8nWebhookPayload,
  Role,
  SectorItem,
  StudioActivity,
  StudioBenchmarkResponse,
  StudioBookmarkItem,
  StudioCollection,
  StudioExtensionItem,
  StudioFeedbackItem,
  StudioField,
  StudioFlow,
  StudioPolicyItem,
  StudioRoleItem,
  StudioTranslationItem,
  StudioWebhook,
  UserSummary,
} from "@/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("formshq_token");
    if (token && config.headers && !config.headers["X-API-KEY"]) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== "undefined" &&
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !error.config?.url?.includes("/auth/login") &&
      !error.config?.url?.includes("/integrations/n8n")
    ) {
      localStorage.removeItem("formshq_token");
      localStorage.removeItem("formshq_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; validationErrors?: Record<string, string> }
      | undefined;
    if (data?.validationErrors) {
      const firstValidation = Object.values(data.validationErrors)[0];
      if (firstValidation) return firstValidation;
    }
    if (data?.message) return data.message;
  }
  if (err instanceof Error) return err.message;
  return "Ocorreu um erro inesperado na comunicação com o servidor.";
}

export const authApi = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    return data;
  },
  me: async (): Promise<UserSummary> => {
    const { data } = await api.get<UserSummary>("/auth/me");
    return data;
  },
  changeOwnPassword: async (payload: {
    newPassword: string;
    confirmPassword: string;
  }): Promise<UserSummary> => {
    const { data } = await api.post<UserSummary>(
      "/auth/change-password",
      payload
    );
    return data;
  },
};

export const dashboardApi = {
  getSummary: async (params?: {
    sector?: string;
    analystId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardSummary> => {
    const cleanParams: Record<string, string> = {};
    if (params?.sector) cleanParams.sector = params.sector;
    if (params?.analystId) cleanParams.analystId = params.analystId;
    if (params?.startDate) cleanParams.startDate = params.startDate;
    if (params?.endDate) cleanParams.endDate = params.endDate;
    const { data } = await api.get<DashboardSummary>("/dashboard/summary", {
      params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    });
    return data;
  },
};

export const sectorsApi = {
  list: async (onlyActive = false): Promise<SectorItem[]> => {
    const { data } = await api.get<SectorItem[]>("/sectors", {
      params: { onlyActive },
    });
    return data;
  },
  create: async (payload: {
    name: string;
    code?: string;
    description?: string;
    active?: boolean;
  }): Promise<SectorItem> => {
    const { data } = await api.post<SectorItem>("/sectors", payload);
    return data;
  },
  update: async (
    id: string,
    payload: {
      name: string;
      code?: string;
      description?: string;
      active?: boolean;
    }
  ): Promise<SectorItem> => {
    const { data } = await api.put<SectorItem>(`/sectors/${id}`, payload);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/sectors/${id}`);
  },
};

export const customersApi = {
  lookupByPhone: async (
    phone: string,
    analystId?: string
  ): Promise<CustomerLookupResponse> => {
    const { data } = await api.get<CustomerLookupResponse>(
      "/customers/lookup",
      {
        params: analystId ? { phone, analystId } : { phone },
      }
    );
    return data;
  },
  triggerWebhookLookup: async (payload: {
    phone?: string;
    cpf?: string;
    motherName?: string;
    fatherName?: string;
    name?: string;
    searchKey?: string;
    keyType?: string;
    analystId?: string;
    webhookUrl?: string;
  }): Promise<CustomerLookupResponse> => {
    const { data } = await api.post<CustomerLookupResponse>(
      "/customers/webhook-lookup",
      payload
    );
    return data;
  },
  saveCustomerData: async (
    id: string,
    payload: {
      phone?: string;
      saleDate?: string;
      name: string;
      document: string;
      birthDate?: string;
      motherName?: string;
      fatherName?: string;
      contractedPlan?: string;
      proposal?: string;
      email?: string;
      paymentMethod?: string;
      invoiceType?: string;
      fullAddress?: string;
      dueDate?: string;
      earlyPortability?: string;
    }
  ): Promise<CustomerInfo> => {
    const { data } = await api.put<CustomerInfo>(`/customers/${id}`, payload);
    return data;
  },
};

export const callsApi = {
  list: async (params?: {
    status?: CallStatus;
    analystId?: string;
  }): Promise<CallRecord[]> => {
    const { data } = await api.get<CallRecord[]>("/calls", { params });
    return data;
  },
  getById: async (id: string): Promise<CallRecord> => {
    const { data } = await api.get<CallRecord>(`/calls/${id}`);
    return data;
  },
  uploadRecording: async (params: {
    file?: File | null;
    analystId: string;
    customerPhone: string;
    customerName?: string;
    campaign?: string;
    durationSeconds?: number;
  }): Promise<CallRecord> => {
    const formData = new FormData();
    if (params.file) {
      formData.append("file", params.file);
    }
    formData.append("analystId", params.analystId);
    formData.append("customerPhone", params.customerPhone);
    if (params.customerName) {
      formData.append("customerName", params.customerName);
    }
    if (params.campaign) {
      formData.append("campaign", params.campaign);
    }
    if (params.durationSeconds) {
      formData.append("durationSeconds", String(params.durationSeconds));
    }
    const { data } = await api.post<CallRecord>("/calls/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return data;
  },
};

export const formsApi = {
  list: async (onlyActive = false): Promise<FormTemplate[]> => {
    const { data } = await api.get<FormTemplate[]>("/forms", {
      params: { onlyActive },
    });
    return data;
  },
  getBySector: async (sector: string): Promise<FormTemplate> => {
    const { data } = await api.get<FormTemplate>("/forms/by-sector", {
      params: { sector },
    });
    return data;
  },
  getById: async (id: string): Promise<FormTemplate> => {
    const { data } = await api.get<FormTemplate>(`/forms/${id}`);
    return data;
  },
  create: async (payload: FormTemplateInput): Promise<FormTemplate> => {
    const { data } = await api.post<FormTemplate>("/forms", payload);
    return data;
  },
  update: async (
    id: string,
    payload: FormTemplateInput
  ): Promise<FormTemplate> => {
    const { data } = await api.put<FormTemplate>(`/forms/${id}`, payload);
    return data;
  },
  toggleActive: async (id: string): Promise<FormTemplate> => {
    const { data } = await api.patch<FormTemplate>(
      `/forms/${id}/toggle-active`
    );
    return data;
  },
};

export const evaluationsApi = {
  list: async (
    params?:
      | string
      | {
          analystId?: string;
          code?: string;
          analystName?: string;
          sector?: string;
          startDate?: string;
          endDate?: string;
        }
  ): Promise<Evaluation[]> => {
    if (typeof params === "string") {
      const { data } = await api.get<Evaluation[]>("/evaluations", {
        params: { analystId: params },
      });
      return data;
    }
    const cleanParams: Record<string, string> = {};
    if (params?.analystId) cleanParams.analystId = params.analystId;
    if (params?.code) cleanParams.code = params.code;
    if (params?.analystName) cleanParams.analystName = params.analystName;
    if (params?.sector) cleanParams.sector = params.sector;
    if (params?.startDate) cleanParams.startDate = params.startDate;
    if (params?.endDate) cleanParams.endDate = params.endDate;
    const { data } = await api.get<Evaluation[]>("/evaluations", {
      params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    });
    return data;
  },
  getById: async (id: string): Promise<Evaluation> => {
    const { data } = await api.get<Evaluation>(`/evaluations/${id}`);
    return data;
  },
  getByCallId: async (callRecordId: string): Promise<Evaluation> => {
    const { data } = await api.get<Evaluation>(
      `/evaluations/by-call/${callRecordId}`
    );
    return data;
  },
  submit: async (payload: CreateEvaluationInput): Promise<Evaluation> => {
    const { data } = await api.post<Evaluation>("/evaluations", payload);
    return data;
  },
};

export const usersApi = {
  list: async (
    role?: Role,
    active?: boolean
  ): Promise<UserSummary[]> => {
    const params: Record<string, unknown> = {};
    if (role) params.role = role;
    if (typeof active === "boolean") params.active = active;
    const { data } = await api.get<UserSummary[]>("/users", {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return data;
  },
  getById: async (id: string): Promise<UserSummary> => {
    const { data } = await api.get<UserSummary>(`/users/${id}`);
    return data;
  },
  create: async (payload: {
    name: string;
    email: string;
    password?: string;
    role: Role;
    department: string;
  }): Promise<UserSummary> => {
    const { data } = await api.post<UserSummary>("/users", payload);
    return data;
  },
  toggleStatus: async (
    id: string,
    active: boolean
  ): Promise<UserSummary> => {
    const { data } = await api.patch<UserSummary>(`/users/${id}/status`, {
      active,
    });
    return data;
  },
  changePassword: async (
    id: string,
    payload: {
      newPassword: string;
      confirmPassword: string;
      forceChangeOnNextLogin?: boolean;
    }
  ): Promise<UserSummary> => {
    const { data } = await api.patch<UserSummary>(
      `/users/${id}/password`,
      payload
    );
    return data;
  },
  resetFirstAccess: async (id: string): Promise<UserSummary> => {
    const { data } = await api.post<UserSummary>(
      `/users/${id}/reset-first-access`
    );
    return data;
  },
  updateAllowedSectors: async (
    id: string,
    allowedSectors: string[]
  ): Promise<UserSummary> => {
    const { data } = await api.put<UserSummary>(
      `/users/${id}/allowed-sectors`,
      allowedSectors
    );
    return data;
  },
  changeSector: async (
    id: string,
    payload: { newSector: string; reason?: string }
  ): Promise<UserSummary> => {
    const { data } = await api.patch<UserSummary>(
      `/users/${id}/sector`,
      payload
    );
    return data;
  },
};

export const studioApi = {
  listCollections: async (): Promise<StudioCollection[]> => {
    const { data } = await api.get<StudioCollection[]>("/studio/collections");
    return data;
  },
  createCollection: async (payload: {
    collection: string;
    displayName: string;
    description: string;
    primaryKeyType: string;
  }): Promise<StudioCollection> => {
    const { data } = await api.post<StudioCollection>(
      "/studio/collections",
      payload
    );
    return data;
  },
  addFieldToCollection: async (
    collection: string,
    payload: {
      field: string;
      type: string;
      interfaceType: string;
      width: string;
      required: boolean;
      description: string;
    }
  ): Promise<StudioField> => {
    const { data } = await api.post<StudioField>(
      `/studio/collections/${collection}/fields`,
      payload
    );
    return data;
  },
  listActivity: async (): Promise<StudioActivity[]> => {
    const { data } = await api.get<StudioActivity[]>("/studio/activity");
    return data;
  },
  listFlows: async (): Promise<StudioFlow[]> => {
    const { data } = await api.get<StudioFlow[]>("/studio/flows");
    return data;
  },
  createFlow: async (payload: {
    name: string;
    description: string;
    triggerType: string;
    triggerCollection: string;
    conditionSummary: string;
    actionSummary: string;
  }): Promise<StudioFlow> => {
    const { data } = await api.post<StudioFlow>("/studio/flows", payload);
    return data;
  },
  addFlowOperation: async (
    flowId: string,
    payload: {
      name: string;
      type: string;
      configSummary: string;
    }
  ): Promise<StudioFlow> => {
    const { data } = await api.post<StudioFlow>(
      `/studio/flows/${flowId}/operations`,
      payload
    );
    return data;
  },
  deleteFlowOperation: async (
    flowId: string,
    opId: string
  ): Promise<StudioFlow> => {
    const { data } = await api.delete<StudioFlow>(
      `/studio/flows/${flowId}/operations/${opId}`
    );
    return data;
  },
  toggleFlow: async (id: string): Promise<StudioFlow> => {
    const { data } = await api.patch<StudioFlow>(`/studio/flows/${id}/toggle`);
    return data;
  },
  triggerFlow: async (id: string): Promise<FlowExecutionResult> => {
    const { data } = await api.post<FlowExecutionResult>(
      `/studio/flows/${id}/trigger`
    );
    return data;
  },
  listRoles: async (): Promise<StudioRoleItem[]> => {
    const { data } = await api.get<StudioRoleItem[]>("/studio/roles");
    return data;
  },
  createRole: async (payload: {
    name: string;
    code: string;
    description: string;
    adminAccess: boolean;
    appAccess: boolean;
  }): Promise<StudioRoleItem> => {
    const { data } = await api.post<StudioRoleItem>("/studio/roles", payload);
    return data;
  },
  listPolicies: async (): Promise<StudioPolicyItem[]> => {
    const { data } = await api.get<StudioPolicyItem[]>("/studio/policies");
    return data;
  },
  createPolicy: async (payload: {
    name: string;
    roleCode: string;
    description: string;
    adminAccess: boolean;
    appAccess: boolean;
  }): Promise<StudioPolicyItem> => {
    const { data } = await api.post<StudioPolicyItem>(
      "/studio/policies",
      payload
    );
    return data;
  },
  getSettings: async (): Promise<Record<string, unknown>> => {
    const { data } = await api.get<Record<string, unknown>>("/studio/settings");
    return data;
  },
  updateSettings: async (
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    const { data } = await api.put<Record<string, unknown>>(
      "/studio/settings",
      payload
    );
    return data;
  },
  listBookmarks: async (): Promise<StudioBookmarkItem[]> => {
    const { data } = await api.get<StudioBookmarkItem[]>("/studio/bookmarks");
    return data;
  },
  createBookmark: async (payload: {
    name: string;
    collection: string;
    layout: string;
    filterJson: string;
    scope: string;
    targetHref?: string;
  }): Promise<StudioBookmarkItem> => {
    const { data } = await api.post<StudioBookmarkItem>(
      "/studio/bookmarks",
      payload
    );
    return data;
  },
  deleteBookmark: async (id: string): Promise<void> => {
    await api.delete(`/studio/bookmarks/${id}`);
  },
  listTranslations: async (): Promise<StudioTranslationItem[]> => {
    const { data } = await api.get<StudioTranslationItem[]>(
      "/studio/translations"
    );
    return data;
  },
  createTranslation: async (payload: {
    key: string;
    ptBR: string;
    enUS: string;
    esES: string;
  }): Promise<StudioTranslationItem> => {
    const { data } = await api.post<StudioTranslationItem>(
      "/studio/translations",
      payload
    );
    return data;
  },
  deleteTranslation: async (id: string): Promise<void> => {
    await api.delete(`/studio/translations/${id}`);
  },
  listExtensions: async (): Promise<StudioExtensionItem[]> => {
    const { data } = await api.get<StudioExtensionItem[]>("/studio/extensions");
    return data;
  },
  toggleExtension: async (id: string): Promise<StudioExtensionItem> => {
    const { data } = await api.post<StudioExtensionItem>(
      `/studio/extensions/${id}/toggle`
    );
    return data;
  },
  listFeedback: async (): Promise<StudioFeedbackItem[]> => {
    const { data } = await api.get<StudioFeedbackItem[]>("/studio/feedback");
    return data;
  },
  createFeedback: async (payload: {
    type: "BUG" | "FEATURE";
    title: string;
    module: string;
    severity: string;
    description: string;
  }): Promise<StudioFeedbackItem> => {
    const { data } = await api.post<StudioFeedbackItem>(
      "/studio/feedback",
      payload
    );
    return data;
  },
  upvoteFeedback: async (id: string): Promise<StudioFeedbackItem> => {
    const { data } = await api.post<StudioFeedbackItem>(
      `/studio/feedback/${id}/upvote`
    );
    return data;
  },
  listWebhooks: async (): Promise<StudioWebhook[]> => {
    const { data } = await api.get<StudioWebhook[]>("/studio/webhooks");
    return data;
  },
  createWebhook: async (payload: {
    name: string;
    url: string;
    collection: string;
    action: string;
  }): Promise<StudioWebhook> => {
    const { data } = await api.post<StudioWebhook>("/studio/webhooks", payload);
    return data;
  },
  toggleWebhook: async (id: string): Promise<StudioWebhook> => {
    const { data } = await api.patch<StudioWebhook>(
      `/studio/webhooks/${id}/toggle`
    );
    return data;
  },
  getBenchmarks: async (): Promise<StudioBenchmarkResponse> => {
    const { data } = await api.get<StudioBenchmarkResponse>(
      "/studio/benchmarks"
    );
    return data;
  },
};

export interface DirectusSyncResult {
  source: string;
  processedCollections: string[];
  totalReceived: number;
  importedCount: number;
  skippedDuplicates: number;
  failedCount: number;
  provisionedAnalysts: string[];
  importedEvaluationCodes: string[];
  warnings: string[];
  syncedAt: string;
}

export interface DirectusUserSyncResult {
  source: string;
  totalDirectusUsersFetched: number;
  syncedUsersCount: number;
  purgedFictionalUsers: number;
  purgedFictionalEvaluations: number;
  purgedFictionalCalls: number;
  purgedFictionalForms: number;
  purgedFictionalSectors: number;
  usersBySector: Record<string, number>;
  managersAndAdmins: string[];
  syncedAt: string;
}

export const directusApi = {
  syncUsers: async (payload?: {
    baseUrl?: string;
    apiToken?: string;
  }): Promise<DirectusUserSyncResult> => {
    const params: Record<string, string> = {};
    if (payload?.baseUrl) params.baseUrl = payload.baseUrl;
    if (payload?.apiToken) params.apiToken = payload.apiToken;
    const { data } = await api.post<DirectusUserSyncResult>(
      "/integrations/directus/sync-users",
      null,
      { params: Object.keys(params).length > 0 ? params : undefined }
    );
    return data;
  },
  pullSingleItem: async (payload: {
    collection: string;
    itemId: string;
    baseUrl?: string;
    apiToken?: string;
  }): Promise<DirectusSyncResult> => {
    const params: Record<string, string> = {};
    if (payload.baseUrl) params.baseUrl = payload.baseUrl;
    if (payload.apiToken) params.apiToken = payload.apiToken;
    const { data } = await api.post<DirectusSyncResult>(
      `/integrations/directus/items/${encodeURIComponent(
        payload.collection
      )}/${encodeURIComponent(payload.itemId)}`,
      null,
      { params: Object.keys(params).length > 0 ? params : undefined }
    );
    return data;
  },
  pullFromApi: async (payload: {
    baseUrl?: string;
    apiToken?: string;
    collection?: string;
    limit?: number;
  }): Promise<DirectusSyncResult> => {
    const { data } = await api.post<DirectusSyncResult>(
      "/integrations/directus/pull",
      payload
    );
    return data;
  },
  importBatch: async (payload: {
    collection?: string;
    directusBaseUrl?: string;
    items: Record<string, unknown>[];
  }): Promise<DirectusSyncResult> => {
    const { data } = await api.post<DirectusSyncResult>(
      "/integrations/directus/import",
      payload
    );
    return data;
  },
  importSamples: async (
    limitPerCollection = 5
  ): Promise<DirectusSyncResult> => {
    const { data } = await api.post<DirectusSyncResult>(
      `/integrations/directus/import-samples?limitPerCollection=${limitPerCollection}`
    );
    return data;
  },
};

export const n8nWebhookApi = {
  sendCall: async (
    payload: N8nWebhookPayload,
    apiKey: string
  ): Promise<CallRecord> => {
    const { data } = await axios.post<CallRecord>(
      `${API_BASE_URL}/integrations/n8n/calls`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
      }
    );
    return data;
  },
};
