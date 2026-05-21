export type Role = "admin" | "coordinator" | "iu" | "finance";

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  company_id: number | null;
}

export interface Company {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
}

export interface Parameter {
  id: number;
  name: string;
  abbreviation: string;
  conversion_factor: number;
}

export interface Frequency {
  id: number;
  frequency_code: string;
  description: string;
}

export interface PermitLimit {
  id: number;
  permit_id: number;
  parameter_id: number;
  parameter_name: string;
  daily_max_concentration: number | null;
  daily_max_loading: number | null;
  monthly_avg_concentration: number | null;
  monthly_avg_loading: number | null;
  frequency_id: number | null;
  frequency_description: string | null;
  sample_type: string | null;
  is_monitor_report: boolean;
  is_range_limit: boolean;
  min_value: number | null;
  max_value: number | null;
  range_unit: string;
  weekly_max_concentration: number | null;
  weekly_max_loading: number | null;
  is_flow_limit: boolean;
  averaging_period: string | null;
  abbreviation: string | null;
}

export interface Permit {
  id: number;
  company_id: number;
  permit_number: string;
  effective_date: string;
  expiration_date: string;
  is_active: boolean;
  limits?: PermitLimit[];
}

export interface Sample {
  id: number;
  company_id: number;
  permit_id: number;
  sample_date: string;
  sampler_name: string;
  flow_mgd: number;
  sampling_days: number;
}

export interface Violation {
  id: number;
  company_id: number;
  parameter_id: number;
  parameter_name: string;
  violation_type: string;
  violation_date: string;
  violation_severity: string;
  exceedance_percent: number;
}

export interface EnforcementAction {
  id: number;
  company_id: number;
  violation_id: number;
  response_level: string;
  auto_generated_response: string;
  coordinator_notes: string;
  fine_amount: number;
  status: string;
  approval_date: string | null;
}

export interface SurchargeRecord {
  id: number;
  company_id: number;
  month: number;
  year: number;
  bod_charge: number;
  tss_charge: number;
  color_charge: number;
  total_charge: number;
  invoice_id: string;
}
