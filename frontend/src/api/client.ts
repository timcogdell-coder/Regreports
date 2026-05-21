import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Auth
export const login = (username: string, password: string) =>
  api.post("/auth/login", { username, password });

export const logout = () => api.post("/auth/logout");

export const getCurrentUser = () => api.get("/auth/user");

// Companies
export const getCompanies = (includeInactive = false) =>
  api.get("/admin/companies", { params: includeInactive ? { include_inactive: true } : {} });
export const createCompany = (data: object) => api.post("/admin/companies", data);
export const updateCompany = (id: number, data: object) => api.put(`/admin/companies/${id}`, data);
export const getCompanyDependents = (id: number) => api.get(`/admin/companies/${id}/dependents`);
export const deleteCompany = (id: number) => api.delete(`/admin/companies/${id}`);

// Permits
export const getPermits = () => api.get("/permits");
export const getPermit = (id: number) => api.get(`/permits/${id}`);
export const getExpiringPermits = () => api.get("/permits/expiring");
export const createPermit = (data: object) => api.post("/permits", data);
export const updatePermit = (id: number, data: object) => api.put(`/permits/${id}`, data);
export const addPermitLimit = (permitId: number, data: object) =>
  api.post(`/permits/${permitId}/limits`, data);
export const addPermitLimitsBatch = (permitId: number, data: object[]) =>
  api.post(`/permits/${permitId}/limits/batch`, data);
export const deletePermitLimit = (permitId: number, limitId: number) =>
  api.delete(`/permits/${permitId}/limits/${limitId}`);

// Samples
export const submitSample = (data: object) => api.post("/samples", data);
export const getSamples = (companyId?: number) =>
  api.get("/samples", { params: { company_id: companyId } });
export const deleteSample = (id: number) => api.delete(`/samples/${id}`);
export const getSampleCorrections = (id: number) => api.get(`/samples/${id}/corrections`);
export const deleteSampleResult = (sampleId: number, resultId: number) =>
  api.delete(`/samples/${sampleId}/results/${resultId}`);
export const addSampleResult = (sampleId: number, data: object) =>
  api.post(`/samples/${sampleId}/results`, data);

// Compliance
export const getComplianceSummary = () => api.get("/compliance/summary");
export const checkMissingSamples = (companyId?: number) =>
  api.post("/compliance/check-missing", companyId ? { company_id: companyId } : {});
export const recalculateCompliance = (companyId?: number) =>
  api.post("/compliance/recalculate", companyId ? { company_id: companyId } : {});

export const getViolations = (companyId?: number) =>
  api.get("/compliance/violations", { params: { company_id: companyId } });
export const getViolationHistory = (companyId: number) =>
  api.get(`/compliance/violations/${companyId}/history`);
export const getSamplingSchedule = (companyId?: number) =>
  api.get("/compliance/schedule", { params: { company_id: companyId } });
export const getSncReport = (params: { year?: number; half?: number; company_id?: number }) =>
  api.get("/compliance/snc", { params });

// Enforcement
export const getPendingEnforcement = () => api.get("/enforcement/pending");
export const approveEnforcement = (id: number, data: object) =>
  api.post(`/enforcement/${id}/approve`, data);
export const overrideEnforcement = (id: number, data: object) =>
  api.post(`/enforcement/${id}/override`, data);
export const getEnforcementHistory = (companyId: number) =>
  api.get(`/enforcement/history/${companyId}`);

// ERG Configuration
export const getERGMatrix        = () => api.get("/erg-config/matrix");
export const updateERGMatrixEntry = (id: number, data: object) => api.put(`/erg-config/matrix/${id}`, data);
export const resetERGMatrix      = () => api.post("/erg-config/matrix/reset");
export const getERGFineSchedule  = () => api.get("/erg-config/fine-schedule");
export const updateERGFineSchedule = (id: number, data: object) => api.put(`/erg-config/fine-schedule/${id}`, data);

// Flow meters
export const getMeters = (companyId?: number) =>
  api.get("/admin/meters", { params: { company_id: companyId } });
export const createMeter = (data: object) => api.post("/admin/meters", data);
export const updateMeter = (id: number, data: object) => api.put(`/admin/meters/${id}`, data);

// Meter readings
export const getMeterReadings = (companyId?: number) =>
  api.get("/admin/meters/readings", { params: { company_id: companyId } });
export const getLastMeterReading = (companyId?: number, meterType = "process") =>
  api.get("/admin/meters/last-reading", { params: { company_id: companyId, meter_type: meterType } });
export const createMeterReading = (data: object) =>
  api.post("/admin/meters/readings", data);
export const updateMeterReading = (id: number, data: object) =>
  api.put(`/admin/meters/readings/${id}`, data);
export const deleteMeterReading = (id: number) =>
  api.delete(`/admin/meters/readings/${id}`);

// Reports
export const getSampleReport = (params: object) =>
  api.get("/reports/samples", { params });
export const getMonthlyReport = (params: object) =>
  api.get("/reports/monthly", { params });
export const exportSampleReportExcel = (params: object) =>
  api.get("/reports/samples/export", { params, responseType: "blob" });
export const exportMonthlyReportPDF = (params: object) =>
  api.get("/reports/monthly/export", { params, responseType: "blob" });

// COA import
export const parseCOA = (companyId: number, file: File) => {
  const form = new FormData();
  form.append("company_id", String(companyId));
  form.append("file", file);
  return api.post("/samples/parse-coa", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// Surcharges
export const calculateSurcharge = (data: object) => api.post("/surcharges/calculate", data);
export const getSurcharges = (companyId?: number) =>
  api.get("/surcharges", { params: companyId ? { company_id: companyId } : {} });

// Monthly flow reports
export const getFlowReports = (companyId?: number) =>
  api.get("/flow-reports", { params: companyId ? { company_id: companyId } : {} });
export const getLastEndReading = (companyId?: number) =>
  api.get("/flow-reports/last-end-reading", { params: companyId ? { company_id: companyId } : {} });
export const createFlowReport = (data: object) => api.post("/flow-reports", data);
export const deleteFlowReport = (id: number) => api.delete(`/flow-reports/${id}`);
export const reviewFlowReport = (id: number, data: object) => api.post(`/flow-reports/${id}/review`, data);
export const rejectFlowReport = (id: number, comment: string) =>
  api.post(`/flow-reports/${id}/review`, { action: "reject", comment });

// Config
export const getPOTWConfig = () => api.get("/admin/config/potw");
export const getParameters = () => api.get("/admin/parameters");
export const createParameter = (data: object) => api.post("/admin/parameters", data);
export const getFrequencies = () => api.get("/admin/frequencies");

// Audit log
export const getAuditLog = (limit = 100, offset = 0) =>
  api.get("/admin/audit-log", { params: { limit, offset } });

export default api;
