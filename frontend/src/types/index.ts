export type Role = "ROLE_ADMIN" | "ROLE_GESTOR" | "ROLE_ANALISTA";

export type CallStatus = "PENDENTE" | "AVALIADA";

export type EvaluationStatus = "APROVADO" | "REPROVADO" | "ZERADO_ERRO_GRAVE";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  managerId?: string | null;
  managerName?: string | null;
  allowedSectors?: string[];
  active: boolean;
  mustChangePassword?: boolean;
}

export interface SectorTransitionLog {
  id: string;
  analystId: string;
  analystName: string;
  previousSector: string;
  newSector: string;
  changedById: string;
  changedByName: string;
  reason?: string;
  changedAt: string;
}

export interface CustomerInfo {
  id: string;
  phone: string;
  saleDate?: string;
  name: string;
  document: string;
  birthDate?: string;
  motherName?: string;
  fatherName?: string;
  contractedPlan?: string;
  proposal?: string;
  email: string;
  paymentMethod?: string;
  invoiceType?: string;
  fullAddress?: string;
  dueDate?: string;
  earlyPortability?: string;
  protocol: string;
}

export interface CustomerLookupResponse {
  customer: CustomerInfo;
  source: string;
  recordings: CallRecord[];
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  user: UserSummary;
}

export interface FormItem {
  id: string;
  label: string;
  description?: string;
  category: string;
  fatalError: boolean;
  points: number;
  weight?: number;
  displayOrder: number;
}

export interface FormTemplate {
  id: string;
  name: string;
  description?: string;
  sector?: string;
  passingScorePercentage: number;
  version: number;
  active: boolean;
  maxPossiblePoints: number;
  standardItemsCount: number;
  fatalItemsCount: number;
  items: FormItem[];
  createdAt: string;
  updatedAt: string;
}

export interface FormItemInput {
  label: string;
  description?: string;
  category: string;
  fatalError: boolean;
  weight?: number;
  displayOrder: number;
}

export interface FormTemplateInput {
  name: string;
  description?: string;
  sector?: string;
  passingScorePercentage: number;
  active: boolean;
  items: FormItemInput[];
}

export interface CallRecord {
  id: string;
  externalCallId: string;
  analyst: UserSummary;
  customer?: CustomerInfo | null;
  customerIdentifier: string;
  callDate: string;
  durationSeconds: number;
  audioUrl: string;
  status: CallStatus;
  channel: string;
  campaign: string;
  metadata: Record<string, unknown>;
  evaluationId?: string | null;
  finalScorePercentage?: number | null;
  evaluationStatus?: EvaluationStatus | null;
  fatalErrorTriggered?: boolean | null;
  createdAt: string;
}

export interface ItemEvaluationInput {
  formItemId: string;
  checked: boolean;
  observation?: string;
}

export interface CreateEvaluationInput {
  callRecordId: string;
  formTemplateId: string;
  answers: ItemEvaluationInput[];
  generalFeedback?: string;
  transcricao?: string;
}

export interface EvaluationItemSnapshot {
  id: string;
  originalItemId?: string;
  label: string;
  description?: string;
  category: string;
  fatalError: boolean;
  points: number;
  displayOrder: number;
  checked: boolean;
  observation?: string;
}

export interface Evaluation {
  id: string;
  callRecord: CallRecord;
  evaluator: UserSummary;
  analyst: UserSummary;
  analystSectorSnapshot?: string;
  formTemplateId?: string;
  formNameSnapshot: string;
  formVersionSnapshot: number;
  passingScoreSnapshot: number;
  obtainedPoints: number;
  maxPossiblePoints: number;
  rawScorePercentage: number;
  finalScorePercentage: number;
  fatalErrorTriggered: boolean;
  status: EvaluationStatus;
  generalFeedback?: string;
  items: EvaluationItemSnapshot[];
  evaluatedAt: string;
}

export interface AnalystPerformance {
  analystId: string;
  analystName: string;
  analystEmail: string;
  department: string;
  totalCalls: number;
  evaluatedCalls: number;
  pendingCalls: number;
  averageScore: number;
  approvedCount: number;
  failedCount: number;
  fatalErrorCount: number;
}

export interface ScoreTimelinePoint {
  label: string;
  averageScore: number;
  evaluationsCount: number;
}

export interface SectorPerformance {
  sector: string;
  evaluationsCount: number;
  averageScore: number;
  approvalRatePercentage: number;
}

export interface CriteriaPerformance {
  category: string;
  criterionLabel: string;
  totalEvaluated: number;
  compliantCount: number;
  complianceRatePercentage: number;
}

export interface SectorItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  totalCalls: number;
  pendingCalls: number;
  evaluatedCalls: number;
  monthlyEvaluationsCount: number;
  averageScorePercentage: number;
  approvalRatePercentage: number;
  fatalErrorRatePercentage: number;
  approvedCount: number;
  failedCount: number;
  fatalErrorCount: number;
  topAnalyst?: AnalystPerformance | null;
  scoreTimeline: ScoreTimelinePoint[];
  analystRanking: AnalystPerformance[];
  sectorAverages?: SectorPerformance[];
  criteriaComparison?: CriteriaPerformance[];
  recentEvaluations: Evaluation[];
}

export interface N8nWebhookPayload {
  externalCallId: string;
  analystEmail: string;
  customerIdentifier: string;
  callDate: string;
  durationSeconds: number;
  audioUrl: string;
  metadata: {
    channel: string;
    campaign: string;
    [key: string]: unknown;
  };
}

export interface StudioField {
  field: string;
  type: string;
  primaryKey: boolean;
  required: boolean;
  description: string;
}

export interface StudioPermission {
  create: string;
  read: string;
  update: string;
  delete: string;
}

export interface StudioCollection {
  collection: string;
  displayName: string;
  description: string;
  icon: string;
  itemCount: number;
  readOnlyForAnalyst: boolean;
  fields: StudioField[];
  permissions: StudioPermission;
}

export interface StudioActivity {
  id: string;
  action: string;
  collection: string;
  itemKey: string;
  actorName: string;
  actorRole: string;
  summary: string;
  timestamp: string;
}

export interface StudioFlowOperation {
  id: string;
  name: string;
  type: string;
  configSummary: string;
}

export interface StudioFlow {
  id: string;
  name: string;
  description: string;
  status: string;
  triggerType: string;
  triggerCollection: string;
  operations: StudioFlowOperation[];
  totalExecutions: number;
  lastExecutedAt: string;
  lastExecutionStatus: string;
}

export interface FlowExecutionStepLog {
  stepName: string;
  operationType: string;
  status: string;
  durationMs: number;
  outputDetail: string;
}

export interface FlowExecutionResult {
  flowId: string;
  flowName: string;
  status: string;
  durationMs: number;
  executedAt: string;
  steps: FlowExecutionStepLog[];
}

export interface StudioWebhook {
  id: string;
  name: string;
  method: string;
  url: string;
  status: string;
  actions: string[];
  collections: string[];
  deliveriesCount: number;
  lastHttpStatus: string;
}

export interface CategoryBenchmark {
  category: string;
  totalItemsEvaluated: number;
  checkedItemsCount: number;
  adherencePercentage: number;
  targetPercentage: number;
}

export interface AnalystBenchmark {
  analystId: string;
  analystName: string;
  department: string;
  evaluatedCalls: number;
  averageScore: number;
  targetScore: number;
  deltaFromTarget: number;
  complianceRate: number;
}

export interface StudioBenchmarkResponse {
  companyTargetScore: number;
  currentTeamAverage: number;
  complianceRateWithoutFatal: number;
  averageCallDurationSeconds: number;
  dbQueryLatencyMs: number;
  apiSerializationLatencyMs: number;
  audioStreamThroughputKbps: number;
  categoryBenchmarks: CategoryBenchmark[];
  analystBenchmarks: AnalystBenchmark[];
}

export interface StudioRoleMember {
  id: string;
  name: string;
  email: string;
  department: string;
}

export interface StudioRoleItem {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  adminAccess: boolean;
  appAccess: boolean;
  enforceTwoFactor: boolean;
  policies: string[];
  users?: StudioRoleMember[];
  usersCount?: number;
}

export interface StudioPolicyRule {
  collection: string;
  create: string;
  read: string;
  update: string;
  delete: string;
  share: string;
  filterRule: string;
}

export interface StudioPolicyItem {
  id: string;
  name: string;
  roleCode: string;
  description: string;
  ipAccess: string;
  adminAccess: boolean;
  appAccess: boolean;
  rules: StudioPolicyRule[];
}

export interface StudioBookmarkItem {
  id: string;
  name: string;
  collection: string;
  layout: string;
  filterJson: string;
  scope: string;
  icon: string;
  targetHref: string;
}

export interface StudioTranslationItem {
  id: string;
  key: string;
  ptBR: string;
  enUS: string;
  esES: string;
}

export interface StudioExtensionItem {
  id: string;
  name: string;
  packageName: string;
  type: string;
  version: string;
  author: string;
  description: string;
  installed: boolean;
  enabled: boolean;
  downloads: number;
  verified: boolean;
}

export interface StudioFeedbackItem {
  id: string;
  type: "BUG" | "FEATURE";
  title: string;
  module: string;
  severity: string;
  status: string;
  votes: number;
  author: string;
  createdAt: string;
  description: string;
}



