import React, { useEffect, useRef, useState } from "react";
import { User, Company, Permit, Parameter, Frequency } from "../../types";
import NotificationBell from "../NotificationBell";
import { getCompanies, createCompany, updateCompany, getCompanyDependents, deleteCompany,
         getPermits, getPermit, createPermit, updatePermit, getExpiringPermits,
         addPermitLimit, addPermitLimitsBatch, deletePermitLimit, getParameters, createParameter, getFrequencies, logout,
         getMeters, createMeter, updateMeter,
         getMeterReadings, updateMeterReading, deleteMeterReading,
         getSampleReport, getMonthlyReport, exportSampleReportExcel, exportMonthlyReportPDF,
         getSamplingSchedule, deleteSample, deleteSampleResult, addSampleResult,
         getComplianceSummary, recalculateCompliance, getAuditLog, getSampleCorrections,
         checkMissingSamples, getFlowReports, reviewFlowReport, rejectFlowReport, deleteFlowReport,
         getSncReport,
         getPendingEnforcement, approveEnforcement, overrideEnforcement,
         getEnforcementHistory,
         getERGMatrix, updateERGMatrixEntry, resetERGMatrix,
         getERGFineSchedule, updateERGFineSchedule } from "../../api/client";
import api from "../../api/client";
import CoordinatorDashboard from "./CoordinatorDashboard";
import FinanceDashboard     from "./FinanceDashboard";
import IUDashboard          from "./IUDashboard";

type ViewAs = "coordinator" | "finance" | "iu" | null;
const VIEW_AS_LABELS: Record<NonNullable<ViewAs>, string> = {
  coordinator: "Coordinator",
  finance:     "Finance",
  iu:          "Industrial User",
};

interface Props { user: User; onLogout: () => void; }

export default function AdminDashboard({ user, onLogout }: Props) {
  const [viewAs, setViewAs] = useState<ViewAs>(null);
  const [viewAsIUCompany, setViewAsIUCompany] = useState<number | null>(null);
  const [tab, setTab]             = useState<"companies"|"permits"|"users"|"review"|"meters"|"reports"|"schedule"|"auditlog"|"compliance"|"enforcement">("companies");
  const [scheduleRows, setScheduleRows] = useState<any[]>([]);
  const [scheduleCompany, setScheduleCompany] = useState<string>("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [permits, setPermits]     = useState<Permit[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [users, setUsers]         = useState<User[]>([]);
  const [newCompany, setNewCompany] = useState({ name:"", contact_person:"", phone:"", email:"" });
  const [newPermit, setNewPermit]   = useState({ company_id:"", permit_number:"",
                                                  effective_date:"", expiration_date:"" });
  const [newUser, setNewUser]     = useState({ username:"", email:"", password:"",
                                               role:"iu", company_id:"" });
  const [selectedPermit, setSelectedPermit] = useState<number | "">("");
  const [selectedPermitLimits, setSelectedPermitLimits] = useState<any[]>([]);
  const [newLimit, setNewLimit]   = useState({
    parameter_id:"", daily_max_concentration:"", daily_max_loading:"",
    weekly_max_concentration:"", weekly_max_loading:"",
    monthly_avg_concentration:"", monthly_avg_loading:"",
    frequency_id:"", sample_type:"", is_monitor_report: false,
    is_range_limit: false, min_value:"", max_value:"", range_unit:"s.u.",
    is_flow_limit: false, averaging_period:"daily_max",
  });
  const [status, setStatus]           = useState("");
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [permitsCompanyFilter, setPermitsCompanyFilter] = useState<number | null>(null);
  const [isViewingPermit, setIsViewingPermit] = useState(false);
  const [permitEditMode, setPermitEditMode]   = useState(false);
  const [renewFromPermitId, setRenewFromPermitId] = useState<number | null>(null);
  const [paramSearch, setParamSearch]             = useState("");
  const [paramDropdownOpen, setParamDropdownOpen] = useState(false);
  const [newParamForm, setNewParamForm]           = useState<{show:boolean; name:string; abbreviation:string; conversion_factor:string}>({show:false, name:"", abbreviation:"", conversion_factor:"8.34"});
  const [newParamSaving, setNewParamSaving]       = useState(false);
  const [limitFormError, setLimitFormError]       = useState("");
  const [editingLimitId, setEditingLimitId]       = useState<number | null>(null);
  const [limitQueue, setLimitQueue]               = useState<any[]>([]);
  const [queueSaving, setQueueSaving]             = useState(false);
  const [editingUserId, setEditingUserId]           = useState<number | null>(null);
  const [reviewSamples, setReviewSamples]           = useState<any[]>([]);
  const [reviewSubMode, setReviewSubMode]           = useState<"samples"|"flow_reports">("samples");
  const [flowReports, setFlowReports]               = useState<any[]>([]);
  const [selectedFlowReport, setSelectedFlowReport] = useState<any | null>(null);
  const [flowReviewComment, setFlowReviewComment]   = useState("");
  const [flowReviewMsg, setFlowReviewMsg]           = useState<{type:"ok"|"err"; text:string} | null>(null);
  const [flowReviewSubmitting, setFlowReviewSubmitting] = useState(false);
  const [flowReportFilterStatus, setFlowReportFilterStatus] = useState<"all"|"pending"|"reviewed"|"rejected">("pending");
  const [flowReportFilterCompany, setFlowReportFilterCompany] = useState<string>("");
  const [missingCheckResult, setMissingCheckResult] = useState<{new_violations:number, enforcement_actions:number} | null>(null);
  const [missingCheckLoading, setMissingCheckLoading] = useState(false);
  const [reviewFilterStatus,  setReviewFilterStatus]  = useState<"all"|"pending"|"reviewed">("all");
  const [reviewFilterCompany, setReviewFilterCompany] = useState<string>("");
  const [reviewFilterStart,   setReviewFilterStart]   = useState<string>("");
  const [reviewFilterEnd,     setReviewFilterEnd]     = useState<string>("");
  const [selectedSample, setSelectedSample]         = useState<any | null>(null);
  const [sampleFlowReport, setSampleFlowReport]     = useState<any | null>(null);
  const [reviewComment, setReviewComment]           = useState("");
  const [reviewSubmitting, setReviewSubmitting]     = useState(false);
  const [reviewMsg, setReviewMsg]                   = useState<{type:"ok"|"err", text:string} | null>(null);
  const [editingResultId, setEditingResultId]       = useState<number | null>(null);
  const [editingResultValue, setEditingResultValue] = useState("");
  const [correctionReason, setCorrectionReason]     = useState("");
  const [correctionHistory, setCorrectionHistory]   = useState<any[]>([]);
  const [showAddParam, setShowAddParam]             = useState(false);
  const [addParamLimits, setAddParamLimits]         = useState<any[]>([]);
  const [addParamLimitId, setAddParamLimitId]       = useState<string>("");
  const [addParamConc, setAddParamConc]             = useState<string>("");
  const [addParamSaving, setAddParamSaving]         = useState(false);
  const [correctionPanel, setCorrectionPanel]       = useState<any | null>(null);
  const [correctionNewValue, setCorrectionNewValue] = useState<string>("");
  const [correctionNote, setCorrectionNote]         = useState<string>("");
  const [correctionSaving, setCorrectionSaving]     = useState(false);
  const [editingHeader, setEditingHeader]           = useState(false);
  const [headerEdits, setHeaderEdits]               = useState<{sample_date:string; sampler_name:string}>({sample_date:"", sampler_name:""});
  const [showUserForm, setShowUserForm]             = useState(false);
  const [meters, setMeters]                         = useState<any[]>([]);
  const [metersCompanyFilter, setMetersCompanyFilter] = useState<string>("");
  const [newMeter, setNewMeter]                     = useState({ meter_id:"", description:"", pulse_factor:"1", is_active: true, meter_type:"process" });
  const [editingMeterId, setEditingMeterId]         = useState<number | null>(null);
  const [showMeterForm, setShowMeterForm]           = useState(false);
  const [adminReadings, setAdminReadings]           = useState<any[]>([]);
  const [editingReadingId, setEditingReadingId]     = useState<number | null>(null);
  const [editingReadingForm, setEditingReadingForm] = useState<{meter_id:string; reading_date:string; reading_start:string; reading_end:string; sampling_period_days:string}>({meter_id:"", reading_date:"", reading_start:"", reading_end:"", sampling_period_days:""});
  const [readingsPurposeFilter, setReadingsPurposeFilter] = useState<"all"|"monthly">("all");
  const [readingSaving, setReadingSaving]           = useState(false);
  const [editingCompany, setEditingCompany]         = useState(false);
  const [editCompanyForm, setEditCompanyForm]       = useState<{name:string; contact_person:string; phone:string; email:string; address:string}>({name:"", contact_person:"", phone:"", email:"", address:""});
  const [reportParams, setReportParams] = useState({
    company_id: "", parameter_id: "",
    start_date: "", end_date: "", status: "",
  });
  const [reportRows, setReportRows]     = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRan, setReportRan]       = useState(false);
  const [reportMode, setReportMode]     = useState<"detail"|"monthly">("detail");
  const [dmrParams, setDmrParams]       = useState({ company_id: "", month: "", year: "" });
  const [dmrData, setDmrData]           = useState<any | null>(null);
  const [dmrLoading, setDmrLoading]     = useState(false);
  const [dmrDrillParam, setDmrDrillParam] = useState<string | null>(null);
  const [auditLogs, setAuditLogs]           = useState<any[]>([]);
  const [auditLoading, setAuditLoading]     = useState(false);
  const [enfActions, setEnfActions]         = useState<any[]>([]);
  const [enfLoading, setEnfLoading]         = useState(false);
  const [enfOverrideId, setEnfOverrideId]   = useState<number | null>(null);
  const [enfOverrideLevel, setEnfOverrideLevel] = useState("");
  const [enfOverrideFine, setEnfOverrideFine]   = useState("");
  const [enfOverrideNotes, setEnfOverrideNotes] = useState("");
  const [enfApproveId, setEnfApproveId]     = useState<number | null>(null);
  const [enfApproveSig, setEnfApproveSig]   = useState("");
  const [enfApproveNotes, setEnfApproveNotes] = useState("");
  const [enfSaving, setEnfSaving]           = useState(false);
  // ERG config
  const [ergMatrix, setErgMatrix]           = useState<any[]>([]);
  const [ergSchedule, setErgSchedule]       = useState<any[]>([]);
  const [ergLoading, setErgLoading]         = useState(false);
  const [ergEditing, setErgEditing]         = useState<number | null>(null);
  const [ergEditLevel, setErgEditLevel]     = useState("");
  const [ergEditFine, setErgEditFine]       = useState("");
  const [ergSchedEditing, setErgSchedEditing] = useState<number | null>(null);
  const [ergSchedMin, setErgSchedMin]       = useState("");
  const [ergSchedMax, setErgSchedMax]       = useState("");
  const [ergSaving, setErgSaving]           = useState(false);
  const [complianceSummary, setComplianceSummary]   = useState<any[]>([]);
  const [complianceLoading, setComplianceLoading]   = useState(false);
  const [recalculating, setRecalculating]           = useState(false);
  const [recalcMsg, setRecalcMsg]                   = useState<string | null>(null);
  const [expandedCompany, setExpandedCompany]       = useState<number | null>(null);
  const [sncResults, setSncResults]                 = useState<any[]>([]);
  const [sncLoading, setSncLoading]                 = useState(false);
  const [sncYear, setSncYear]                       = useState<number>(new Date().getFullYear());
  const [sncHalf, setSncHalf]                       = useState<number>(new Date().getMonth() < 6 ? 1 : 2);
  const [sncCompany, setSncCompany]                 = useState<number | "">("");
  const [deleteModal, setDeleteModal]   = useState<{company: any; dependents: any} | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [expiringPermits, setExpiringPermits] = useState<any[]>([]);
  const [permitAlertDismissed, setPermitAlertDismissed] = useState(false);
  const companiesListRef = useRef<HTMLDivElement>(null);
  const limitFormRef     = useRef<HTMLFormElement>(null);
  const limitsRef        = useRef<HTMLDivElement>(null);
  const paramComboRef    = useRef<HTMLDivElement>(null);
  const paramInputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCompanies().then(r => setCompanies(r.data));
    getPermits().then(r => setPermits(r.data));
    getParameters().then(r => setParameters([...r.data].sort((a: any, b: any) => a.name.localeCompare(b.name))));
    getFrequencies().then(r => setFrequencies(r.data));
    api.get("/admin/users").then(r => setUsers(r.data));
    getExpiringPermits().then(r => setExpiringPermits(r.data)).catch(() => {});
    api.get("/samples").then(r => setReviewSamples(r.data));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (paramComboRef.current && !paramComboRef.current.contains(e.target as Node)) {
        setParamDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCompany(newCompany);
      setStatus("Company added.");
      setNewCompany({ name:"", contact_person:"", phone:"", email:"" });
      setShowAddCompany(false);
      setTimeout(() => companiesListRef.current?.focus(), 0);
      getCompanies().then(r => setCompanies(r.data));
    } catch (err: any) {
      setStatus(`Error: ${err.response?.data?.error ?? "Failed to add company"}`);
    }
  };

  const handleAddPermit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...newPermit, company_id: parseInt(newPermit.company_id) };
      if (renewFromPermitId) payload.copy_from_permit_id = renewFromPermitId;
      const res = await createPermit(payload);
      const newId: number = res.data.id;
      setStatus(renewFromPermitId ? "Permit renewed. Limits copied from previous permit — review and adjust as needed." : "Permit added.");
      setRenewFromPermitId(null);
      setNewPermit({ company_id:"", permit_number:"", effective_date:"", expiration_date:"" });
      const refreshed = await getPermits();
      setPermits(refreshed.data);
      handleSelectPermit(newId);
    } catch (err: any) {
      setStatus(`Error: ${err.response?.data?.error ?? "Failed to add permit"}`);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newUser,
        company_id: newUser.company_id ? parseInt(newUser.company_id) : null,
      };
      if (editingUserId) {
        await api.put(`/admin/users/${editingUserId}`, payload);
        setStatus(`User "${newUser.username}" updated.`);
        setEditingUserId(null);
        setShowUserForm(false);
      } else {
        await api.post("/admin/users", payload);
        setStatus(`User "${newUser.username}" created.`);
        setShowUserForm(false);
      }
      setNewUser({ username:"", email:"", password:"", role:"iu", company_id:"" });
      api.get("/admin/users").then(r => setUsers(r.data));
    } catch (err: any) {
      setStatus(`Error: ${err.response?.data?.error ?? "Failed to save user"}`);
    }
  };

  const handleSelectPermit = (id: number) => {
    setSelectedPermit(id);
    setPermitEditMode(false);
    api.get(`/permits/${id}`).then(r => {
      const p = r.data;
      setNewPermit({
        company_id:      String(p.company_id),
        permit_number:   p.permit_number,
        effective_date:  p.effective_date,
        expiration_date: p.expiration_date,
      });
      setIsViewingPermit(true);
      setSelectedPermitLimits([...(p.limits ?? [])].sort((a: any, b: any) => (a.parameter_name ?? "").localeCompare(b.parameter_name ?? "")));
    });
  };

  const handleAddLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPermit) return;

    // If the new-parameter card is open, save it first then continue
    let resolvedParameterId = newLimit.parameter_id;
    if (newParamForm.show) {
      if (!newParamForm.name || !newParamForm.abbreviation) {
        setLimitFormError("Enter a name and abbreviation for the new parameter before saving.");
        return;
      }
      try {
        const res = await createParameter({
          name: newParamForm.name,
          abbreviation: newParamForm.abbreviation,
          conversion_factor: parseFloat(newParamForm.conversion_factor) || 8.34,
        });
        const created: Parameter = res.data;
        getParameters().then(r => setParameters([...r.data].sort((a: any, b: any) => a.name.localeCompare(b.name))));
        resolvedParameterId = String(created.id);
        setNewLimit(prev => ({...prev, parameter_id: resolvedParameterId}));
        setParamSearch(`${created.name} (${created.abbreviation})`);
        setNewParamForm({show:false, name:"", abbreviation:"", conversion_factor:"8.34"});
      } catch (err: any) {
        setLimitFormError(err.response?.data?.error ?? "Failed to create parameter.");
        return;
      }
    }

    if (!resolvedParameterId) {
      setLimitFormError("Please select a parameter from the list before saving.");
      return;
    }
    setLimitFormError("");
    const buildPayload = (paramId: string) => ({
      parameter_id:               parseInt(paramId),
      daily_max_concentration:    newLimit.daily_max_concentration    ? parseFloat(newLimit.daily_max_concentration)    : null,
      daily_max_loading:          newLimit.daily_max_loading          ? parseFloat(newLimit.daily_max_loading)          : null,
      weekly_max_concentration:   newLimit.weekly_max_concentration   ? parseFloat(newLimit.weekly_max_concentration)   : null,
      weekly_max_loading:         newLimit.weekly_max_loading         ? parseFloat(newLimit.weekly_max_loading)         : null,
      monthly_avg_concentration:  newLimit.monthly_avg_concentration  ? parseFloat(newLimit.monthly_avg_concentration)  : null,
      monthly_avg_loading:        newLimit.monthly_avg_loading        ? parseFloat(newLimit.monthly_avg_loading)        : null,
      frequency_id:               newLimit.frequency_id               ? parseInt(newLimit.frequency_id)                 : null,
      sample_type:                newLimit.sample_type                || null,
      is_monitor_report:          newLimit.is_monitor_report,
      is_range_limit:             newLimit.is_range_limit,
      min_value:                  newLimit.min_value  ? parseFloat(newLimit.min_value)  : null,
      max_value:                  newLimit.max_value  ? parseFloat(newLimit.max_value)  : null,
      range_unit:                 (newLimit as any).range_unit || "s.u.",
      is_flow_limit:              newLimit.is_flow_limit,
      averaging_period:           newLimit.is_flow_limit ? newLimit.averaging_period : null,
    });
    const payload = buildPayload(resolvedParameterId);
    try {
      if (editingLimitId) {
        await api.put(`/permits/${selectedPermit}/limits/${editingLimitId}`, payload);
      } else {
        await addPermitLimit(selectedPermit as number, payload);
      }
      const refreshed = await api.get(`/permits/${selectedPermit}`);
      setSelectedPermitLimits([...(refreshed.data.limits ?? [])].sort((a: any, b: any) => (a.parameter_name ?? "").localeCompare(b.parameter_name ?? "")));
      resetLimitForm();
      setEditingLimitId(null);
      setStatus(editingLimitId ? "Permit limit updated." : "Permit limit added.");
    } catch (err: any) {
      setLimitFormError(err.response?.data?.error ?? "Failed to save limit.");
    }
  };

  const resetLimitForm = () => {
    setNewLimit({ parameter_id:"", daily_max_concentration:"", daily_max_loading:"",
                  weekly_max_concentration:"", weekly_max_loading:"",
                  monthly_avg_concentration:"", monthly_avg_loading:"",
                  frequency_id:"", sample_type:"", is_monitor_report: false,
                  is_range_limit: false, min_value:"", max_value:"", range_unit:"s.u.",
                  is_flow_limit: false, averaging_period:"daily_max" });
    setParamSearch("");
    setParamDropdownOpen(false);
    setLimitFormError("");
  };

  const handleAddToQueue = () => {
    if (!newLimit.parameter_id) {
      setLimitFormError("Select a parameter before adding to queue.");
      return;
    }
    const param = parameters.find(p => String(p.id) === newLimit.parameter_id);
    const payload = {
      parameter_id:               parseInt(newLimit.parameter_id),
      _param_name:                param ? `${param.name} (${param.abbreviation})` : `#${newLimit.parameter_id}`,
      daily_max_concentration:    newLimit.daily_max_concentration    ? parseFloat(newLimit.daily_max_concentration)    : null,
      daily_max_loading:          newLimit.daily_max_loading          ? parseFloat(newLimit.daily_max_loading)          : null,
      weekly_max_concentration:   newLimit.weekly_max_concentration   ? parseFloat(newLimit.weekly_max_concentration)   : null,
      weekly_max_loading:         newLimit.weekly_max_loading         ? parseFloat(newLimit.weekly_max_loading)         : null,
      monthly_avg_concentration:  newLimit.monthly_avg_concentration  ? parseFloat(newLimit.monthly_avg_concentration)  : null,
      monthly_avg_loading:        newLimit.monthly_avg_loading        ? parseFloat(newLimit.monthly_avg_loading)        : null,
      frequency_id:               newLimit.frequency_id               ? parseInt(newLimit.frequency_id)                 : null,
      sample_type:                newLimit.sample_type                || null,
      is_monitor_report:          newLimit.is_monitor_report,
      is_range_limit:             newLimit.is_range_limit,
      min_value:                  newLimit.min_value  ? parseFloat(newLimit.min_value)  : null,
      max_value:                  newLimit.max_value  ? parseFloat(newLimit.max_value)  : null,
      range_unit:                 (newLimit as any).range_unit || "s.u.",
      is_flow_limit:              newLimit.is_flow_limit,
      averaging_period:           newLimit.is_flow_limit ? newLimit.averaging_period : null,
    };
    setLimitQueue(q => [...q, payload]);
    setLimitFormError("");
    resetLimitForm();
    setTimeout(() => paramInputRef.current?.focus(), 0);
  };

  const handleSaveQueue = async () => {
    if (!selectedPermit || limitQueue.length === 0) return;
    setQueueSaving(true);
    try {
      const items = limitQueue.map(({ _param_name, ...rest }) => rest);
      await addPermitLimitsBatch(selectedPermit as number, items);
      const refreshed = await api.get(`/permits/${selectedPermit}`);
      setSelectedPermitLimits([...(refreshed.data.limits ?? [])].sort((a: any, b: any) => (a.parameter_name ?? "").localeCompare(b.parameter_name ?? "")));
      setLimitQueue([]);
      setStatus(`${items.length} limit${items.length !== 1 ? "s" : ""} added.`);
    } catch (err: any) {
      setLimitFormError(err.response?.data?.error ?? "Failed to save limits.");
    } finally {
      setQueueSaving(false);
    }
  };

  const handleDeleteLimit = async (limitId: number, paramName: string) => {
    if (!window.confirm(`Delete the "${paramName}" limit? Any sample results recorded against this limit will also be removed.`)) return;
    if (!selectedPermit) return;
    try {
      const res = await deletePermitLimit(selectedPermit as number, limitId);
      const removed = res.data.sample_results_removed;
      getPermit(selectedPermit as number).then((r: any) => setSelectedPermitLimits([...(r.data.limits ?? [])].sort((a: any, b: any) => (a.parameter_name ?? "").localeCompare(b.parameter_name ?? ""))));
      setStatus(removed > 0
        ? `Limit deleted — ${removed} sample result(s) also removed.`
        : "Limit deleted.");
    } catch (err: any) {
      setStatus(`Error: ${err.response?.data?.error ?? "Failed to delete limit."}`);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const cancelToCompanies = (resetFn: () => void) => {
    resetFn();
    setStatus("");
    setTab("companies");
    setTimeout(() => companiesListRef.current?.focus(), 0);
  };

  const loadReviewQueue = () => {
    api.get("/samples").then(r => setReviewSamples(r.data));
    getFlowReports().then(r => setFlowReports(r.data)).catch(() => {});
  };

  const handleSelectReviewSample = (sample: any) => {
    setReviewMsg(null);
    setEditingResultId(null);
    setCorrectionReason("");
    setEditingHeader(false);
    setSampleFlowReport(null);
    setShowAddParam(false);
    setCorrectionPanel(null);
    getSampleCorrections(sample.id).then(r => setCorrectionHistory(r.data));
    api.get(`/samples/${sample.id}`).then(r => {
      const s = r.data;
      const violations: any[] = s.violations ?? [];
      const autoComment = violations.length === 0
        ? "No permit excursions found."
        : "Permit excursions detected:\n" + violations.map((v: any) =>
            `• ${v.parameter_name}: ${v.violation_type.replace("_", " ")} — ${v.exceedance_percent?.toFixed(1)}% above limit (${v.violation_severity})`
          ).join("\n");
      setSelectedSample(s);
      setReviewComment(s.review_comment || autoComment);

      // Fetch the flow report for the same monitoring period (month/year)
      const sDate = new Date(s.sample_date + "T00:00:00");
      const sMonth = sDate.getMonth() + 1;
      const sYear  = sDate.getFullYear();
      getFlowReports(s.company_id).then(fr => {
        const match = (fr.data as any[]).find(
          (rep: any) => rep.report_month === sMonth && rep.report_year === sYear
        );
        setSampleFlowReport(match ?? { _missing: true, report_month: sMonth, report_year: sYear });
      }).catch(() => setSampleFlowReport({ _missing: true, report_month: sMonth, report_year: sYear }));
    });
  };

  const handleSubmitReview = async () => {
    if (!selectedSample) return;
    setReviewSubmitting(true);
    try {
      await api.post(`/samples/${selectedSample.id}/review`, { comment: reviewComment });
      setSelectedSample((prev: any) => ({ ...prev, review_status: "reviewed" }));
      loadReviewQueue();
      setStatus("Review submitted.");
    } catch {
      setStatus("Error: Failed to submit review.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleRecheckCompliance = async () => {
    if (!selectedSample) return;
    setReviewMsg(null);
    try {
      const res = await api.put(`/samples/${selectedSample.id}`, { results: [] });
      const violations = res.data.violations ?? [];
      setSelectedSample((prev: any) => ({ ...prev, violations }));
      handleSelectReviewSample(selectedSample);
      setReviewMsg({ type:"ok", text: violations.length === 0 ? "Re-checked — no violations." : `Re-checked — ${violations.length} violation(s) found.` });
    } catch {
      setReviewMsg({ type:"err", text:"Re-check failed." });
    }
  };

  const handleSaveResult = async (permitLimitId: number) => {
    const conc = parseFloat(editingResultValue);
    if (isNaN(conc)) return;
    try {
      await api.put(`/samples/${selectedSample.id}`, {
        results: [{ permit_limit_id: permitLimitId, concentration: conc }],
        correction_reason: correctionReason.trim() || undefined,
      });
      setEditingResultId(null);
      setCorrectionReason("");
      handleSelectReviewSample(selectedSample);
      setReviewMsg({ type:"ok", text:"Result corrected — compliance re-evaluated." });
    } catch {
      setReviewMsg({ type:"err", text:"Failed to save correction." });
    }
  };

  const handleCorrectResult = async () => {
    if (!selectedSample || !correctionPanel) return;
    if (!correctionNote.trim()) {
      setReviewMsg({ type:"err", text:"A correction reason is required for the audit trail." });
      return;
    }
    const conc = parseFloat(correctionNewValue);
    if (isNaN(conc)) {
      setReviewMsg({ type:"err", text:"Please enter a valid numeric value." });
      return;
    }
    setCorrectionSaving(true);
    setReviewMsg(null);
    try {
      await api.put(`/samples/${selectedSample.id}`, {
        results: [{ permit_limit_id: correctionPanel.permit_limit_id, concentration: conc }],
        correction_reason: correctionNote.trim(),
      });
      setCorrectionPanel(null);
      setCorrectionNewValue("");
      setCorrectionNote("");
      handleSelectReviewSample(selectedSample);
      setReviewMsg({ type:"ok", text:"Correction saved and compliance re-evaluated." });
    } catch (err: any) {
      const msg = err.response?.data?.error ?? "Failed to save correction.";
      setReviewMsg({ type:"err", text:`Error: ${msg}` });
    } finally {
      setCorrectionSaving(false);
    }
  };

  const handleSaveHeader = async () => {
    try {
      await api.put(`/samples/${selectedSample.id}`, {
        sample_date:  headerEdits.sample_date  || undefined,
        sampler_name: headerEdits.sampler_name || undefined,
        correction_reason: correctionReason.trim() || undefined,
      });
      setEditingHeader(false);
      setCorrectionReason("");
      handleSelectReviewSample(selectedSample);
      setReviewMsg({ type:"ok", text:"Sample header updated." });
    } catch {
      setReviewMsg({ type:"err", text:"Failed to update header." });
    }
  };

  const handleDeleteResult = async (resultId: number, permitLimitId: number) => {
    if (!window.confirm("Delete this parameter result? Compliance will be re-evaluated.")) return;
    setReviewMsg(null);
    try {
      await deleteSampleResult(selectedSample.id, resultId);
      handleSelectReviewSample(selectedSample);
      setReviewMsg({ type:"ok", text:"Result deleted." });
    } catch (err: any) {
      const msg = err.response?.data?.error ?? `HTTP ${err.response?.status ?? "network error"}`;
      console.error("Delete result failed:", err.response ?? err);
      setReviewMsg({ type:"err", text:`Delete failed: ${msg}` });
    }
  };

  const handleDeleteSample = async () => {
    const company = selectedSample.company_name ?? `Sample #${selectedSample.id}`;
    if (!window.confirm(`Delete all results for ${company} — ${selectedSample.sample_date}? This cannot be undone.`)) return;
    setReviewMsg(null);
    try {
      await deleteSample(selectedSample.id);
      setSelectedSample(null);
      setReviewMsg(null);
      loadReviewQueue();
      setStatus("Sample deleted.");
    } catch (err: any) {
      const msg = err.response?.data?.error ?? `HTTP ${err.response?.status ?? "network error"}`;
      console.error("Delete sample failed:", err.response ?? err);
      setReviewMsg({ type:"err", text:`Delete failed: ${msg}` });
    }
  };

  const handleOpenAddParam = () => {
    if (!selectedSample) return;
    // Collect permit limits that don't already have a result in this sample
    getPermit(selectedSample.permit_id).then((r: any) => {
      const existingIds = new Set(
        (selectedSample.results ?? []).map((res: any) => res.permit_limit_id)
      );
      const missing = (r.data.limits ?? []).filter(
        (l: any) => !existingIds.has(l.id) && !l.is_flow_limit
      ).sort((a: any, b: any) => (a.parameter_name ?? "").localeCompare(b.parameter_name ?? ""));
      setAddParamLimits(missing);
      setAddParamLimitId(missing.length > 0 ? String(missing[0].id) : "");
      setAddParamConc("");
      setShowAddParam(true);
    });
  };

  const handleSubmitAddParam = async () => {
    if (!selectedSample || !addParamLimitId) return;
    setAddParamSaving(true);
    setReviewMsg(null);
    try {
      await addSampleResult(selectedSample.id, {
        permit_limit_id: parseInt(addParamLimitId),
        concentration:   addParamConc !== "" ? parseFloat(addParamConc) : null,
      });
      setShowAddParam(false);
      setAddParamConc("");
      // Reload the sample detail so the new result and re-run compliance appears
      const fresh = await api.get(`/samples/${selectedSample.id}`);
      setSelectedSample(fresh.data);
      loadReviewQueue();
      setReviewMsg({ type:"ok", text:"Parameter added. Compliance re-evaluated." });
    } catch (err: any) {
      const msg = err.response?.data?.error ?? "Failed to add parameter.";
      setReviewMsg({ type:"err", text:`Error: ${msg}` });
    } finally {
      setAddParamSaving(false);
    }
  };

  const handleLogout = () => { logout().finally(() => onLogout()); };

  const loadAdminSnc = (year: number, half: number, companyId: number | "") => {
    setSncLoading(true);
    getSncReport({ year, half, ...(companyId ? { company_id: companyId as number } : {}) })
      .then(r => setSncResults(r.data))
      .catch(() => setSncResults([]))
      .finally(() => setSncLoading(false));
  };

  const loadMeters = (companyId?: string) => {
    const cid = companyId ? parseInt(companyId) : undefined;
    getMeters(cid).then(r => setMeters(r.data));
    getMeterReadings(cid).then(r => setAdminReadings(r.data));
  };

  const handleSaveMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      company_id:   parseInt(metersCompanyFilter),
      meter_id:     newMeter.meter_id,
      description:  newMeter.description || null,
      pulse_factor: parseFloat(newMeter.pulse_factor) || 1.0,
      is_active:    newMeter.is_active,
      meter_type:   newMeter.meter_type,
    };
    try {
      if (editingMeterId) {
        await updateMeter(editingMeterId, payload);
        setStatus(`Meter "${newMeter.meter_id}" updated.`);
      } else {
        await createMeter(payload);
        setStatus(`Meter "${newMeter.meter_id}" added.`);
      }
      setNewMeter({ meter_id:"", description:"", pulse_factor:"1", is_active: true, meter_type:"process" });
      setEditingMeterId(null);
      setShowMeterForm(false);
      loadMeters(metersCompanyFilter);
    } catch (err: any) {
      setStatus(`Error: ${err.response?.data?.error ?? "Failed to save meter"}`);
    }
  };

  // ── View-as mode: render target dashboard with a floating return pill ──────
  if (viewAs) {
    const exitViewAs = () => { setViewAs(null); setViewAsIUCompany(null); };

    // IU dashboard is company-scoped — show a picker before rendering
    if (viewAs === "iu" && viewAsIUCompany === null) {
      return (
        <div style={{ minHeight:"100vh", background:"#f0f4f8", display:"flex",
                      alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:12, padding:"36px 40px",
                        boxShadow:"0 4px 24px rgba(0,0,0,0.12)", minWidth:320, textAlign:"center" }}>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:8, color:"#1a365d" }}>
              View as Industrial User
            </div>
            <div style={{ color:"#64748b", fontSize:13, marginBottom:20 }}>
              Choose which company's dashboard to preview.
            </div>
            <select
              defaultValue=""
              onChange={e => e.target.value && setViewAsIUCompany(Number(e.target.value))}
              style={{ width:"100%", padding:"8px 12px", borderRadius:7, border:"1px solid #cbd5e0",
                       fontSize:14, marginBottom:20 }}>
              <option value="">Select a company…</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button onClick={exitViewAs}
              style={{ background:"none", border:"none", color:"#64748b",
                       cursor:"pointer", fontSize:13, textDecoration:"underline" }}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    const viewAsUser = viewAs === "iu"
      ? { ...user, role: "iu" as const, company_id: viewAsIUCompany }
      : { ...user, role: viewAs as "coordinator" | "finance" };

    const Target = viewAs === "coordinator" ? CoordinatorDashboard
                 : viewAs === "finance"     ? FinanceDashboard
                 : IUDashboard;
    return (
      <>
        <Target user={viewAsUser as typeof user} onLogout={onLogout}
          {...(viewAs === "iu" ? { initialTab: "home" } : {})} />
        <div style={s.viewAsPill}>
          <span style={{opacity:0.75, fontSize:11}}>Viewing as</span>
          <strong>{VIEW_AS_LABELS[viewAs]}</strong>
          {viewAs === "iu" && viewAsIUCompany !== null && (
            <span style={{opacity:0.7, fontSize:11}}>
              — {companies.find(c => c.id === viewAsIUCompany)?.name ?? ""}
            </span>
          )}
          <button style={s.viewAsBack} onClick={exitViewAs}>
            ← Back to Admin
          </button>
        </div>
      </>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.stickyTop}>
        <header style={s.header}>
          <span style={s.brand}>Regreports PIMS</span>
          <span style={s.role}>Administrator</span>
          <NotificationBell onGoToSchedule={() => {
            setTab("schedule");
            getSamplingSchedule().then(r => setScheduleRows(r.data));
          }} />
          <select
            value=""
            onChange={e => { if (e.target.value) setViewAs(e.target.value as ViewAs); }}
            style={s.viewAsSelect}>
            <option value="">View as…</option>
            <option value="coordinator">Coordinator</option>
            <option value="finance">Finance</option>
            <option value="iu">Industrial User</option>
          </select>
          <button style={s.logoutBtn} onClick={handleLogout}>Sign Out</button>
        </header>

        <div style={s.tabs}>
          {(["companies","permits","users","review","meters","reports","schedule","compliance","enforcement","auditlog"] as const).map(t => (
            <button key={t} style={{...s.tab, ...(tab===t ? s.activeTab : {})}}
              onClick={() => {
                setTab(t);
                if (t === "companies") {
                  getPermits().then(r => setPermits(r.data));
                  getCompanies().then(r => setCompanies(r.data));
                }
                if (t === "review") {
                  loadReviewQueue();
                  if (selectedSample) handleSelectReviewSample(selectedSample);
                }
                if (t === "meters") loadMeters(metersCompanyFilter || undefined);
                if (t === "schedule") getSamplingSchedule().then(r => setScheduleRows(r.data));
                if (t === "enforcement") {
                  setEnfLoading(true);
                  getPendingEnforcement().then(r => { setEnfActions(r.data); setEnfLoading(false); });
                  setErgLoading(true);
                  Promise.all([getERGMatrix(), getERGFineSchedule()]).then(([m, f]) => {
                    setErgMatrix(m.data); setErgSchedule(f.data); setErgLoading(false);
                  });
                }
                if (t === "auditlog") {
                  setAuditLoading(true);
                  getAuditLog(200).then(r => { setAuditLogs(r.data); setAuditLoading(false); });
                }
                if (t === "compliance") {
                  setComplianceLoading(true);
                  getComplianceSummary().then(r => { setComplianceSummary(r.data); setComplianceLoading(false); });
                  loadAdminSnc(sncYear, sncHalf, sncCompany);
                }
              }}>
              {t === "review" ? "Review" : t === "auditlog" ? "Audit Log" : t === "enforcement" ? "Enforcement" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {!permitAlertDismissed && expiringPermits.length > 0 && (
        <div style={s.permitAlertBar}>
          <div style={s.permitAlertInner}>
            <span style={s.permitAlertTitle}>Permit Expiration Alerts</span>
            <div style={s.permitAlertList}>
              {expiringPermits.map((p: any) => {
                const expired = p.days_remaining < 0;
                const critical = p.days_remaining <= 30;
                const chip: React.CSSProperties = {
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "4px 12px", borderRadius: 20, fontSize: 13,
                  background: expired || critical ? "#fff5f5" : "#fffbeb",
                  border: `1px solid ${expired || critical ? "#fc8181" : "#f6ad55"}`,
                  color: expired || critical ? "#c53030" : "#975a16",
                  whiteSpace: "nowrap",
                };
                const label = expired
                  ? `Expired ${Math.abs(p.days_remaining)}d ago`
                  : p.days_remaining === 0
                  ? "Expires today"
                  : `${p.days_remaining}d remaining`;
                return (
                  <span key={p.id} style={chip}>
                    <strong>{p.company_name}</strong>
                    <span style={{opacity:0.7}}>{p.permit_number}</span>
                    <span style={{fontWeight:600}}>{label}</span>
                  </span>
                );
              })}
            </div>
            <button style={s.permitAlertDismiss} onClick={() => setPermitAlertDismissed(true)}>✕</button>
          </div>
        </div>
      )}

      <div style={s.content}>
        {status && (
          <div style={{...s.statusMsg,
            background: status.startsWith("Error") ? "#fff5f5" : "#c6f6d5",
            color:      status.startsWith("Error") ? "#c53030" : "#276749"}}>
            {status}
          </div>
        )}

        {tab === "companies" && (
          <div style={s.twoCol}>
            <div ref={companiesListRef} tabIndex={-1} style={s.focusCol}>
              <h2 style={s.sectionTitle}>Industrial Users</h2>
              <div style={{border:"1px solid #e2e8f0", borderRadius:6, overflow:"hidden", marginBottom:12}}>
                {companies.length === 0
                  ? <p style={{padding:"12px 16px", color:"#718096", margin:0}}>No companies yet.</p>
                  : companies.map(c => {
                      const isSelected = String(c.id) === selectedCompanyId;
                      return (
                        <div key={c.id}
                          style={{
                            padding:"10px 16px", cursor:"pointer", userSelect:"none",
                            borderBottom:"1px solid #e2e8f0",
                            background: isSelected ? "#ebf8ff" : "white",
                            borderLeft: isSelected ? "3px solid #3182ce" : "3px solid transparent",
                          }}
                          onClick={() => { setSelectedCompanyId(String(c.id)); setShowAddCompany(false); setEditingCompany(false); setStatus(""); }}>
                          <strong style={{color: isSelected ? "#2b6cb0" : "#2d3748"}}>{c.name}</strong>
                          {(c as any).is_active === false && (
                            <span style={{marginLeft:8, fontSize:11, color:"#a0aec0", fontStyle:"italic"}}>inactive</span>
                          )}
                          {(c as any).contact_person && (
                            <span style={{display:"block", fontSize:12, color:"#718096", marginTop:2}}>{(c as any).contact_person}</span>
                          )}
                        </div>
                      );
                    })
                }
              </div>
              <button style={{...s.btn, width:"100%"}} type="button"
                onClick={() => { setShowAddCompany(true); setSelectedCompanyId(""); setStatus(""); }}>
                + Add New Company
              </button>
            </div>

            {showAddCompany ? (
              <form onSubmit={handleAddCompany} style={s.formCard}>
                <h3 style={s.formTitle}>Add Company</h3>
                {(["name","contact_person","phone","email"] as const).map(f => (
                  <div key={f}>
                    <label style={s.label}>{f.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</label>
                    <input style={s.input} value={newCompany[f]}
                      onChange={e => setNewCompany(p => ({...p, [f]: e.target.value}))}
                      required={f === "name"} />
                  </div>
                ))}
                <div style={s.btnRow}>
                  <button style={s.btn} type="submit">Add Company</button>
                  <button style={s.clearBtn} type="button"
                    onClick={() => {
                      setNewCompany({ name:"", contact_person:"", phone:"", email:"" });
                      setStatus("");
                      setShowAddCompany(false);
                    }}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : selectedCompanyId ? (() => {
              const cid = parseInt(selectedCompanyId);
              const company = companies.find((c: any) => c.id === cid) as any;
              if (!company) return null;
              const companyPermits = permits.filter(p => p.company_id === cid)
                .sort((a, b) => b.expiration_date.localeCompare(a.expiration_date));
              return (
                <div style={{...s.formCard, alignSelf:"stretch"}}>
                  {editingCompany ? (
                    <>
                      <h3 style={s.formTitle}>Edit Company</h3>
                      <label style={s.label}>Company Name</label>
                      <input style={{...s.input, marginBottom:8}} value={editCompanyForm.name}
                        onChange={e => setEditCompanyForm(f => ({...f, name: e.target.value}))} required />
                      <label style={s.label}>Contact Person</label>
                      <input style={{...s.input, marginBottom:8}} value={editCompanyForm.contact_person}
                        onChange={e => setEditCompanyForm(f => ({...f, contact_person: e.target.value}))} />
                      <label style={s.label}>Phone</label>
                      <input style={{...s.input, marginBottom:8}} value={editCompanyForm.phone}
                        onChange={e => setEditCompanyForm(f => ({...f, phone: e.target.value}))} />
                      <label style={s.label}>Email</label>
                      <input style={{...s.input, marginBottom:8}} value={editCompanyForm.email}
                        onChange={e => setEditCompanyForm(f => ({...f, email: e.target.value}))} />
                      <label style={s.label}>Address</label>
                      <input style={{...s.input, marginBottom:12}} value={editCompanyForm.address}
                        onChange={e => setEditCompanyForm(f => ({...f, address: e.target.value}))} />
                      <div style={s.btnStack}>
                        <button style={s.btn} type="button"
                          onClick={async () => {
                            await updateCompany(cid, editCompanyForm);
                            getCompanies().then(r => setCompanies(r.data));
                            setEditingCompany(false);
                            setStatus(`${editCompanyForm.name} updated.`);
                          }}>
                          Save Changes
                        </button>
                        <button style={s.outlineBtn} type="button"
                          onClick={() => setEditingCompany(false)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 style={s.formTitle}>{company.name}</h3>
                      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px", marginBottom:16}}>
                        {company.contact_person && <><span style={s.label}>Contact</span><span>{company.contact_person}</span></>}
                        {company.phone && <><span style={s.label}>Phone</span><span>{company.phone}</span></>}
                        {company.email && <><span style={s.label}>Email</span><span>{company.email}</span></>}
                        {company.address && <><span style={s.label}>Address</span><span>{company.address}</span></>}
                        <span style={s.label}>Status</span>
                        <span style={{color: company.is_active === false ? "#a0aec0" : "#276749"}}>
                          {company.is_active === false ? "Inactive" : "Active"}
                        </span>
                      </div>
                      <div style={{marginBottom:12}}>
                        <span style={s.label}>Permits ({companyPermits.length})</span>
                        {companyPermits.length === 0
                          ? <p style={{color:"#718096", fontSize:13, margin:"4px 0 0"}}>No permits on file.</p>
                          : companyPermits.map(p => (
                              <div key={p.id} style={{fontSize:13, padding:"4px 0", borderBottom:"1px solid #eee"}}>
                                <strong>{p.permit_number}</strong>
                                <span style={{color:"#718096", marginLeft:8}}>{p.effective_date} → {p.expiration_date}</span>
                              </div>
                            ))
                        }
                      </div>
                      <div style={s.btnStack}>
                        <button
                          style={s.btn}
                          type="button"
                          onClick={() => {
                            setStatus("");
                            setPermitsCompanyFilter(cid);
                            setIsViewingPermit(false);
                            setNewPermit(p => ({ ...p, company_id: String(cid) }));
                            if (companyPermits.length > 0) handleSelectPermit(companyPermits[0].id);
                            setTab("permits");
                          }}>
                          Open Permits
                        </button>
                        <button style={s.outlineBtn} type="button"
                          onClick={() => {
                            setEditCompanyForm({
                              name:           company.name           ?? "",
                              contact_person: company.contact_person ?? "",
                              phone:          company.phone          ?? "",
                              email:          company.email          ?? "",
                              address:        company.address        ?? "",
                            });
                            setEditingCompany(true);
                            setStatus("");
                          }}>
                          Edit
                        </button>
                        <button style={{...s.outlineBtn, color:"#718096", borderColor:"#718096"}} type="button"
                          onClick={async () => {
                            await updateCompany(cid, { is_active: !company.is_active });
                            getCompanies().then(r => setCompanies(r.data));
                            setStatus(`${company.name} marked ${company.is_active ? "inactive" : "active"}.`);
                          }}>
                          {company.is_active === false ? "Reactivate" : "Deactivate"}
                        </button>
                        <button style={{...s.outlineBtn, color:"#c05621", borderColor:"#c05621"}} type="button"
                          onClick={async () => {
                            const res = await getCompanyDependents(cid);
                            setDeleteModal({ company, dependents: res.data });
                            setDeleteConfirmName("");
                          }}>
                          Delete Company
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })() : (
              <div style={{...s.formCard, display:"flex", alignItems:"center", justifyContent:"center", color:"#a0aec0", fontSize:14}}>
                Select a company to view details
              </div>
            )}
          </div>
        )}

        {tab === "permits" && (
          <div>
            <div style={isViewingPermit ? s.threeCol : s.twoCol}>
              {/* â"€â"€ Left: permit list â"€â"€ */}
              <div>
                <div style={s.permitsHeader}>
                  <h2 style={{...s.sectionTitle, margin:0}}>Permits</h2>
                  {permitsCompanyFilter && (
                    <span style={s.filterBadge}>
                      {companies.find(c => c.id === permitsCompanyFilter)?.name ?? `Company #${permitsCompanyFilter}`}
                      <button style={s.badgeClear} onClick={() => setPermitsCompanyFilter(null)}>Ã—</button>
                    </span>
                  )}
                </div>
                {permits
                  .filter(p => !permitsCompanyFilter || p.company_id === permitsCompanyFilter)
                  .map(p => (
                    <div key={p.id}
                      style={{...s.listItem, ...(selectedPermit===p.id ? s.selectedItem : {}), cursor:"pointer"}}
                      onClick={() => handleSelectPermit(p.id)}>
                      <strong>{p.permit_number}</strong>
                      <span style={s.meta}>
                        {companies.find(c => c.id === p.company_id)?.name ?? `Company #${p.company_id}`}
                        {" · "}{p.effective_date} â†’ {p.expiration_date}
                      </span>
                    </div>
                  ))
                }
              </div>

              {/* â"€â"€ Middle: permit form â"€â"€ */}
              <form onSubmit={async e => {
                e.preventDefault();
                if (isViewingPermit && permitEditMode && selectedPermit) {
                  try {
                    await updatePermit(selectedPermit as number, {
                      permit_number:   newPermit.permit_number,
                      effective_date:  newPermit.effective_date,
                      expiration_date: newPermit.expiration_date,
                    });
                    setPermitEditMode(false);
                    getPermits().then(r => setPermits(r.data));
                    setStatus("Permit updated.");
                  } catch (err: any) {
                    setStatus(`Error: ${err.response?.data?.error ?? "Failed to update permit"}`);
                  }
                } else {
                  handleAddPermit(e);
                }
              }} style={s.formCard}>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
                  <h3 style={{...s.formTitle, marginBottom:0}}>
                    {isViewingPermit ? (permitEditMode ? "Edit Permit" : "Permit Details") : renewFromPermitId ? "Renew Permit" : "Add Permit"}
                  </h3>
                  {isViewingPermit && newPermit.expiration_date && (() => {
                    const days = Math.ceil((new Date(newPermit.expiration_date).getTime() - Date.now()) / 86400000);
                    const bg    = days < 0 ? "#fed7d7" : days <= 30 ? "#feebc8" : days <= 90 ? "#fefcbf" : "#c6f6d5";
                    const color = days < 0 ? "#c53030" : days <= 30 ? "#c05621" : days <= 90 ? "#b7791f" : "#276749";
                    const label = days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `${days}d until expiry`;
                    return (
                      <span style={{background:bg, color, borderRadius:12, padding:"3px 10px",
                                    fontSize:12, fontWeight:700, whiteSpace:"nowrap" as const}}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
                {!isViewingPermit && renewFromPermitId && (
                  <div style={{background:"#e9d8fd", color:"#553c9a", borderRadius:5, padding:"8px 12px",
                               fontSize:12, marginBottom:12, border:"1px solid #b794f4"}}>
                    Renewing existing permit — limits will be copied as a starting point.
                    Enter new effective and expiration dates below.
                  </div>
                )}
                {isViewingPermit && !permitEditMode && (
                  <div style={s.viewingBadgeRow}>
                    <button style={s.paramBtn} type="button"
                      onClick={() => setPermitEditMode(true)}>
                      Edit Permit
                    </button>
                    <button style={s.paramBtn} type="button"
                      onClick={() => setTimeout(() => limitsRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }), 0)}>
                      Add / Edit Parameters
                    </button>
                    <button style={{...s.paramBtn, background:"#e9d8fd", color:"#553c9a", borderColor:"#b794f4"}} type="button"
                      onClick={() => {
                        setRenewFromPermitId(selectedPermit as number);
                        setIsViewingPermit(false);
                        setPermitEditMode(false);
                        setNewPermit(p => ({ ...p, effective_date:"", expiration_date:"" }));
                        setStatus("");
                      }}>
                      Add New Permit
                    </button>
                  </div>
                )}
                <label style={s.label}>Company</label>
                <select style={{...s.input, ...s.readOnly}}
                  value={newPermit.company_id}
                  disabled={true}>
                  <option value="">Select…</option>
                  {(isViewingPermit || permitsCompanyFilter
                    ? companies.filter(c => isViewingPermit
                        ? c.id === parseInt(newPermit.company_id)
                        : c.id === permitsCompanyFilter)
                    : companies
                  ).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <label style={s.label}>Permit Number</label>
                <input style={{...s.input, ...(!isViewingPermit || permitEditMode ? {} : s.readOnly)}}
                  value={newPermit.permit_number}
                  readOnly={isViewingPermit && !permitEditMode}
                  onChange={e => setNewPermit(p => ({...p, permit_number: e.target.value}))} required />
                <label style={s.label}>Effective Date</label>
                <input style={{...s.input, ...(!isViewingPermit || permitEditMode ? {} : s.readOnly)}}
                  type="date" value={newPermit.effective_date}
                  readOnly={isViewingPermit && !permitEditMode}
                  onChange={e => setNewPermit(p => ({...p, effective_date: e.target.value}))} required />
                <label style={s.label}>Expiration Date</label>
                <input style={{...s.input, ...(!isViewingPermit || permitEditMode ? {} : s.readOnly)}}
                  type="date" value={newPermit.expiration_date}
                  readOnly={isViewingPermit && !permitEditMode}
                  onChange={e => setNewPermit(p => ({...p, expiration_date: e.target.value}))} required />
                <div style={s.btnRow}>
                  {(!isViewingPermit || permitEditMode) &&
                    <button style={s.btn} type="submit">
                      {permitEditMode ? "Save Changes" : "Add Permit"}
                    </button>
                  }
                  <button style={s.clearBtn} type="button"
                    onClick={() => {
                      if (permitEditMode) {
                        setPermitEditMode(false);
                        handleSelectPermit(selectedPermit as number);
                      } else {
                        setIsViewingPermit(false);
                        setPermitEditMode(false);
                        setRenewFromPermitId(null);
                        cancelToCompanies(() => setNewPermit({ company_id: permitsCompanyFilter ? String(permitsCompanyFilter) : "", permit_number:"", effective_date:"", expiration_date:"" }));
                      }
                    }}>
                    {permitEditMode ? "Cancel" : isViewingPermit ? "Close" : "Cancel"}
                  </button>
                </div>
              </form>

              {/* â"€â"€ Right: inline limits table (only when viewing) â"€â"€ */}
              {isViewingPermit && (
                <div style={s.inlineLimits}>
                  <h3 style={s.formTitle}>Parameters &amp; Limits</h3>
                  {selectedPermitLimits.length === 0 ? (
                    <p style={s.meta}>No limits set yet.</p>
                  ) : (
                    <div style={s.inlineLimitsScroll}>
                      <table style={s.limitsInlineTable}>
                        <thead>
                          <tr>
                            <th style={s.th}>Parameter</th>
                            <th style={{...s.th, textAlign:"center"}}>Daily Max<br/>(mg/L)</th>
                            <th style={{...s.th, textAlign:"center"}}>Daily Max<br/>(lbs/d)</th>
                            <th style={{...s.th, textAlign:"center"}}>Wkly Max<br/>(mg/L)</th>
                            <th style={{...s.th, textAlign:"center"}}>Wkly Max<br/>(lbs/d)</th>
                            <th style={{...s.th, textAlign:"center"}}>Mo. Avg<br/>(mg/L)</th>
                            <th style={{...s.th, textAlign:"center"}}>Mo. Avg<br/>(lbs/d)</th>
                            <th style={{...s.th, textAlign:"center"}}>Frequency</th>
                            <th style={{...s.th, textAlign:"center"}}>Sample</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPermitLimits.map((l: any) => {
                            const periodLabel: Record<string,string> = {
                              daily_max:"Daily Max", weekly_max:"Weekly Max", monthly_avg:"Monthly Avg"
                            };
                            return (
                            <tr key={l.id}>
                              <td style={s.td}>
                                <strong>{l.parameter_name}</strong>
                                {l.is_flow_limit && <span style={{...s.mrBadge, background:"#ebf8ff", color:"#2b6cb0", border:"1px solid #bee3f8", marginLeft:6}}>
                                  Flow · {periodLabel[l.averaging_period] ?? l.averaging_period}
                                </span>}
                              </td>
                              <td style={{...s.td, textAlign:"center"}}>
                                {l.is_monitor_report ? <span style={s.mrBadge}>MR</span>
                                  : l.is_range_limit ? <span style={s.rangeBadge}>{l.min_value ?? "—"} — {l.max_value ?? "—"} {l.range_unit}</span>
                                  : l.is_flow_limit && l.averaging_period === "daily_max"
                                    ? <strong>{l.daily_max_concentration ?? "—"} MGD</strong>
                                  : l.is_flow_limit ? "—"
                                  : <strong>{l.daily_max_concentration ?? "—"}</strong>}
                              </td>
                              <td style={{...s.td, textAlign:"center"}}>
                                {l.is_monitor_report || l.is_flow_limit || l.is_range_limit ? "—"
                                  : <strong>{l.daily_max_loading ?? "—"}</strong>}
                              </td>
                              <td style={{...s.td, textAlign:"center"}}>
                                {l.is_monitor_report || l.is_range_limit ? "—"
                                  : l.is_flow_limit && l.averaging_period === "weekly_max"
                                    ? <strong>{l.weekly_max_concentration ?? "—"} MGD</strong>
                                  : l.is_flow_limit ? "—"
                                  : <strong>{l.weekly_max_concentration ?? "—"}</strong>}
                              </td>
                              <td style={{...s.td, textAlign:"center"}}>
                                {l.is_monitor_report || l.is_range_limit || l.is_flow_limit ? "—"
                                  : <strong>{l.weekly_max_loading ?? "—"}</strong>}
                              </td>
                              <td style={{...s.td, textAlign:"center"}}>
                                {l.is_monitor_report ? <span style={s.mrBadge}>MR</span>
                                  : l.is_range_limit ? "—"
                                  : l.is_flow_limit && l.averaging_period === "monthly_avg"
                                    ? <strong>{l.monthly_avg_concentration ?? "—"} MGD</strong>
                                  : l.is_flow_limit ? "—"
                                  : <strong>{l.monthly_avg_concentration ?? "—"}</strong>}
                              </td>
                              <td style={{...s.td, textAlign:"center"}}>
                                {l.is_monitor_report || l.is_range_limit || l.is_flow_limit ? "—"
                                  : <strong>{l.monthly_avg_loading ?? "—"}</strong>}
                              </td>
                              <td style={{...s.td, textAlign:"center"}}>{l.frequency_description ?? "—"}</td>
                              <td style={{...s.td, textAlign:"center", textTransform:"capitalize"}}>{l.sample_type ?? "—"}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedPermit && (() => {
              const permit  = permits.find(p => p.id === selectedPermit);
              const company = companies.find(c => c.id === permit?.company_id);
              return (
                <div ref={limitsRef} style={s.limitsSection}>
                  {/* â"€â"€ Section header â"€â"€ */}
                  <div style={s.limitsSectionHeader}>
                    <h2 style={{...s.sectionTitle, margin:0}}>Permit Limits</h2>
                    <span style={s.limitsPermitBadge}>
                      {company?.name ?? "—"} &nbsp;·&nbsp; {permit?.permit_number ?? "—"}
                    </span>
                  </div>

                  <div style={s.twoCol}>
                    {/* â"€â"€ Left: Add Parameter Limit form â"€â"€ */}
                    <form ref={limitFormRef} onSubmit={handleAddLimit} style={s.formCard} noValidate>
                      <h3 style={s.formTitle}>
                        {editingLimitId ? "Edit Parameter Limit" : "Add Parameter Limit"}
                      </h3>
                      <label style={s.label}>Parameter</label>
                      {(() => {
                        const usedIds = new Set(
                          selectedPermitLimits
                            .filter((l: any) => l.id !== editingLimitId)
                            .map((l: any) => l.parameter_id)
                        );
                        const search = paramSearch.toLowerCase();
                        const filtered = parameters.filter(p =>
                          !usedIds.has(p.id) && (
                            p.abbreviation.toLowerCase().includes(search) ||
                            p.name.toLowerCase().includes(search)
                          )
                        );
                        const selectedParam = parameters.find(p => String(p.id) === newLimit.parameter_id);
                        const showCreate = paramSearch.trim().length > 0 &&
                          !parameters.some(p =>
                            p.abbreviation.toLowerCase().includes(search) ||
                            p.name.toLowerCase().includes(search)
                          );
                        return (
                          <div ref={paramComboRef}>
                            <div style={s.comboWrap}>
                              <input
                                ref={paramInputRef}
                                style={s.input}
                                value={paramSearch}
                                placeholder={selectedParam ? `${selectedParam.name} (${selectedParam.abbreviation})` : "Type to search or create…"}
                                onFocus={() => { setParamDropdownOpen(true); setNewParamForm(prev => ({...prev, show:false})); }}
                                onChange={e => {
                                  setParamSearch(e.target.value);
                                  setNewLimit(prev => ({...prev, parameter_id: ""}));
                                  setParamDropdownOpen(true);
                                  setNewParamForm(prev => ({...prev, show:false}));
                                }}
                              />
                              {paramDropdownOpen && (
                                <div style={s.comboList}>
                                  {filtered.map(param => (
                                    <div key={param.id} style={s.comboOption}
                                      onMouseEnter={e => (e.currentTarget.style.background="#f3e8ff")}
                                      onMouseLeave={e => (e.currentTarget.style.background="")}
                                      onMouseDown={() => {
                                        setNewLimit(prev => ({...prev, parameter_id: String(param.id)}));
                                        setParamSearch(`${param.name} (${param.abbreviation})`);
                                        setParamDropdownOpen(false);
                                        setNewParamForm(prev => ({...prev, show:false}));
                                      }}>
                                      {param.name} <span style={s.comboAbbr}>({param.abbreviation})</span>
                                    </div>
                                  ))}
                                  {filtered.length === 0 && !showCreate && (
                                    <div style={s.comboNone}>No matching parameters</div>
                                  )}
                                  {showCreate && (
                                    <div style={s.comboCreate}
                                      onMouseDown={() => {
                                        setParamDropdownOpen(false);
                                        setNewParamForm({ show:true, name:paramSearch.trim(), abbreviation:"", conversion_factor:"8.34" });
                                      }}>
                                      + Create &ldquo;{paramSearch.trim()}&rdquo; as new parameter
                                    </div>
                                  )}
                                </div>
                              )}
                              <input type="hidden" value={newLimit.parameter_id} />
                            </div>

                            {newParamForm.show && (
                              <div style={s.newParamCard}>
                                <div style={s.newParamTitle}>New Parameter</div>
                                <label style={s.label}>Name</label>
                                <input style={s.input} value={newParamForm.name}
                                  onChange={e => setNewParamForm(prev => ({...prev, name: e.target.value}))} />
                                <label style={s.label}>Abbreviation</label>
                                <input style={s.input} value={newParamForm.abbreviation}
                                  placeholder="e.g. BOD, TSS, NH3"
                                  onChange={e => setNewParamForm(prev => ({...prev, abbreviation: e.target.value}))} />
                                <label style={s.label}>Conversion Factor (lbs/day calc)</label>
                                <input style={s.input} type="number" step="any"
                                  value={newParamForm.conversion_factor}
                                  onChange={e => setNewParamForm(prev => ({...prev, conversion_factor: e.target.value}))} />
                                <p style={{...s.meta, marginTop:-8, marginBottom:10}}>
                                  Use 8.34 for most parameters. Use 1.0 for dimensionless (e.g. pH).
                                </p>
                                <div style={s.btnRow}>
                                  <button style={s.btn} type="button" disabled={newParamSaving}
                                    onClick={async () => {
                                      if (!newParamForm.name || !newParamForm.abbreviation) return;
                                      setNewParamSaving(true);
                                      try {
                                        const res = await createParameter({
                                          name: newParamForm.name,
                                          abbreviation: newParamForm.abbreviation,
                                          conversion_factor: parseFloat(newParamForm.conversion_factor) || 8.34,
                                        });
                                        const created: Parameter = res.data;
                                        getParameters().then(r => setParameters([...r.data].sort((a: any, b: any) => a.name.localeCompare(b.name))));
                                        setNewLimit(prev => ({...prev, parameter_id: String(created.id)}));
                                        setParamSearch(`${created.name} (${created.abbreviation})`);
                                        setNewParamForm({show:false, name:"", abbreviation:"", conversion_factor:"8.34"});
                                      } catch (err: any) {
                                        setLimitFormError(err.response?.data?.error ?? "Failed to create parameter.");
                                        setNewParamForm(p => ({...p, show:false}));
                                      } finally {
                                        setNewParamSaving(false);
                                      }
                                    }}>
                                    {newParamSaving ? "Saving…" : "Save Parameter"}
                                  </button>
                                  <button style={s.clearBtn} type="button"
                                    onClick={() => setNewParamForm({show:false, name:"", abbreviation:"", conversion_factor:"8.34"})}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <label style={s.mrCheckRow}>
                        <input type="checkbox" checked={newLimit.is_monitor_report}
                          onChange={e => setNewLimit(p => ({
                            ...p,
                            is_monitor_report: e.target.checked,
                            ...(e.target.checked ? {
                              daily_max_concentration:"", daily_max_loading:"",
                              weekly_max_concentration:"", weekly_max_loading:"",
                              monthly_avg_concentration:"", monthly_avg_loading:"",
                              is_range_limit: false, min_value:"", max_value:""
                            } : {})
                          }))} />
                        <span>Monitor &amp; Report only (MR) — no numeric limit</span>
                      </label>
                      <label style={s.mrCheckRow}>
                        <input type="checkbox" checked={newLimit.is_range_limit}
                          disabled={newLimit.is_monitor_report || newLimit.is_flow_limit}
                          onChange={e => setNewLimit(p => ({
                            ...p,
                            is_range_limit: e.target.checked,
                            ...(e.target.checked ? {
                              daily_max_concentration:"", daily_max_loading:"",
                              monthly_avg_concentration:"", monthly_avg_loading:"",
                              is_flow_limit: false,
                            } : { min_value:"", max_value:"" })
                          }))} />
                        <span style={(newLimit.is_monitor_report || newLimit.is_flow_limit) ? {color:"#a0aec0"} : {}}>
                          Range limit (min / max) — e.g. pH, temperature
                        </span>
                      </label>
                      <label style={s.mrCheckRow}>
                        <input type="checkbox" checked={newLimit.is_flow_limit}
                          disabled={newLimit.is_monitor_report || newLimit.is_range_limit}
                          onChange={e => setNewLimit(p => ({
                            ...p,
                            is_flow_limit: e.target.checked,
                            ...(e.target.checked ? {
                              daily_max_loading:"", weekly_max_loading:"",
                              monthly_avg_loading:"", is_range_limit: false,
                              min_value:"", max_value:"",
                            } : {})
                          }))} />
                        <span style={(newLimit.is_monitor_report || newLimit.is_range_limit) ? {color:"#a0aec0"} : {}}>
                          Flow limit — IU enters measured flow (MGD) at submittal
                        </span>
                      </label>
                      {newLimit.is_flow_limit && !newLimit.is_monitor_report && (
                        <div style={{marginBottom:8}}>
                          <label style={s.label}>Averaging Period</label>
                          <select style={s.input} value={newLimit.averaging_period}
                            onChange={e => setNewLimit(p => ({...p, averaging_period: e.target.value,
                              daily_max_concentration:"", weekly_max_concentration:"", monthly_avg_concentration:""}))}>
                            <option value="daily_max">Daily Maximum</option>
                            <option value="weekly_max">Weekly Maximum</option>
                            <option value="monthly_avg">Monthly Average Maximum</option>
                          </select>
                        </div>
                      )}
                      {newLimit.is_range_limit && !newLimit.is_monitor_report && (
                        <>
                          <div style={s.rangeRow}>
                            <div style={{flex:1}}>
                              <label style={s.label}>Min Value</label>
                              <input style={s.input} type="number" step="any" value={newLimit.min_value}
                                onChange={e => setNewLimit(p => ({...p, min_value: e.target.value}))} />
                            </div>
                            <div style={{flex:1}}>
                              <label style={s.label}>Max Value</label>
                              <input style={s.input} type="number" step="any" value={newLimit.max_value}
                                onChange={e => setNewLimit(p => ({...p, max_value: e.target.value}))} />
                            </div>
                          </div>
                          <div style={{marginBottom:8}}>
                            <label style={s.label}>Unit</label>
                            <select style={s.input} value={(newLimit as any).range_unit ?? "s.u."}
                              onChange={e => setNewLimit(p => ({...p, range_unit: e.target.value}))}>
                              <option value="s.u.">s.u. (standard units)</option>
                              <option value="mg/L">mg/L</option>
                              <option value="°C">°C</option>
                              <option value="°F">°F</option>
                              <option value="NTU">NTU</option>
                            </select>
                          </div>
                        </>
                      )}
                      {newLimit.is_flow_limit && !newLimit.is_monitor_report ? (<>
                        {/* Flow limit — single value field, label driven by averaging_period */}
                        {newLimit.averaging_period === "daily_max" && (<>
                          <label style={s.label}>Daily Max Flow Limit (MGD)</label>
                          <input style={s.input} type="number" step="any"
                            value={newLimit.daily_max_concentration}
                            onChange={e => setNewLimit(p => ({...p, daily_max_concentration: e.target.value}))} />
                        </>)}
                        {newLimit.averaging_period === "weekly_max" && (<>
                          <label style={s.label}>Weekly Max Flow Limit (MGD)</label>
                          <input style={s.input} type="number" step="any"
                            value={newLimit.weekly_max_concentration}
                            onChange={e => setNewLimit(p => ({...p, weekly_max_concentration: e.target.value}))} />
                        </>)}
                        {newLimit.averaging_period === "monthly_avg" && (<>
                          <label style={s.label}>Monthly Avg Flow Limit (MGD)</label>
                          <input style={s.input} type="number" step="any"
                            value={newLimit.monthly_avg_concentration}
                            onChange={e => setNewLimit(p => ({...p, monthly_avg_concentration: e.target.value}))} />
                        </>)}
                      </>) : (<>
                        {/* Standard concentration / loading fields */}
                        <label style={{...s.label, ...(newLimit.is_monitor_report || newLimit.is_range_limit ? s.disabledLabel : {})}}>
                          Daily Max Concentration (mg/L)
                        </label>
                        <input style={{...s.input, ...(newLimit.is_monitor_report ? s.readOnly : {})}}
                          type="number" step="any" value={newLimit.daily_max_concentration}
                          disabled={newLimit.is_monitor_report || newLimit.is_range_limit}
                          onChange={e => setNewLimit(p => ({...p, daily_max_concentration: e.target.value}))} />
                        <label style={{...s.label, ...(newLimit.is_monitor_report ? s.disabledLabel : {})}}>
                          Daily Max Loading (lbs/day){newLimit.is_range_limit && <span style={{fontSize:11,color:"#718096",marginLeft:6}}>(optional)</span>}
                        </label>
                        <input style={{...s.input, ...(newLimit.is_monitor_report ? s.readOnly : {})}}
                          type="number" step="any" value={newLimit.daily_max_loading}
                          disabled={newLimit.is_monitor_report}
                          onChange={e => setNewLimit(p => ({...p, daily_max_loading: e.target.value}))} />
                        <label style={{...s.label, ...(newLimit.is_monitor_report || newLimit.is_range_limit ? s.disabledLabel : {})}}>
                          Weekly Max Concentration (mg/L) <span style={{fontSize:11,color:"#718096"}}>(7-day avg)</span>
                        </label>
                        <input style={{...s.input, ...(newLimit.is_monitor_report ? s.readOnly : {})}}
                          type="number" step="any" value={newLimit.weekly_max_concentration}
                          disabled={newLimit.is_monitor_report || newLimit.is_range_limit}
                          onChange={e => setNewLimit(p => ({...p, weekly_max_concentration: e.target.value}))} />
                        <label style={{...s.label, ...(newLimit.is_monitor_report || newLimit.is_range_limit ? s.disabledLabel : {})}}>
                          Weekly Max Loading (lbs/day)
                        </label>
                        <input style={{...s.input, ...(newLimit.is_monitor_report ? s.readOnly : {})}}
                          type="number" step="any" value={newLimit.weekly_max_loading}
                          disabled={newLimit.is_monitor_report || newLimit.is_range_limit}
                          onChange={e => setNewLimit(p => ({...p, weekly_max_loading: e.target.value}))} />
                        <label style={{...s.label, ...(newLimit.is_monitor_report || newLimit.is_range_limit ? s.disabledLabel : {})}}>
                          Monthly Avg Concentration (mg/L)
                        </label>
                        <input style={{...s.input, ...(newLimit.is_monitor_report ? s.readOnly : {})}}
                          type="number" step="any" value={newLimit.monthly_avg_concentration}
                          disabled={newLimit.is_monitor_report || newLimit.is_range_limit}
                          onChange={e => setNewLimit(p => ({...p, monthly_avg_concentration: e.target.value}))} />
                        <label style={{...s.label, ...(newLimit.is_monitor_report || newLimit.is_range_limit ? s.disabledLabel : {})}}>
                          Monthly Avg Loading (lbs/day)
                        </label>
                        <input style={{...s.input, ...(newLimit.is_monitor_report ? s.readOnly : {})}}
                          type="number" step="any" value={newLimit.monthly_avg_loading}
                          disabled={newLimit.is_monitor_report || newLimit.is_range_limit}
                          onChange={e => setNewLimit(p => ({...p, monthly_avg_loading: e.target.value}))} />
                      </>)}
                      <label style={s.label}>Monitoring Frequency</label>
                      <select style={s.input} value={newLimit.frequency_id}
                        onChange={e => setNewLimit(p => ({...p, frequency_id: e.target.value}))}>
                        <option value="">Select…</option>
                        {frequencies.map(f => (
                          <option key={f.id} value={f.id}>{f.description} ({f.frequency_code})</option>
                        ))}
                      </select>
                      <label style={s.label}>Sample Type</label>
                      <select style={s.input} value={newLimit.sample_type}
                        onChange={e => setNewLimit(p => ({...p, sample_type: e.target.value}))}>
                        <option value="">Select…</option>
                        <option value="grab">Grab</option>
                        <option value="composite">Composite</option>
                        <option value="continuous">Continuous</option>
                      </select>
                      {limitFormError && (
                        <div style={s.limitFormError}>{limitFormError}</div>
                      )}
                      <div style={s.btnRow}>
                        <button style={s.btn} type="submit">
                          {editingLimitId ? "Update Limit" : "Add Limit"}
                        </button>
                        {!editingLimitId && (
                          <button style={s.exportBtn} type="button" onClick={handleAddToQueue}>
                            + Queue
                          </button>
                        )}
                        <button style={s.clearBtn} type="button"
                          onClick={() => {
                            resetLimitForm();
                            setEditingLimitId(null);
                            setStatus("");
                            setTimeout(() => paramInputRef.current?.focus(), 0);
                          }}>
                          Cancel
                        </button>
                      </div>
                    </form>

                    {/* ── Batch queue panel ── */}
                    {limitQueue.length > 0 && (
                      <div style={s.queuePanel}>
                        <div style={s.queueHeader}>
                          <span style={{fontWeight:700, color:"#1a365d", fontSize:13}}>
                            Queued ({limitQueue.length}) — ready to save
                          </span>
                          <div style={{display:"flex", gap:8}}>
                            <button style={s.btn} disabled={queueSaving} onClick={handleSaveQueue}>
                              {queueSaving ? "Saving…" : `Save All (${limitQueue.length})`}
                            </button>
                            <button style={s.clearBtn} onClick={() => setLimitQueue([])}>
                              Clear Queue
                            </button>
                          </div>
                        </div>
                        {limitQueue.map((item, i) => {
                          const freq = frequencies.find(f => f.id === item.frequency_id);
                          const summary = item.is_monitor_report ? "MR"
                            : item.is_range_limit ? `${item.min_value ?? "—"}–${item.max_value ?? "—"} ${item.range_unit}`
                            : item.is_flow_limit  ? `Flow · ${item.averaging_period ?? ""}`
                            : [item.daily_max_concentration != null ? `${item.daily_max_concentration} mg/L daily` : null,
                               item.monthly_avg_concentration != null ? `${item.monthly_avg_concentration} mg/L avg` : null]
                               .filter(Boolean).join(", ") || "No limits set";
                          return (
                            <div key={i} style={s.queueItem}>
                              <div style={{flex:1}}>
                                <span style={{fontWeight:600, fontSize:13}}>{item._param_name}</span>
                                <span style={{fontSize:12, color:"#718096", marginLeft:8}}>{summary}</span>
                                {freq && <span style={{fontSize:11, color:"#553c9a", marginLeft:8}}>{freq.frequency_code}</span>}
                              </div>
                              <button style={s.badgeClear} type="button"
                                onClick={() => setLimitQueue(q => q.filter((_, j) => j !== i))}>
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}


                    {/* â"€â"€ Right: existing limits table â"€â"€ */}
                    <div style={{flex:"1 1 0", minWidth:0}}>
                      {selectedPermitLimits.length === 0
                        ? <p style={s.meta}>No limits set yet — add one on the left.</p>
                        : <div style={{overflowX:"auto"}}>
                            <table style={s.table}>
                              <thead><tr>
                                <th style={s.th}>Parameter</th>
                                <th style={{...s.th, textAlign:"center"}}>Daily Max (mg/L)</th>
                                <th style={{...s.th, textAlign:"center"}}>Daily Max (lbs/day)</th>
                                <th style={{...s.th, textAlign:"center"}}>Weekly Max (mg/L)</th>
                                <th style={{...s.th, textAlign:"center"}}>Weekly Max (lbs/day)</th>
                                <th style={{...s.th, textAlign:"center"}}>Monthly Avg (mg/L)</th>
                                <th style={{...s.th, textAlign:"center"}}>Monthly Avg (lbs/day)</th>
                                <th style={{...s.th, textAlign:"center"}}>Frequency</th>
                                <th style={{...s.th, textAlign:"center"}}>Sample Type</th>
                                <th style={s.th}></th>
                              </tr></thead>
                              <tbody>{selectedPermitLimits.map((l: any) => (
                                <tr key={l.id}
                                  style={{
                                    cursor:"pointer",
                                    background: editingLimitId === l.id ? "#f3e8ff" : undefined,
                                    outline: editingLimitId === l.id ? "2px solid #553c9a" : undefined,
                                  }}
                                  title="Double-click to edit"
                                  onDoubleClick={() => {
                                    const param = parameters.find(p => p.id === l.parameter_id);
                                    setEditingLimitId(l.id);
                                    setNewLimit({
                                      parameter_id:             String(l.parameter_id),
                                      daily_max_concentration:  l.daily_max_concentration  != null ? String(l.daily_max_concentration)  : "",
                                      daily_max_loading:        l.daily_max_loading        != null ? String(l.daily_max_loading)        : "",
                                      weekly_max_concentration: l.weekly_max_concentration != null ? String(l.weekly_max_concentration) : "",
                                      weekly_max_loading:       l.weekly_max_loading       != null ? String(l.weekly_max_loading)       : "",
                                      monthly_avg_concentration:l.monthly_avg_concentration!= null ? String(l.monthly_avg_concentration): "",
                                      monthly_avg_loading:      l.monthly_avg_loading      != null ? String(l.monthly_avg_loading)      : "",
                                      frequency_id:             l.frequency_id             != null ? String(l.frequency_id)             : "",
                                      sample_type:              l.sample_type              ?? "",
                                      is_monitor_report:        l.is_monitor_report        ?? false,
                                      is_range_limit:           l.is_range_limit           ?? false,
                                      min_value:                l.min_value                != null ? String(l.min_value) : "",
                                      max_value:                l.max_value                != null ? String(l.max_value) : "",
                                      range_unit:               l.range_unit               ?? "s.u.",
                                      is_flow_limit:            l.is_flow_limit            ?? false,
                                      averaging_period:         l.averaging_period         ?? "daily_max",
                                    });
                                    setParamSearch(param ? `${param.name} (${param.abbreviation})` : l.parameter_name);
                                    setParamDropdownOpen(false);
                                    setTimeout(() => limitFormRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }), 0);
                                  }}>
                                  <td><strong>{l.parameter_name}</strong></td>
                                  <td style={{textAlign:"center"}}>
                                    {l.is_monitor_report ? <span style={s.mrBadge}>MR</span>
                                      : l.is_range_limit ? <span style={s.rangeBadge}>{l.min_value ?? "—"} — {l.max_value ?? "—"} {l.range_unit}</span>
                                      : l.is_flow_limit
                                        ? <strong>{l.daily_max_concentration ?? "—"} MGD</strong>
                                      : <strong>{l.daily_max_concentration ?? "—"}</strong>}
                                  </td>
                                  <td style={{textAlign:"center"}}>
                                    {l.is_monitor_report || l.is_flow_limit ? "—"
                                      : <strong>{l.daily_max_loading ?? "—"}</strong>}
                                  </td>
                                  <td style={{textAlign:"center"}}>{l.is_monitor_report || l.is_range_limit || l.is_flow_limit ? "—" : <strong>{l.weekly_max_concentration ?? "—"}</strong>}</td>
                                  <td style={{textAlign:"center"}}>{l.is_monitor_report || l.is_range_limit || l.is_flow_limit ? "—" : <strong>{l.weekly_max_loading ?? "—"}</strong>}</td>
                                  <td style={{textAlign:"center"}}>
                                    {l.is_monitor_report ? <span style={s.mrBadge}>MR</span>
                                      : l.is_range_limit ? "—"
                                      : l.is_flow_limit
                                        ? <strong>{l.monthly_avg_concentration ?? "—"} MGD</strong>
                                      : <strong>{l.monthly_avg_concentration ?? "—"}</strong>}
                                  </td>
                                  <td style={{textAlign:"center"}}>
                                    {l.is_monitor_report || l.is_flow_limit ? "—"
                                      : l.is_range_limit ? "—"
                                      : <strong>{l.monthly_avg_loading ?? "—"}</strong>}
                                  </td>
                                  <td style={{textAlign:"center"}}>{l.frequency_description ?? "—"}</td>
                                  <td style={{textAlign:"center", textTransform:"capitalize"}}>{l.sample_type ?? "—"}</td>
                                  <td style={{whiteSpace:"nowrap"}} onClick={e => e.stopPropagation()}>
                                    <button style={s.actionDel}
                                      onClick={() => handleDeleteLimit(l.id, l.parameter_name)}>
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                      }
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === "review" && (
          <div>
            {/* Sub-mode toggle: Samples | Flow Reports */}
            <div style={{display:"flex", gap:0, marginBottom:20, borderRadius:8, overflow:"hidden",
                         border:"1px solid #b794f4", width:"fit-content"}}>
              <button type="button"
                onClick={() => { setReviewSubMode("samples"); setSelectedFlowReport(null); }}
                style={{padding:"9px 22px", fontSize:13, fontWeight:600, cursor:"pointer", border:"none",
                        borderRight:"1px solid #b794f4",
                        background: reviewSubMode === "samples" ? "#553c9a" : "#f7f4ff",
                        color:      reviewSubMode === "samples" ? "#fff"     : "#553c9a"}}>
                Sample Review
              </button>
              <button type="button"
                onClick={() => { setReviewSubMode("flow_reports"); setSelectedSample(null); }}
                style={{padding:"9px 22px", fontSize:13, fontWeight:600, cursor:"pointer", border:"none",
                        background: reviewSubMode === "flow_reports" ? "#553c9a" : "#f7f4ff",
                        color:      reviewSubMode === "flow_reports" ? "#fff"     : "#553c9a"}}>
                Flow Report Review
                {flowReports.filter((r: any) => ["pending","rejected"].includes(r.review_status ?? "pending")).length > 0 && (
                  <span style={{marginLeft:6, background:"#c53030", color:"#fff", borderRadius:10,
                                padding:"1px 7px", fontSize:11, fontWeight:700}}>
                    {flowReports.filter((r: any) => ["pending","rejected"].includes(r.review_status ?? "pending")).length}
                  </span>
                )}
              </button>
            </div>

          {reviewSubMode === "flow_reports" && (
            <div style={s.twoCol}>
              {/* Left: flow report queue */}
              <div style={{minWidth:280, maxWidth:340}}>
                <h2 style={s.sectionTitle}>Monthly Flow Reports</h2>

                {/* Filters */}
                <div style={{background:"#f7fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 12px", marginBottom:10, display:"flex", flexDirection:"column", gap:8}}>
                  <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
                    {(["all","pending","reviewed","rejected"] as const).map(sv => (
                      <label key={sv} style={{display:"flex", alignItems:"center", gap:4, fontSize:12, cursor:"pointer", userSelect:"none"}}>
                        <input type="radio" name="flowStatus" value={sv}
                          checked={flowReportFilterStatus === sv}
                          onChange={() => setFlowReportFilterStatus(sv)}
                          style={{accentColor:"#553c9a"}} />
                        {sv === "all" ? "All" : sv === "pending" ? "Pending" : sv === "rejected" ? "Rejected" : "Approved"}
                      </label>
                    ))}
                  </div>
                  <select value={flowReportFilterCompany} onChange={e => setFlowReportFilterCompany(e.target.value)}
                    style={{fontSize:12, padding:"3px 6px", borderRadius:5, border:"1px solid #cbd5e0", background:"#fff"}}>
                    <option value="">All Companies</option>
                    {companies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>

                {(() => {
                  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  const filtered = flowReports.filter((r: any) => {
                    if (flowReportFilterStatus !== "all" && (r.review_status ?? "pending") !== flowReportFilterStatus) return false;
                    if (flowReportFilterCompany && String(r.company_id) !== flowReportFilterCompany) return false;
                    return true;
                  });
                  if (filtered.length === 0)
                    return <p style={s.meta}>{flowReports.length === 0 ? "No flow reports yet." : "No reports match the current filters."}</p>;
                  return filtered.map((r: any) => {
                    const status     = r.review_status ?? "pending";
                    const isSelected = selectedFlowReport?.id === r.id;
                    const badgeStyle = status === "reviewed"
                      ? s.badgeReviewed
                      : status === "rejected"
                        ? {fontSize:11, padding:"2px 7px", borderRadius:10, fontWeight:700,
                           background:"#fff5f5", color:"#c53030", border:"1px solid #fc8181"}
                        : s.badgePending;
                    const badgeLabel = status === "reviewed" ? "Approved" : status === "rejected" ? "Rejected" : "Pending";
                    return (
                      <div key={r.id}
                        style={{...s.listItem, cursor:"pointer",
                          borderLeft: isSelected ? "3px solid #553c9a" : status === "rejected" ? "3px solid #fc8181" : "3px solid transparent",
                          background: isSelected ? "#f3e8ff" : status === "rejected" ? "#fff5f5" : "#fff"}}
                        onClick={() => {
                          setSelectedFlowReport(r);
                          setFlowReviewComment(r.review_comment || "");
                          setFlowReviewMsg(null);
                        }}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:4}}>
                          <strong style={{fontSize:13}}>{r.company_name ?? `Company #${r.company_id}`}</strong>
                          <span style={badgeStyle}>{badgeLabel}</span>
                        </div>
                        <span style={s.meta}>
                          {MONTHS_SHORT[(r.report_month ?? 1) - 1]} {r.report_year}
                          {" · "}{r.total_flow_mg != null ? `${Number(r.total_flow_mg).toFixed(3)} MG` : "—"}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Right: flow report review panel */}
              {selectedFlowReport ? (
                <div style={{flex:1}}>
                  <div style={s.reviewCard}>
                    {(() => {
                      const r = selectedFlowReport;
                      const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                      return (
                        <>
                          <h3 style={s.formTitle}>
                            {r.company_name} — {MONTHS_FULL[(r.report_month ?? 1) - 1]} {r.report_year}
                          </h3>
                          <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12,
                                       background:"#f7fafc", borderRadius:6, padding:12, marginBottom:16}}>
                            <div>
                              <div style={s.label}>Method</div>
                              <strong>
                                {r.measurement_method === "time_volume" ? "Time-Volume"
                                  : r.measurement_method === "direct" ? "Direct Entry"
                                  : "Meter Totalizer"}
                              </strong>
                            </div>
                            <div><div style={s.label}>Period Days</div><strong>{r.period_days}</strong></div>
                            <div><div style={s.label}>Total Flow (MG)</div><strong style={{color:"#2b6cb0"}}>{r.total_flow_mg?.toFixed(4) ?? "—"}</strong></div>
                            <div><div style={s.label}>Monthly Avg (MGD)</div><strong>{r.monthly_avg_mgd?.toFixed(4) ?? "—"}</strong></div>
                            <div><div style={s.label}>Daily Max (MGD)</div><strong>{r.daily_max_mgd?.toFixed(4) ?? "—"}</strong></div>
                            <div><div style={s.label}>Weekly Max (MGD)</div><strong>{r.weekly_max_mgd?.toFixed(4) ?? "—"}</strong></div>
                            {r.measurement_method === "meter" && (
                              <>
                                <div><div style={s.label}>Meter</div><strong>{r.meter_label ?? "—"}</strong></div>
                                <div><div style={s.label}>Beginning Read</div><strong>{r.beginning_read != null ? Number(r.beginning_read).toLocaleString() : "—"}</strong></div>
                                <div><div style={s.label}>End Read</div><strong>{r.end_read != null ? Number(r.end_read).toLocaleString() : "—"}</strong></div>
                              </>
                            )}
                            {r.measurement_method === "time_volume" && (
                              <>
                                <div><div style={s.label}>Avg Flow Rate</div><strong>{r.tv_avg_gpm != null ? `${Number(r.tv_avg_gpm).toFixed(2)} GPM` : "—"}</strong></div>
                                <div><div style={s.label}>Operating Hrs/Day</div><strong>{r.tv_operating_hours ?? "—"}</strong></div>
                              </>
                            )}
                          </div>
                          <div style={{fontSize:12, color:"#718096", marginBottom:12}}>
                            Submitted by <strong>{r.submitted_by ?? "—"}</strong>
                            {r.submitted_at ? ` on ${r.submitted_at.slice(0,10)}` : ""}
                          </div>

                          <label style={{...s.label, marginTop:8}}>Review Comment</label>
                          <textarea style={s.reviewTextarea} rows={4}
                            value={flowReviewComment}
                            onChange={e => setFlowReviewComment(e.target.value)}
                            placeholder="Optional — note any corrections needed or confirm accuracy" />

                          {flowReviewMsg && (
                            <div style={{padding:"8px 12px", borderRadius:5, marginBottom:10, fontSize:13, fontWeight:500,
                              background: flowReviewMsg.type === "ok" ? "#c6f6d5" : "#fff5f5",
                              color:      flowReviewMsg.type === "ok" ? "#276749"  : "#c53030",
                              border: `1px solid ${flowReviewMsg.type === "ok" ? "#9ae6b4" : "#fc8181"}`}}>
                              {flowReviewMsg.text}
                            </div>
                          )}

                          <div style={{...s.btnRow, justifyContent:"space-between"}}>
                            <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
                              <button style={s.btn} disabled={flowReviewSubmitting}
                                onClick={async () => {
                                  setFlowReviewSubmitting(true);
                                  setFlowReviewMsg(null);
                                  try {
                                    const res = await reviewFlowReport(r.id, { action:"approve", comment: flowReviewComment });
                                    const violations: any[] = res.data.violations ?? [];
                                    setSelectedFlowReport(res.data.report);
                                    setFlowReports(prev => prev.map((p: any) => p.id === r.id ? res.data.report : p));
                                    setFlowReviewMsg({
                                      type: "ok",
                                      text: violations.length === 0
                                        ? "Flow report approved — no flow limit violations."
                                        : `Approved — ${violations.length} flow limit violation(s) recorded.`,
                                    });
                                  } catch(err: any) {
                                    setFlowReviewMsg({ type:"err", text: err?.response?.data?.error ?? "Failed to approve report." });
                                  } finally {
                                    setFlowReviewSubmitting(false);
                                  }
                                }}>
                                {flowReviewSubmitting ? "Saving…" : r.review_status === "reviewed" ? "Re-approve" : "Approve"}
                              </button>
                              <button
                                disabled={flowReviewSubmitting}
                                style={{padding:"8px 18px", borderRadius:6, border:"1px solid #fc8181",
                                        background:"#fff5f5", color:"#c53030", fontWeight:600,
                                        fontSize:13, cursor: flowReviewSubmitting ? "default" : "pointer"}}
                                onClick={async () => {
                                  if (!flowReviewComment.trim()) {
                                    setFlowReviewMsg({ type:"err", text:"A rejection reason is required — enter it in the comment field above." });
                                    return;
                                  }
                                  setFlowReviewSubmitting(true);
                                  setFlowReviewMsg(null);
                                  try {
                                    const res = await rejectFlowReport(r.id, flowReviewComment);
                                    setSelectedFlowReport(res.data.report);
                                    setFlowReports(prev => prev.map((p: any) => p.id === r.id ? res.data.report : p));
                                    setFlowReviewMsg({ type:"ok", text:"Flow report rejected — the IU has been notified to correct and resubmit." });
                                  } catch(err: any) {
                                    setFlowReviewMsg({ type:"err", text: err?.response?.data?.error ?? "Failed to reject report." });
                                  } finally {
                                    setFlowReviewSubmitting(false);
                                  }
                                }}>
                                Reject
                              </button>
                              {r.review_status === "reviewed" && (
                                <span style={s.reviewedNote}>
                                  Reviewed {r.reviewed_at?.slice(0,10)}
                                </span>
                              )}
                            </div>
                            <button
                              disabled={flowReviewSubmitting}
                              style={{padding:"7px 14px", borderRadius:6, border:"1px solid #fc8181",
                                      background:"#fff5f5", color:"#c53030", fontWeight:600,
                                      fontSize:12, cursor: flowReviewSubmitting ? "default" : "pointer"}}
                              onClick={async () => {
                                if (!window.confirm(`Delete the ${r.report_month}/${r.report_year} flow report for ${r.company_name ?? "this company"}? This cannot be undone.`)) return;
                                try {
                                  await deleteFlowReport(r.id);
                                  setFlowReports(prev => prev.filter((p: any) => p.id !== r.id));
                                  setSelectedFlowReport(null);
                                  setFlowReviewMsg(null);
                                } catch {
                                  setFlowReviewMsg({ type:"err", text:"Failed to delete flow report." });
                                }
                              }}>
                              Delete Report
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#a0aec0", fontSize:14}}>
                  Select a flow report from the list to review
                </div>
              )}
            </div>
          )}

          {reviewSubMode === "samples" && (
          <div style={s.twoCol}>
            {/* â"€â"€ Left: sample queue â"€â"€ */}
            <div style={{minWidth:280, maxWidth:340}}>
              <h2 style={s.sectionTitle}>Submitted Samples</h2>

              {/* ── Check Missing Samples ── */}
              <div style={{marginBottom:10, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
                <button
                  onClick={() => {
                    setMissingCheckLoading(true);
                    setMissingCheckResult(null);
                    checkMissingSamples()
                      .then(r => setMissingCheckResult(r.data))
                      .catch(() => setMissingCheckResult(null))
                      .finally(() => setMissingCheckLoading(false));
                  }}
                  disabled={missingCheckLoading}
                  style={{fontSize:12, padding:"5px 12px", borderRadius:5, border:"1px solid #9f7aea",
                          background: missingCheckLoading ? "#e9d8fd" : "#553c9a", color:"#fff",
                          cursor: missingCheckLoading ? "default" : "pointer", fontWeight:600}}>
                  {missingCheckLoading ? "Checking…" : "Check Missing Samples"}
                </button>
                {missingCheckResult && (
                  <span style={{fontSize:12, color: missingCheckResult.new_violations > 0 ? "#c53030" : "#276749", fontWeight:500}}>
                    {missingCheckResult.new_violations === 0
                      ? "No new missing-sample violations found."
                      : `${missingCheckResult.new_violations} new violation${missingCheckResult.new_violations !== 1 ? "s" : ""} recorded${missingCheckResult.enforcement_actions > 0 ? `, ${missingCheckResult.enforcement_actions} enforcement action${missingCheckResult.enforcement_actions !== 1 ? "s" : ""} generated` : ""}.`}
                  </span>
                )}
              </div>

              {/* ── Filters ── */}
              <div style={{background:"#f7fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 12px", marginBottom:10, display:"flex", flexDirection:"column", gap:8}}>

                {/* Status radio buttons */}
                <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
                  {(["all","pending","reviewed"] as const).map(sv => (
                    <label key={sv} style={{display:"flex", alignItems:"center", gap:4, fontSize:12, cursor:"pointer", userSelect:"none"}}>
                      <input type="radio" name="reviewStatus" value={sv}
                        checked={reviewFilterStatus === sv}
                        onChange={() => setReviewFilterStatus(sv)}
                        style={{accentColor:"#553c9a"}} />
                      {sv === "all" ? "All" : sv === "pending" ? "Pending" : "Reviewed"}
                    </label>
                  ))}
                </div>

                {/* Company dropdown */}
                <select
                  value={reviewFilterCompany}
                  onChange={e => setReviewFilterCompany(e.target.value)}
                  style={{fontSize:12, padding:"3px 6px", borderRadius:5, border:"1px solid #cbd5e0", background:"#fff"}}>
                  <option value="">All Companies</option>
                  {(companies as any[])
                    .map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>

                {/* Date range */}
                <div style={{display:"flex", gap:6, alignItems:"center"}}>
                  <input type="date" value={reviewFilterStart} onChange={e => setReviewFilterStart(e.target.value)}
                    style={{fontSize:12, padding:"3px 6px", borderRadius:5, border:"1px solid #cbd5e0", flex:1}} />
                  <span style={{fontSize:11, color:"#718096"}}>to</span>
                  <input type="date" value={reviewFilterEnd} onChange={e => setReviewFilterEnd(e.target.value)}
                    style={{fontSize:12, padding:"3px 6px", borderRadius:5, border:"1px solid #cbd5e0", flex:1}} />
                </div>

                {/* Clear link — only shown when any filter is active */}
                {(reviewFilterStatus !== "all" || reviewFilterCompany || reviewFilterStart || reviewFilterEnd) && (
                  <button
                    onClick={() => { setReviewFilterStatus("all"); setReviewFilterCompany(""); setReviewFilterStart(""); setReviewFilterEnd(""); }}
                    style={{alignSelf:"flex-start", fontSize:11, color:"#553c9a", background:"none", border:"none", padding:0, cursor:"pointer", textDecoration:"underline"}}>
                    Clear filters
                  </button>
                )}
              </div>

              {/* ── Sample list (filtered) ── */}
              {(() => {
                const filtered = reviewSamples.filter((sample: any) => {
                  if (reviewFilterStatus !== "all") {
                    const status = sample.review_status ?? "pending";
                    if (status !== reviewFilterStatus) return false;
                  }
                  if (reviewFilterCompany && String(sample.company_id) !== reviewFilterCompany) return false;
                  if (reviewFilterStart && sample.sample_date < reviewFilterStart) return false;
                  if (reviewFilterEnd   && sample.sample_date > reviewFilterEnd)   return false;
                  return true;
                });
                if (filtered.length === 0)
                  return <p style={s.meta}>{reviewSamples.length === 0 ? "No samples submitted yet." : "No samples match the current filters."}</p>;
                return filtered.map((sample: any) => {
                  const isPending  = (sample.review_status ?? "pending") === "pending";
                  const isSelected = selectedSample?.id === sample.id;
                  return (
                    <div key={sample.id}
                      style={{...s.listItem, cursor:"pointer", borderLeft: isSelected ? "3px solid #553c9a" : "3px solid transparent",
                        background: isSelected ? "#f3e8ff" : "#fff"}}
                      onClick={() => handleSelectReviewSample(sample)}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:4}}>
                        <strong style={{fontSize:13}}>{(companies as any[]).find(c => c.id === sample.company_id)?.name ?? `Company #${sample.company_id}`}</strong>
                        <div style={{display:"flex", gap:4}}>
                          {sample.is_corrected && <span style={s.badgeCorrected}>Corrected</span>}
                          <span style={isPending ? s.badgePending : s.badgeReviewed}>
                            {isPending ? "Pending" : "Reviewed"}
                          </span>
                        </div>
                      </div>
                      <span style={s.meta}>{sample.sample_date} · {sample.sampler_name ?? "—"}</span>
                    </div>
                  );
                });
              })()}
            </div>

            {/* â"€â"€ Right: review panel â"€â"€ */}
            {selectedSample ? (
              <div style={{flex:1}}>
                <div style={s.reviewCard}>
                  <h3 style={s.formTitle}>
                    {selectedSample.company_name} — {selectedSample.permit_number}
                    <span style={{fontWeight:400, fontSize:13, color:"#718096", marginLeft:12}}>
                      {selectedSample.sample_date}
                    </span>
                  </h3>

                  {/* Sample details / header edit */}
                  {editingHeader ? (
                    <div style={{background:"#fffbeb", border:"1px solid #f6e05e", borderRadius:6, padding:12, marginBottom:12}}>
                      <div style={{display:"flex", gap:12, marginBottom:8}}>
                        <div style={{flex:1}}>
                          <label style={s.label}>Sample Date</label>
                          <input style={s.input} type="date" value={headerEdits.sample_date}
                            onChange={e => setHeaderEdits(p => ({...p, sample_date: e.target.value}))} />
                        </div>
                        <div style={{flex:1}}>
                          <label style={s.label}>Sampler Name</label>
                          <input style={s.input} type="text" value={headerEdits.sampler_name}
                            onChange={e => setHeaderEdits(p => ({...p, sampler_name: e.target.value}))} />
                        </div>
                      </div>
                      <label style={s.label}>Correction Reason <span style={{color:"#718096", fontWeight:400}}>(recommended)</span></label>
                      <input style={{...s.input, marginBottom:8}} value={correctionReason}
                        onChange={e => setCorrectionReason(e.target.value)}
                        placeholder="e.g. Incorrect date entered — corrected per field log" />
                      <div style={s.btnRow}>
                        <button style={s.btn} onClick={handleSaveHeader}>Save Header</button>
                        <button style={s.clearBtn} onClick={() => setEditingHeader(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{...s.reviewMeta, alignItems:"center"}}>
                        <span><strong>Sampler:</strong> {selectedSample.sampler_name ?? "—"}</span>
                        <span>
                          <strong>Sample Flow:</strong>{" "}
                          {selectedSample.flow_mgd != null
                            ? `${selectedSample.flow_mgd.toFixed(4)} MGD`
                            : <span style={{color:"#a0aec0", fontStyle:"italic"}}>not recorded</span>}
                        </span>
                        <span><strong>Days:</strong> {selectedSample.sampling_days}</span>
                        {selectedSample.is_corrected && <span style={s.badgeCorrected}>Corrected</span>}
                        <button style={{...s.actionEdit, marginLeft:"auto"}} onClick={() => {
                          setHeaderEdits({ sample_date: selectedSample.sample_date, sampler_name: selectedSample.sampler_name ?? "" });
                          setCorrectionReason("");
                          setEditingHeader(true);
                        }}>Edit Header</button>
                      </div>

                      {/* Flow report strip for this monitoring period */}
                      {(() => {
                        const fr = sampleFlowReport;
                        if (!fr) return null;   // still loading

                        const MONTHS = ["","January","February","March","April","May","June",
                                        "July","August","September","October","November","December"];
                        const periodLabel = `${MONTHS[fr.report_month] ?? fr.report_month} ${fr.report_year}`;
                        const METHOD_LABELS: Record<string,string> = {
                          meter: "Meter Totalizer", time_volume: "Time-Volume", direct: "Direct Entry"
                        };

                        if (fr._missing) {
                          return (
                            <div style={{display:"flex", alignItems:"center", gap:8, padding:"7px 12px",
                              background:"#fff5f5", border:"1px solid #fed7d7", borderRadius:6, marginBottom:10, fontSize:12}}>
                              <span style={{fontWeight:700, color:"#c53030"}}>⚠ No Flow Report Submitted</span>
                              <span style={{color:"#718096"}}>for {periodLabel} — loading calculations unavailable</span>
                            </div>
                          );
                        }

                        const status    = fr.review_status ?? "pending";
                        const statusBg  = status === "reviewed" ? "#c6f6d5" : status === "rejected" ? "#fed7d7" : "#fefcbf";
                        const statusCl  = status === "reviewed" ? "#276749" : status === "rejected" ? "#c53030" : "#744210";
                        const statusLbl = status === "reviewed" ? "Reviewed" : status === "rejected" ? "Rejected" : "Pending";

                        return (
                          <div style={{padding:"8px 12px", background:"#ebf8ff", border:"1px solid #bee3f8",
                            borderRadius:6, marginBottom:10, fontSize:12}}>
                            <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                              <span style={{fontWeight:700, color:"#2b6cb0"}}>Flow Report — {periodLabel}</span>
                              <span style={{padding:"1px 7px", borderRadius:10, fontWeight:600,
                                background:statusBg, color:statusCl, fontSize:11}}>
                                {statusLbl}
                              </span>
                              {fr.measurement_method && (
                                <span style={{padding:"1px 7px", borderRadius:10, fontWeight:600, fontSize:11,
                                  background:"#e9d8fd", color:"#553c9a"}}>
                                  {METHOD_LABELS[fr.measurement_method] ?? fr.measurement_method}
                                </span>
                              )}
                              <span style={{marginLeft:"auto", color:"#718096"}}>
                                Submitted by <strong>{fr.submitted_by ?? "—"}</strong>
                              </span>
                            </div>
                            <div style={{display:"flex", gap:20, marginTop:6, flexWrap:"wrap"}}>
                              <span>
                                <span style={{color:"#4a5568"}}>Monthly Avg: </span>
                                <strong>{fr.monthly_avg_mgd != null ? fr.monthly_avg_mgd.toFixed(4) : "—"} MGD</strong>
                              </span>
                              {fr.daily_max_mgd != null && (
                                <span>
                                  <span style={{color:"#4a5568"}}>Daily Max: </span>
                                  <strong>{fr.daily_max_mgd.toFixed(4)} MGD</strong>
                                </span>
                              )}
                              {fr.weekly_max_mgd != null && (
                                <span>
                                  <span style={{color:"#4a5568"}}>Weekly Max: </span>
                                  <strong>{fr.weekly_max_mgd.toFixed(4)} MGD</strong>
                                </span>
                              )}
                              {fr.total_flow_mg != null && (
                                <span>
                                  <span style={{color:"#4a5568"}}>Total: </span>
                                  <strong>{fr.total_flow_mg.toFixed(4)} MG</strong>
                                </span>
                              )}
                              <span>
                                <span style={{color:"#4a5568"}}>Days: </span>
                                <strong>{fr.period_days}</strong>
                              </span>
                            </div>
                            {status === "rejected" && fr.review_comment && (
                              <div style={{marginTop:5, color:"#c53030", fontStyle:"italic"}}>
                                Rejected: {fr.review_comment}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {/* Results table */}
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                    <span style={{fontSize:12, fontWeight:700, color:"#4a5568", textTransform:"uppercase", letterSpacing:"0.06em"}}>
                      Sample Results
                    </span>
                    {!showAddParam && (
                      <button
                        style={{...s.actionEdit, fontSize:12, padding:"3px 10px"}}
                        onClick={handleOpenAddParam}>
                        + Add Missing Parameter
                      </button>
                    )}
                  </div>

                  {/* Add missing parameter form */}
                  {showAddParam && (
                    <div style={{background:"#ebf8ff", border:"1px solid #bee3f8", borderRadius:6,
                                 padding:"12px 14px", marginBottom:12}}>
                      <div style={{fontSize:12, fontWeight:700, color:"#2b6cb0", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em"}}>
                        Add Missing Parameter
                      </div>
                      {addParamLimits.length === 0 ? (
                        <p style={{fontSize:13, color:"#718096", margin:0}}>
                          All permitted parameters already have results for this sample.
                        </p>
                      ) : (
                        <div style={{display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap"}}>
                          <div>
                            <label style={{display:"block", fontSize:12, fontWeight:600, color:"#4a5568", marginBottom:3}}>
                              Parameter
                            </label>
                            <select
                              style={{padding:"5px 8px", border:"1px solid #bee3f8", borderRadius:5, fontSize:13, minWidth:200}}
                              value={addParamLimitId}
                              onChange={e => setAddParamLimitId(e.target.value)}>
                              {addParamLimits.map((l: any) => (
                                <option key={l.id} value={l.id}>{l.parameter_name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{display:"block", fontSize:12, fontWeight:600, color:"#4a5568", marginBottom:3}}>
                              Result (mg/L)
                            </label>
                            <input
                              type="number" step="any" min="0"
                              placeholder="e.g. 42.5"
                              value={addParamConc}
                              onChange={e => setAddParamConc(e.target.value)}
                              style={{padding:"5px 8px", border:"1px solid #bee3f8", borderRadius:5, fontSize:13, width:120}}
                            />
                          </div>
                          <button
                            style={{...s.actionSave, padding:"6px 16px", fontSize:13}}
                            disabled={addParamSaving || !addParamLimitId}
                            onClick={handleSubmitAddParam}>
                            {addParamSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            style={{...s.actionCancel, padding:"6px 12px", fontSize:13}}
                            onClick={() => setShowAddParam(false)}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSample.results?.length > 0 && (
                    <table style={{...s.table, marginBottom:16}}>
                      <thead><tr>
                        <th style={s.th}>Parameter</th>
                        <th style={s.th}>Result (mg/L)</th>
                        <th style={s.th}>Loading (lbs/day)</th>
                        <th style={s.th}>Limit</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}>Actions</th>
                      </tr></thead>
                      <tbody>{selectedSample.results.map((r: any, i: number) => {
                        const isMR    = r.is_monitor_report;
                        const isRange = r.is_range_limit;
                        const isEditing = editingResultId === r.permit_limit_id;
                        const exceedsConc = r.daily_max_concentration != null &&
                                            r.concentration_result != null &&
                                            r.concentration_result > r.daily_max_concentration;
                        const exceedsLoad = r.daily_max_loading != null &&
                                            r.loading_result != null &&
                                            r.loading_result > r.daily_max_loading;
                        const exceedance  = exceedsConc || exceedsLoad;
                        const isCorrectingThis = correctionPanel?.permit_limit_id === r.permit_limit_id;
                        return (
                          <tr key={i}
                            style={{
                              ...(exceedance ? {background:"#fff5f5"} : {}),
                              ...(isCorrectingThis ? {outline:"2px solid #3182ce", outlineOffset:-1} : {}),
                            }}>
                            <td style={s.td}>{r.parameter_name}</td>
                            <td style={s.td}>{r.concentration_result ?? "—"}</td>
                            <td style={s.td}>{r.loading_result?.toFixed(2) ?? "—"}</td>
                            <td style={s.td}>
                              {isMR
                                ? <span style={s.mrBadge}>MR</span>
                                : isRange
                                  ? <span style={s.rangeBadge}>{r.min_value}—{r.max_value} {r.range_unit}</span>
                                  : r.daily_max_concentration != null && r.daily_max_loading != null
                                    ? <strong>{r.daily_max_concentration} mg/L / {r.daily_max_loading} lbs/day</strong>
                                    : r.daily_max_concentration != null
                                      ? <strong>{r.daily_max_concentration} mg/L</strong>
                                      : r.daily_max_loading != null
                                        ? <strong>{r.daily_max_loading} lbs/day</strong>
                                        : "—"}
                            </td>
                            <td style={s.td}>
                              {isMR || isRange
                                ? <span style={s.statusInfo}>N/A</span>
                                : exceedance
                                  ? <span style={s.statusFail}>Exceedance</span>
                                  : <span style={s.statusPass}>Pass</span>}
                            </td>
                            <td style={{...s.td, whiteSpace:"nowrap"}}>
                              {!isMR && (
                                <button
                                  style={isCorrectingThis ? s.actionSave : s.actionEdit}
                                  onClick={() => {
                                    if (isCorrectingThis) {
                                      setCorrectionPanel(null);
                                    } else {
                                      setCorrectionPanel(r);
                                      setCorrectionNewValue(String(r.concentration_result ?? ""));
                                      setCorrectionNote("");
                                      setShowAddParam(false);
                                      setReviewMsg(null);
                                    }
                                  }}>
                                  {isCorrectingThis ? "▲ Cancel" : "Correct"}
                                </button>
                              )}
                              <button style={s.actionDel} onClick={() => handleDeleteResult(r.id, r.permit_limit_id)}>Delete</button>
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  )}

                  {/* ── Correction panel ─────────────────────────────────── */}
                  {correctionPanel && (
                    <div style={{background:"#fffbeb", border:"2px solid #f6e05e", borderRadius:8,
                                 padding:"16px 18px", marginBottom:14}}>
                      <div style={{fontSize:12, fontWeight:700, color:"#744210",
                                   textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12}}>
                        Correct Sample Result
                      </div>

                      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:14}}>
                        <div>
                          <div style={{fontSize:11, fontWeight:600, color:"#718096",
                                       textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3}}>
                            Parameter
                          </div>
                          <div style={{fontSize:14, fontWeight:700, color:"#1a365d"}}>
                            {correctionPanel.parameter_name}
                          </div>
                        </div>
                        <div>
                          <div style={{fontSize:11, fontWeight:600, color:"#718096",
                                       textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3}}>
                            Original Value
                          </div>
                          <div style={{fontSize:14, fontWeight:700, color:"#c53030"}}>
                            {correctionPanel.concentration_result ?? "—"} mg/L
                          </div>
                        </div>
                      </div>

                      <div style={{display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap"}}>
                        <div>
                          <label style={{display:"block", fontSize:12, fontWeight:600,
                                         color:"#744210", marginBottom:4}}>
                            Corrected Value (mg/L) <span style={{color:"#c53030"}}>*</span>
                          </label>
                          <input
                            type="number" step="any" min="0"
                            autoFocus
                            value={correctionNewValue}
                            onChange={e => setCorrectionNewValue(e.target.value)}
                            style={{padding:"6px 10px", border:"2px solid #f6e05e", borderRadius:5,
                                    fontSize:14, width:130, fontWeight:600}}
                          />
                        </div>
                        <div style={{flex:1, minWidth:260}}>
                          <label style={{display:"block", fontSize:12, fontWeight:600,
                                         color:"#744210", marginBottom:4}}>
                            Reason for Correction <span style={{color:"#c53030"}}>*</span>
                            <span style={{fontWeight:400, color:"#a0aec0", marginLeft:6, fontSize:11}}>
                              — required for audit trail
                            </span>
                          </label>
                          <textarea
                            rows={2}
                            placeholder="e.g. Transposed value corrected per facility email dated 05/15/2026, COA attached. Correct value is 42.5 mg/L."
                            value={correctionNote}
                            onChange={e => setCorrectionNote(e.target.value)}
                            style={{display:"block", width:"100%", padding:"6px 10px",
                                    border:`2px solid ${correctionNote.trim() ? "#f6e05e" : "#fc8181"}`,
                                    borderRadius:5, fontSize:12, resize:"vertical",
                                    boxSizing:"border-box" as const}}
                          />
                        </div>
                      </div>

                      <div style={{display:"flex", gap:10, marginTop:14, alignItems:"center"}}>
                        <button
                          style={{...s.btn, background: correctionSaving ? "#a0aec0" : "#c05621",
                                  opacity: correctionSaving ? 0.7 : 1}}
                          disabled={correctionSaving || !correctionNote.trim() || correctionNewValue === ""}
                          onClick={handleCorrectResult}>
                          {correctionSaving ? "Saving…" : "Save Correction"}
                        </button>
                        <button
                          style={s.outlineBtn}
                          onClick={() => setCorrectionPanel(null)}>
                          Cancel
                        </button>
                        <span style={{fontSize:11, color:"#a0aec0", marginLeft:4}}>
                          Correction will be logged in the audit trail and compliance will be re-evaluated.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Violations */}
                  {selectedSample.violations?.length > 0 && (
                    <div style={s.violationBox}>
                      <strong style={{color:"#c53030"}}>Violations Detected</strong>
                      {selectedSample.violations.map((v: any, i: number) => (
                        <div key={i} style={s.violationRow}>
                          {v.parameter_name}: {v.violation_type.replace("_"," ")} —{" "}
                          {v.exceedance_percent?.toFixed(1)}% above limit
                          <span style={{...s.badgePending, marginLeft:8, textTransform:"capitalize"}}>
                            {v.violation_severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Correction history */}
                  {correctionHistory.length > 0 && (
                    <div style={{background:"#fffbeb", border:"1px solid #f6e05e", borderRadius:6, padding:12, marginBottom:12}}>
                      <strong style={{fontSize:13, color:"#744210"}}>Correction History</strong>
                      {correctionHistory.map((c: any) => (
                        <div key={c.id} style={{marginTop:8, fontSize:12, borderTop:"1px solid #fefcbf", paddingTop:6}}>
                          <span style={{color:"#718096"}}>{new Date(c.timestamp).toLocaleString()}</span>
                          {" · "}<strong>{c.username}</strong>
                          {" · "}<em>{c.action}</em>
                          {c.details && <div style={{marginTop:2, color:"#4a5568"}}>{c.details}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Review comment */}
                  <label style={{...s.label, marginTop:12}}>Review Comment</label>
                  <textarea style={s.reviewTextarea} value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)} rows={5} />

                  {reviewMsg && (
                    <div style={{
                      padding:"8px 12px", borderRadius:5, marginBottom:10, fontSize:13, fontWeight:500,
                      background: reviewMsg.type === "ok" ? "#c6f6d5" : "#fff5f5",
                      color:      reviewMsg.type === "ok" ? "#276749"  : "#c53030",
                      border: `1px solid ${reviewMsg.type === "ok" ? "#9ae6b4" : "#fc8181"}`,
                    }}>
                      {reviewMsg.text}
                    </div>
                  )}
                  <div style={{...s.btnRow, justifyContent:"space-between"}}>
                    <div style={{display:"flex", gap:10, alignItems:"center"}}>
                      <button style={s.btn} onClick={handleSubmitReview} disabled={reviewSubmitting}>
                        {reviewSubmitting ? "Saving…" : "Submit Review"}
                      </button>
                      <button style={s.recheckBtn} onClick={handleRecheckCompliance} title="Clear stale violations and re-evaluate against current permit limits">
                        Re-check Compliance
                      </button>
                      {selectedSample.review_status === "reviewed" && (
                        <span style={s.reviewedNote}>
                          Reviewed {selectedSample.reviewed_at?.slice(0,10)}
                        </span>
                      )}
                    </div>
                    <button style={s.deleteSampleBtn} onClick={handleDeleteSample}>
                      Delete Sample
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#a0aec0", fontSize:14}}>
                Select a sample from the list to review
              </div>
            )}
          </div>
        )}
          </div>
        )}

        {tab === "meters" && (
          <div>
            <div style={s.twoCol}>
            {/* â"€â"€ Left: filter + meter list â"€â"€ */}
            <div style={{minWidth:300}}>
              <h2 style={s.sectionTitle}>Flow Meters</h2>

              <label style={s.label}>Filter by Company</label>
              <select style={{...s.input, marginBottom:16}} value={metersCompanyFilter}
                onChange={e => {
                  setMetersCompanyFilter(e.target.value);
                  loadMeters(e.target.value || undefined);
                  setShowMeterForm(false);
                  setEditingMeterId(null);
                }}>
                <option value="">All companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <p style={{...s.meta, marginBottom:8}}>Double-click a meter to edit</p>

              {meters.length === 0
                ? <p style={s.meta}>No meters found. {metersCompanyFilter ? "Add one on the right." : "Select a company to begin."}</p>
                : meters.map((m: any) => {
                    const co = companies.find(c => c.id === m.company_id);
                    return (
                      <div key={m.id}
                        style={{...s.listItem, cursor:"pointer",
                          ...(editingMeterId === m.id ? s.selectedItem : {})}}
                        title="Double-click to edit"
                        onDoubleClick={() => {
                          setEditingMeterId(m.id);
                          setMetersCompanyFilter(String(m.company_id));
                          setNewMeter({
                            meter_id:     m.meter_id,
                            description:  m.description ?? "",
                            pulse_factor: String(m.pulse_factor ?? 1),
                            is_active:    m.is_active,
                            meter_type:   m.meter_type ?? "process",
                          });
                          setShowMeterForm(true);
                        }}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                          <strong>{m.meter_id}</strong>
                          <span style={m.is_active ? s.badgeReviewed : s.badgePending}>
                            {m.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <span style={s.meta}>
                          {co?.name ?? `Company #${m.company_id}`}
                          {" · "}{m.pulse_factor?.toLocaleString() ?? 1} gal/pulse
                          {m.description ? ` · ${m.description}` : ""}
                        </span>
                      </div>
                    );
                  })
              }

              {!showMeterForm && metersCompanyFilter && (
                <button style={{...s.btn, marginTop:12}} type="button"
                  onClick={() => {
                    setEditingMeterId(null);
                    setNewMeter({ meter_id:"", description:"", pulse_factor:"1", is_active: true, meter_type:"process" });
                    setShowMeterForm(true);
                    setStatus("");
                  }}>
                  + Add Meter
                </button>
              )}
            </div>

            {/* ── Right: add/edit meter form ── */}
            {showMeterForm && (
              <form onSubmit={handleSaveMeter} style={s.formCard}>
                <h3 style={s.formTitle}>{editingMeterId ? "Edit Flow Meter" : "Add Flow Meter"}</h3>

                <label style={s.label}>Company</label>
                <select style={s.input} value={metersCompanyFilter}
                  onChange={e => setMetersCompanyFilter(e.target.value)}
                  required disabled={!!editingMeterId}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <label style={s.label}>Meter ID / Serial Number</label>
                <input style={s.input} value={newMeter.meter_id}
                  placeholder="e.g. FM-001"
                  onChange={e => setNewMeter(p => ({...p, meter_id: e.target.value}))} required />

                <label style={s.label}>Description</label>
                <input style={s.input} value={newMeter.description}
                  placeholder="Optional description"
                  onChange={e => setNewMeter(p => ({...p, description: e.target.value}))} />

                <label style={s.label}>Pulse Factor (gallons per pulse)</label>
                <input style={s.input} type="number" step="any" min="0.001"
                  value={newMeter.pulse_factor}
                  placeholder="e.g. 100, 1000"
                  onChange={e => setNewMeter(p => ({...p, pulse_factor: e.target.value}))} required />
                <p style={{...s.meta, marginTop:-8, marginBottom:12}}>
                  Each pulse from the meter represents this many gallons.
                  Common values: 1, 10, 100, 1000.
                </p>

                <label style={s.label}>Meter Type</label>
                <select style={s.input} value={newMeter.meter_type}
                  onChange={e => setNewMeter(p => ({...p, meter_type: e.target.value}))}>
                  <option value="process">Process Flow Meter (used for surcharge &amp; loading calculations)</option>
                  <option value="sanitary">Sanitary Sewer Meter (readings recorded only — no calculations)</option>
                </select>

                <label style={{...s.mrCheckRow, marginTop: 12}}>
                  <input type="checkbox" checked={newMeter.is_active}
                    onChange={e => setNewMeter(p => ({...p, is_active: e.target.checked}))} />
                  <span>
                    Active meter
                    {newMeter.meter_type === "sanitary"
                      ? " (readings will be collected on sample submissions)"
                      : " (used for flow and surcharge calculations)"}
                  </span>
                </label>

                <div style={s.btnRow}>
                  <button style={s.btn} type="submit">
                    {editingMeterId ? "Save Changes" : "Add Meter"}
                  </button>
                  <button style={s.clearBtn} type="button"
                    onClick={() => {
                      setEditingMeterId(null);
                      setShowMeterForm(false);
                      setNewMeter({ meter_id:"", description:"", pulse_factor:"1", is_active: true, meter_type:"process" });
                      setStatus("");
                    }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            </div>

            {/* ── Readings table (full width below meters) ── */}
          {adminReadings.length > 0 && (
            <div style={{marginTop:24}}>
              <div style={{display:"flex", alignItems:"center", gap:16, marginBottom:10}}>
                <h3 style={{...s.sectionTitle, fontSize:15, margin:0}}>Meter Readings</h3>
                <div style={{display:"flex", gap:6}}>
                  {(["all","monthly"] as const).map(f => (
                    <button key={f} type="button"
                      onClick={() => setReadingsPurposeFilter(f)}
                      style={{fontSize:11, padding:"3px 10px", borderRadius:12, border:"1px solid",
                              fontWeight: readingsPurposeFilter === f ? 700 : 400,
                              background: readingsPurposeFilter === f
                                ? (f === "monthly" ? "#bee3f8" : "#e2e8f0")
                                : "#f7fafc",
                              color: readingsPurposeFilter === f
                                ? (f === "monthly" ? "#2b6cb0" : "#4a5568")
                                : "#718096",
                              borderColor: readingsPurposeFilter === f
                                ? (f === "monthly" ? "#90cdf4" : "#cbd5e0")
                                : "#e2e8f0",
                              cursor:"pointer"}}>
                      {f === "all" ? "All" : "Monthly"}
                    </button>
                  ))}
                </div>
              </div>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Meter</th>
                    <th style={s.th}>Meter Type</th>
                    <th style={s.th}>Purpose</th>
                    <th style={{...s.th, textAlign:"right"}}>Start</th>
                    <th style={{...s.th, textAlign:"right"}}>End</th>
                    <th style={{...s.th, textAlign:"right"}}>Volume (MG)</th>
                    <th style={{...s.th, textAlign:"right"}}>Volume (cu.ft.)</th>
                    <th style={s.th}>Period</th>
                    <th style={s.th}>Actions</th>
                  </tr></thead>
                  <tbody>{adminReadings
                    .filter((r: any) => r.reading_purpose !== "sample_event" && (readingsPurposeFilter === "all" || r.reading_purpose === readingsPurposeFilter))
                    .map((r: any) => {
                    const isSampleEvent = r.reading_purpose === "sample_event";
                    const volMG = ((r.reading_end - r.reading_start) * (r.pulse_factor || 1)) / 1_000_000;
                    return editingReadingId === r.id ? (
                      <tr key={r.id} style={{background:"#ebf8ff"}}>
                        <td style={s.td}>
                          <input type="date" style={{...s.input, padding:"3px 6px", marginBottom:0}}
                            value={editingReadingForm.reading_date}
                            onChange={e => setEditingReadingForm(f => ({...f, reading_date: e.target.value}))} />
                        </td>
                        <td style={s.td} colSpan={3}>
                          <select style={{...s.input, padding:"3px 6px", marginBottom:0}}
                            value={editingReadingForm.meter_id}
                            onChange={e => setEditingReadingForm(f => ({...f, meter_id: e.target.value}))}>
                            {meters.map((m: any) => (
                              <option key={m.id} value={m.id}>
                                {m.meter_id} ({m.meter_type})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={s.td}>
                          <input type="number" step="any" style={{...s.input, padding:"3px 6px", marginBottom:0, width:120}}
                            value={editingReadingForm.reading_start}
                            onChange={e => setEditingReadingForm(f => ({...f, reading_start: e.target.value}))} />
                        </td>
                        <td style={s.td}>
                          <input type="number" step="any" style={{...s.input, padding:"3px 6px", marginBottom:0, width:120}}
                            value={editingReadingForm.reading_end}
                            onChange={e => setEditingReadingForm(f => ({...f, reading_end: e.target.value}))} />
                        </td>
                        <td style={s.td} />
                        <td style={s.td} />
                        <td style={s.td}>
                          <input type="number" style={{...s.input, padding:"3px 6px", marginBottom:0, width:60}}
                            placeholder="days"
                            value={editingReadingForm.sampling_period_days}
                            onChange={e => setEditingReadingForm(f => ({...f, sampling_period_days: e.target.value}))} />
                        </td>
                        <td style={{...s.td, whiteSpace:"nowrap"}}>
                          <button style={s.actionSave} disabled={readingSaving}
                            onClick={async () => {
                              setReadingSaving(true);
                              try {
                                await updateMeterReading(r.id, {
                                  meter_id:             parseInt(editingReadingForm.meter_id),
                                  reading_date:         editingReadingForm.reading_date,
                                  reading_start:        parseFloat(editingReadingForm.reading_start),
                                  reading_end:          parseFloat(editingReadingForm.reading_end),
                                  sampling_period_days: editingReadingForm.sampling_period_days ? parseInt(editingReadingForm.sampling_period_days) : null,
                                });
                                setEditingReadingId(null);
                                loadMeters(metersCompanyFilter || undefined);
                                setStatus("Reading updated.");
                              } catch (err: any) {
                                setStatus(`Error: ${err.response?.data?.error ?? "Failed to save."}`);
                              } finally { setReadingSaving(false); }
                            }}>
                            {readingSaving ? "Saving…" : "Save"}
                          </button>
                          {" "}
                          <button style={s.actionCancel} onClick={() => setEditingReadingId(null)}>Cancel</button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={r.id} style={isSampleEvent ? {background:"#faf5ff"} : {}}>
                        <td style={s.td}>{r.reading_date}</td>
                        <td style={s.td}>{r.meter_label}</td>
                        <td style={{...s.td, fontWeight:600, fontSize:11, textTransform:"uppercase",
                            color: r.meter_type === "sanitary" ? "#744210" : "#276749"}}>
                          {r.meter_type}
                        </td>
                        <td style={s.td}>
                          <span style={{fontSize:11, fontWeight:600, padding:"2px 7px", borderRadius:10,
                              background: isSampleEvent ? "#e9d8fd" : "#bee3f8",
                              color:      isSampleEvent ? "#553c9a"  : "#2b6cb0"}}>
                            {isSampleEvent ? "Sample Event" : "Monthly"}
                          </span>
                        </td>
                        <td style={{...s.td, textAlign:"right"}}>{Number(r.reading_start).toLocaleString()}</td>
                        <td style={{...s.td, textAlign:"right"}}>{Number(r.reading_end).toLocaleString()}</td>
                        <td style={{...s.td, textAlign:"right", fontVariantNumeric:"tabular-nums"}}>
                          {volMG.toFixed(4)}
                        </td>
                        <td style={{...s.td, textAlign:"right", fontVariantNumeric:"tabular-nums"}}>
                          {(volMG * 133_680.56).toLocaleString(undefined, {maximumFractionDigits:0})}
                        </td>
                        <td style={s.td}>{r.sampling_period_days != null ? `${r.sampling_period_days}d` : "—"}</td>
                        <td style={{...s.td, whiteSpace:"nowrap"}}>
                          {!isSampleEvent && (
                            <>
                              <button style={s.actionEdit}
                                onClick={() => {
                                  setEditingReadingId(r.id);
                                  setEditingReadingForm({
                                    meter_id:             String(r.meter_id),
                                    reading_date:         r.reading_date,
                                    reading_start:        String(r.reading_start),
                                    reading_end:          String(r.reading_end),
                                    sampling_period_days: r.sampling_period_days != null ? String(r.sampling_period_days) : "",
                                  });
                                }}>
                                Edit
                              </button>
                              {" "}
                            </>
                          )}
                          <button style={s.actionDel}
                            onClick={async () => {
                              const label = isSampleEvent
                                ? `Delete sample event reading from ${r.reading_date}? This was auto-created from a sample submission.`
                                : `Delete monthly reading from ${r.reading_date}? This cannot be undone.`;
                              if (!window.confirm(label)) return;
                              await deleteMeterReading(r.id);
                              loadMeters(metersCompanyFilter || undefined);
                              setStatus("Reading deleted.");
                            }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "reports" && (
          <div>
            {/* â"€â"€ Mode toggle â"€â"€ */}
            <div style={{display:"flex", gap:0, marginBottom:16, borderRadius:7, overflow:"hidden",
                         border:"1px solid #cbd5e0", width:"fit-content"}}>
              {(["detail","monthly"] as const).map(mode => (
                <button key={mode} onClick={() => setReportMode(mode)}
                  style={{padding:"7px 22px", fontSize:13, fontWeight:600, border:"none",
                          cursor:"pointer", background: reportMode===mode ? "#2b6cb0" : "#f7fafc",
                          color: reportMode===mode ? "#fff" : "#4a5568"}}>
                  {mode === "detail" ? "Sample Detail" : "Monthly Summary (DMR)"}
                </button>
              ))}
            </div>

            {/* â"€â"€ Monthly Summary (DMR) form â"€â"€ */}
            {reportMode === "monthly" && (
              <div>
                <div style={s.reportForm}>
                  <div style={s.reportFormRow}>
                    <div style={s.reportField}>
                      <label style={s.label}>Company <span style={{color:"#c53030"}}>*</span></label>
                      <select style={s.input} value={dmrParams.company_id}
                        onChange={e => setDmrParams(p => ({...p, company_id: e.target.value}))}>
                        <option value="">Select company…</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div style={s.reportField}>
                      <label style={s.label}>Month <span style={{color:"#c53030"}}>*</span></label>
                      <select style={s.input} value={dmrParams.month}
                        onChange={e => setDmrParams(p => ({...p, month: e.target.value}))}>
                        <option value="">Select…</option>
                        {["January","February","March","April","May","June",
                          "July","August","September","October","November","December"]
                          .map((m,i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
                      </select>
                    </div>
                    <div style={s.reportField}>
                      <label style={s.label}>Year <span style={{color:"#c53030"}}>*</span></label>
                      <input style={s.input} type="number" min="2000" max="2099" placeholder="YYYY"
                        value={dmrParams.year}
                        onChange={e => setDmrParams(p => ({...p, year: e.target.value}))} />
                    </div>
                    <div style={{...s.reportField, justifyContent:"flex-end", flex:"0 0 auto"}}>
                      <button style={s.btn} disabled={dmrLoading || !dmrParams.company_id || !dmrParams.month || !dmrParams.year}
                        onClick={async () => {
                          setDmrLoading(true);
                          setDmrData(null);
                          setDmrDrillParam(null);
                          try {
                            const res = await getMonthlyReport({
                              company_id: dmrParams.company_id,
                              month:      dmrParams.month,
                              year:       dmrParams.year,
                            });
                            setDmrData(res.data);
                          } catch {
                            setStatus("Error: Failed to run monthly report.");
                          } finally {
                            setDmrLoading(false);
                          }
                        }}>
                        {dmrLoading ? "Running…" : "Run Report"}
                      </button>
                    </div>
                  </div>
                </div>

                {dmrData && (() => {
                  const { company_name, permit_number, month_name, year, rows } = dmrData;
                  const periodLabel = `${month_name} ${year}`;
                  const hasExceedance = rows.some((r: any) => r.exceedance_count > 0 || r.avg_conc_exceeds || r.avg_load_exceeds);
                  const flowRows: any[] = rows.filter((r: any) => r.is_flow_limit);
                  const frStatus = flowRows[0]?.flow_report_status ?? null;
                  return (
                    <div style={{marginTop:16}}>
                      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:8, flexWrap:"wrap" as const}}>
                        <div>
                          <span style={{fontSize:15, fontWeight:700, color:"#1a202c"}}>{company_name}</span>
                          {permit_number && <span style={{fontSize:13, color:"#553c9a", fontWeight:600, marginLeft:8}}>· Permit {permit_number}</span>}
                          <span style={{fontSize:13, color:"#718096", marginLeft:8}}>— {periodLabel}</span>
                        </div>
                        <span style={{fontSize:12, fontWeight:700,
                          color: hasExceedance ? "#c53030" : "#276749",
                          background: hasExceedance ? "#fff5f5" : "#f0fff4",
                          padding:"2px 12px", borderRadius:10,
                          border: `1px solid ${hasExceedance ? "#feb2b2" : "#9ae6b4"}`}}>
                          {hasExceedance ? "⚠ Non-Compliant" : "✓ Compliant"}
                        </span>
                        <button style={s.clearBtn} onClick={() => { setDmrData(null); setDmrDrillParam(null); }}>Close</button>
                        <button style={s.exportBtn} onClick={async () => {
                          try {
                            const res = await exportMonthlyReportPDF({
                              company_id: dmrParams.company_id,
                              month:      dmrParams.month,
                              year:       dmrParams.year,
                            });
                            downloadBlob(res.data, `DMR_${company_name}_${month_name}_${year}.pdf`);
                          } catch { setStatus("Error: Failed to export PDF."); }
                        }}>
                          Export PDF
                        </button>
                        <button style={s.printBtn} onClick={() => {
                          const trs = rows.map((r: any) => {
                            const isFL = r.is_flow_limit === true;
                            const fmt2 = (v: number | null) => v != null ? v.toFixed(2) : "—";
                            const fmtMGD = (v: number | null) => v != null ? `${v.toFixed(4)} MGD` : "—";
                            const flowLimit = isFL
                              ? (r.averaging_period === "monthly_avg" ? r.monthly_avg_concentration
                                : r.averaging_period === "daily_max"  ? r.daily_max_concentration
                                : r.averaging_period === "weekly_max" ? r.weekly_max_concentration : null)
                              : null;
                            const limitCell = r.is_monitor_report ? "MR"
                              : isFL
                                ? (r.averaging_period === "daily_max" && r.daily_max_concentration != null ? `${r.daily_max_concentration} MGD max` : "—")
                              : r.is_range_limit ? `${r.min_value ?? "—"}—${r.max_value ?? "—"} ${r.range_unit}`
                              : [r.daily_max_concentration ? `${r.daily_max_concentration} mg/L` : null,
                                 r.daily_max_loading       ? `${r.daily_max_loading} lbs/d`       : null]
                                .filter(Boolean).join(" / ") || "—";
                            const weeklyLimitCell = r.is_monitor_report || r.is_range_limit || isFL ? "—"
                              : [r.weekly_max_concentration ? `${r.weekly_max_concentration} mg/L` : null,
                                 r.weekly_max_loading       ? `${r.weekly_max_loading} lbs/d`       : null]
                                .filter(Boolean).join(" / ") || "—";
                            const avgLimitConcCell = r.is_monitor_report || r.is_range_limit ? "—"
                              : isFL
                                ? (flowLimit != null ? `${flowLimit} MGD` : "—")
                              : r.monthly_avg_concentration ? `${r.monthly_avg_concentration} mg/L` : "—";
                            const avgLimitLoadCell = r.is_monitor_report || r.is_range_limit || isFL ? "—"
                              : r.monthly_avg_loading ? `${r.monthly_avg_loading} lbs/d` : "—";
                            const anyExc = r.exceedance_count > 0 || r.avg_conc_exceeds || r.avg_load_exceeds;
                            const sampledCell = isFL
                              ? (r.sample_count === 1 ? "✓ Report" : r.flow_report_status === "pending" ? "Pending" : "No Report")
                              : String(r.sample_count);
                            return `<tr style="background:${anyExc?"#fff5f5":"#fff"}">
                              <td>${r.parameter_name} (${r.abbreviation})${r.sample_type ? `<br/><small>${r.sample_type}</small>` : ""}</td>
                              <td>${r.frequency ?? "—"}</td>
                              <td>${r.sample_type ?? "—"}</td>
                              <td style="text-align:center">${sampledCell}</td>
                              <td style="text-align:center;color:${r.exceedance_count>0?"#c53030":"inherit"};font-weight:${r.exceedance_count>0?700:400}">${r.is_monitor_report?"N/A":r.exceedance_count}</td>
                              <td>${!isFL && r.min_value!=null ? fmt2(r.min_measured) : "—"}</td>
                              <td style="color:${r.avg_conc_exceeds?"#c53030":"inherit"};font-weight:${r.avg_conc_exceeds?700:400}">${isFL ? fmtMGD(r.avg_measured_conc) : fmt2(r.avg_measured_conc)}</td>
                              <td>${isFL ? "—" : fmt2(r.max_measured)}</td>
                              <td>${limitCell}</td>
                              <td>${weeklyLimitCell}</td>
                              <td style="color:${r.avg_conc_exceeds?"#c53030":"inherit"};font-weight:${r.avg_conc_exceeds?700:400}">${r.is_monitor_report||r.is_range_limit?"—":isFL?fmtMGD(r.avg_measured_conc):fmt2(r.avg_measured_conc)}</td>
                              <td style="color:${r.avg_load_exceeds?"#c53030":"inherit"};font-weight:${r.avg_load_exceeds?700:400}">${r.is_monitor_report||r.is_range_limit||isFL?"—":r.avg_measured_load!=null?Math.round(r.avg_measured_load):"—"}</td>
                              <td>${avgLimitConcCell}</td>
                              <td>${avgLimitLoadCell}</td>
                            </tr>`;
                          }).join("");
                          const win = window.open("", "_blank");
                          if (!win) { alert("Popup blocked — please allow popups for this site and try again."); return; }
                          win.document.write(`<!DOCTYPE html><html><head><title>DMR — ${company_name} — ${periodLabel}</title>
                            <style>
                              body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
                              h2 { font-size: 15px; margin-bottom: 2px; }
                              h3 { font-size: 12px; color:#555; font-weight:normal; margin:0 0 14px; }
                              table { width:100%; border-collapse:collapse; }
                              th { background:#1a365d; color:#fff; padding:6px 8px; text-align:left; font-size:10px; white-space:nowrap; }
                              td { padding:5px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top; font-size:11px; }
                              @media print { button { display:none; } }
                            </style></head><body>
                            <h2>Discharge Monitoring Report</h2>
                            <h3>${company_name}${permit_number ? ` &nbsp;|&nbsp; Permit: ${permit_number}` : ""} &nbsp;|&nbsp; Reporting Period: ${periodLabel} &nbsp;|&nbsp; <span style="color:${hasExceedance?"#c53030":"#276749"};font-weight:bold">${hasExceedance?"⚠ Non-Compliant":"✓ Compliant"}</span></h3>
                            <table><thead><tr>
                              <th>Parameter</th><th>Frequency</th><th>Sample Type</th>
                              <th># Sampled</th><th>No. Exceeds</th>
                              <th>Min</th><th>Avg (mg/L)</th><th>Max (mg/L)</th>
                              <th>Daily Limit</th><th>Weekly Limit</th>
                              <th>Mo. Avg (mg/L)</th><th>Mo. Avg (lbs/d)</th>
                              <th>Mo. Avg Limit (mg/L)</th><th>Mo. Avg Limit (lbs/d)</th>
                            </tr></thead><tbody>${trs}</tbody></table>
                            <script>window.onload=()=>{ window.print(); window.close(); }</script>
                          </body></html>`);
                          win.document.close();
                        }}>Print DMR</button>
                      </div>
                      {/* ── Flow summary strip ── */}
                      {flowRows.length > 0 && (
                        <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" as const,
                                     background:"#ebf8ff", border:"1px solid #90cdf4", borderRadius:8,
                                     padding:"8px 14px", marginBottom:12, fontSize:12}}>
                          <span style={{fontWeight:700, color:"#2b6cb0", marginRight:4}}>Monthly Avg Flow (MGD)</span>
                          {frStatus === "reviewed"
                            ? <span style={{fontSize:11, padding:"2px 8px", borderRadius:10, fontWeight:700,
                                            background:"#f0fff4", color:"#276749", border:"1px solid #9ae6b4"}}>✓ Approved</span>
                            : frStatus === "pending"
                              ? <span style={{fontSize:11, padding:"2px 8px", borderRadius:10, fontWeight:700,
                                              background:"#fffbeb", color:"#744210", border:"1px solid #f6e05e"}}>Pending Review</span>
                              : <span style={{fontSize:11, padding:"2px 8px", borderRadius:10, fontWeight:700,
                                              background:"#f7fafc", color:"#718096", border:"1px solid #cbd5e0"}}>No Report</span>}
                          <span style={{color:"#a0aec0", margin:"0 4px"}}>|</span>
                          {flowRows.map((fr: any, fi: number) => {
                            const measured = fr.avg_measured_conc;
                            const limit    = fr.averaging_period === "monthly_avg" ? fr.monthly_avg_concentration
                                           : fr.averaging_period === "daily_max"  ? fr.daily_max_concentration
                                           : fr.averaging_period === "weekly_max" ? fr.weekly_max_concentration
                                           : null;
                            const exceeds  = measured != null && limit != null && measured > limit;
                            const label    = fr.averaging_period === "monthly_avg" ? "Mo. Avg"
                                           : fr.averaging_period === "daily_max"   ? "Daily Max"
                                           : fr.averaging_period === "weekly_max"  ? "Wkly Max"
                                           : fr.parameter_name;
                            return (
                              <span key={fi} style={{display:"inline-flex", alignItems:"center", gap:4,
                                                     padding:"3px 10px", borderRadius:8, fontWeight:600,
                                                     background: exceeds ? "#fff5f5" : measured != null ? "#f0fff4" : "#f7fafc",
                                                     color:      exceeds ? "#c53030" : measured != null ? "#276749" : "#718096",
                                                     border:`1px solid ${exceeds ? "#fc8181" : measured != null ? "#9ae6b4" : "#e2e8f0"}`}}>
                                <span style={{fontWeight:400, color:"#4a5568"}}>{label}:</span>
                                {measured != null ? `${measured.toFixed(4)} MGD` : "—"}
                                {limit != null && <span style={{color:"#a0aec0", fontSize:10}}>/ {limit} MGD</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div style={{overflowX:"auto"}}>
                        <table style={s.table}>
                          <thead><tr>
                            <th style={s.th}>Parameter</th>
                            <th style={s.th}>Frequency</th>
                            <th style={{...s.th, textAlign:"center" as const}}># Sampled</th>
                            <th style={{...s.th, textAlign:"center" as const}}>No. Exceeds</th>
                            <th style={s.th}>Min</th>
                            <th style={s.th}>Avg<br/>(mg/L)</th>
                            <th style={s.th}>Max<br/>(mg/L)</th>
                            <th style={s.th}>Daily Limit</th>
                            <th style={s.th}>Weekly Limit</th>
                            <th style={s.th}>Mo. Avg<br/>(mg/L)</th>
                            <th style={s.th}>Mo. Avg<br/>(lbs/d)</th>
                            <th style={s.th}>Mo. Avg Limit<br/>(mg/L)</th>
                            <th style={s.th}>Mo. Avg Limit<br/>(lbs/d)</th>
                          </tr></thead>
                          <tbody>
                            {rows.map((r: any, i: number) => {
                              const anyExc = r.exceedance_count > 0 || r.avg_conc_exceeds || r.avg_load_exceeds;
                              const isDrillOpen = dmrDrillParam === r.parameter_name;
                              const isFlowLimit = r.is_flow_limit === true;
                              const flowLimitMGD = isFlowLimit
                                ? (r.averaging_period === "monthly_avg" ? r.monthly_avg_concentration
                                  : r.averaging_period === "daily_max"  ? r.daily_max_concentration
                                  : r.averaging_period === "weekly_max" ? r.weekly_max_concentration
                                  : null)
                                : null;
                              const dailyLimitCell = r.is_monitor_report
                                ? <span style={s.mrBadge}>MR</span>
                                : isFlowLimit
                                  ? (r.averaging_period === "daily_max" && r.daily_max_concentration != null
                                      ? <strong>{r.daily_max_concentration} MGD max</strong> : "—")
                                  : r.is_range_limit
                                    ? <span style={s.rangeBadge}>{r.min_value ?? "—"}—{r.max_value ?? "—"} {r.range_unit}</span>
                                    : [r.daily_max_concentration ? `${r.daily_max_concentration} mg/L` : null,
                                       r.daily_max_loading       ? `${r.daily_max_loading} lbs/d`       : null]
                                      .filter(Boolean).join(" / ") || "—";
                              return (
                                <>
                                  <tr key={i} style={anyExc ? {background:"#fff5f5"} : undefined}>
                                    <td style={{...s.td, fontWeight:600}}>
                                      {r.parameter_name}<br/>
                                      <span style={{fontSize:11,color:"#718096",fontWeight:400}}>
                                        ({r.abbreviation}){r.sample_type ? ` · ${r.sample_type}` : ""}
                                      </span>
                                    </td>
                                    <td style={s.td}>{r.frequency ?? "—"}</td>
                                    <td style={{...s.td, textAlign:"center" as const}}>
                                      {isFlowLimit
                                        ? (r.sample_count === 1
                                            ? <span style={{fontSize:11, color:"#276749", fontWeight:600}}>
                                                {r.flow_report_status === "reviewed" ? "✓ Report" : "Pending"}
                                              </span>
                                            : <span style={{fontSize:11, color: r.flow_report_status === "pending" ? "#744210" : "#718096", fontWeight:600}}>
                                                {r.flow_report_status === "pending" ? "Pending" : "No Report"}
                                              </span>)
                                        : r.sample_count === 0
                                          ? <span style={{color:"#c05621", fontWeight:700}}>0</span>
                                          : r.sample_count}
                                    </td>
                                    <td style={{...s.td, textAlign:"center" as const}}>
                                      {r.is_monitor_report
                                        ? <span style={{color:"#718096"}}>N/A</span>
                                        : r.exceedance_count > 0
                                          ? <button style={s.drillBtn} onClick={() => setDmrDrillParam(isDrillOpen ? null : r.parameter_name)}>
                                              {r.exceedance_count} {isDrillOpen ? "▲" : "▼"}
                                            </button>
                                          : <span style={{color:"#276749"}}>0</span>}
                                    </td>
                                    <td style={s.td}>{!isFlowLimit && r.min_value != null ? (r.min_measured != null ? r.min_measured.toFixed(2) : "—") : "—"}</td>
                                    <td style={{...s.td, fontWeight: r.avg_conc_exceeds ? 700 : 400, color: r.avg_conc_exceeds ? "#c53030" : "inherit"}}>
                                      {isFlowLimit
                                        ? (r.avg_measured_conc != null ? `${r.avg_measured_conc.toFixed(4)} MGD` : "—")
                                        : r.avg_measured_conc != null ? r.avg_measured_conc.toFixed(2) : "—"}
                                    </td>
                                    <td style={s.td}>
                                      {isFlowLimit ? "—"
                                        : r.max_measured != null ? r.max_measured.toFixed(2) : "—"}
                                    </td>
                                    <td style={s.td}>{dailyLimitCell}</td>
                                    <td style={s.td}>
                                      {r.is_monitor_report || r.is_range_limit || isFlowLimit ? "—"
                                        : [r.weekly_max_concentration ? `${r.weekly_max_concentration} mg/L` : null,
                                           r.weekly_max_loading       ? `${r.weekly_max_loading} lbs/d`       : null]
                                          .filter(Boolean).join(" / ") || "—"}
                                    </td>
                                    <td style={{...s.td, fontWeight: r.avg_conc_exceeds ? 700 : 400, color: r.avg_conc_exceeds ? "#c53030" : "inherit"}}>
                                      {r.is_monitor_report || r.is_range_limit ? "—"
                                        : isFlowLimit
                                          ? (r.avg_measured_conc != null ? `${r.avg_measured_conc.toFixed(4)} MGD` : "—")
                                          : r.avg_measured_conc != null ? r.avg_measured_conc.toFixed(2) : "—"}
                                    </td>
                                    <td style={{...s.td, fontWeight: r.avg_load_exceeds ? 700 : 400, color: r.avg_load_exceeds ? "#c53030" : "inherit"}}>
                                      {r.is_monitor_report || r.is_range_limit || isFlowLimit ? "—" : r.avg_measured_load != null ? Math.round(r.avg_measured_load) : "—"}
                                    </td>
                                    <td style={s.td}>
                                      {r.is_monitor_report || r.is_range_limit ? "—"
                                        : isFlowLimit
                                          ? (flowLimitMGD != null
                                              ? <span style={r.avg_conc_exceeds ? {color:"#c53030",fontWeight:700} : {color:"#2b6cb0",fontWeight:700}}>{flowLimitMGD} MGD</span>
                                              : "—")
                                          : r.monthly_avg_concentration ? <span style={r.avg_conc_exceeds ? {color:"#c53030",fontWeight:700} : {}}>{r.monthly_avg_concentration} mg/L</span> : "—"}
                                    </td>
                                    <td style={s.td}>
                                      {r.is_monitor_report || r.is_range_limit || isFlowLimit ? "—"
                                        : r.monthly_avg_loading ? <span style={r.avg_load_exceeds ? {color:"#c53030",fontWeight:700} : {}}>{r.monthly_avg_loading} lbs/d</span> : "—"}
                                    </td>
                                  </tr>
                                  {isDrillOpen && (
                                    <tr key={`drill-${i}`}>
                                      <td colSpan={13} style={{padding:0, background:"#fffaf0", borderBottom:"2px solid #f6ad55"}}>
                                        <div style={{padding:"10px 16px"}}>
                                          <strong style={{fontSize:13, color:"#744210"}}>⚠ Exceedance Detail — {r.parameter_name} ({periodLabel})</strong>
                                          <table style={{width:"100%", borderCollapse:"collapse" as const, marginTop:8, fontSize:12}}>
                                            <thead><tr style={{background:"#fef3c7"}}>
                                              <th style={{...s.th, background:"#f6ad55", color:"#744210", padding:"5px 10px"}}>Sample Date</th>
                                              <th style={{...s.th, background:"#f6ad55", color:"#744210", padding:"5px 10px"}}>Violation Type</th>
                                              <th style={{...s.th, background:"#f6ad55", color:"#744210", padding:"5px 10px"}}>Result (mg/L)</th>
                                              <th style={{...s.th, background:"#f6ad55", color:"#744210", padding:"5px 10px"}}>Loading (lbs/d)</th>
                                              <th style={{...s.th, background:"#f6ad55", color:"#744210", padding:"5px 10px"}}>% Deviation</th>
                                              <th style={{...s.th, background:"#f6ad55", color:"#744210", padding:"5px 10px"}}>Severity</th>
                                            </tr></thead>
                                            <tbody>
                                              {r.exceedance_details.map((d: any, di: number) => (
                                                <tr key={di} style={{background: di%2===0 ? "#fffbeb" : "#fff"}}>
                                                  <td style={{...s.td, padding:"5px 10px"}}>{d.sample_date}</td>
                                                  <td style={{...s.td, padding:"5px 10px", textTransform:"capitalize" as const}}>{d.violation_type.replace(/_/g," ")}</td>
                                                  <td style={{...s.td, padding:"5px 10px"}}>{d.concentration ?? "—"}</td>
                                                  <td style={{...s.td, padding:"5px 10px"}}>{d.loading != null ? d.loading.toFixed(4) : "—"}</td>
                                                  <td style={{...s.td, padding:"5px 10px", color:"#c53030", fontWeight:700}}>{d.exceedance_percent != null ? `${d.exceedance_percent.toFixed(1)}%` : "—"}</td>
                                                  <td style={{...s.td, padding:"5px 10px", textTransform:"capitalize" as const, color: d.severity==="major"?"#c53030":d.severity==="significant"?"#c05621":"#718096"}}>{d.severity}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* â"€â"€ Sample Detail form â"€â"€ */}
            {reportMode === "detail" && <><div style={s.reportForm}>
              <div style={s.reportFormRow}>
                <div style={s.reportField}>
                  <label style={s.label}>Company</label>
                  <select style={s.input} value={reportParams.company_id}
                    onChange={e => setReportParams(p => ({...p, company_id: e.target.value}))}>
                    <option value="">All companies</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={s.reportField}>
                  <label style={s.label}>Parameter</label>
                  <select style={s.input} value={reportParams.parameter_id}
                    onChange={e => setReportParams(p => ({...p, parameter_id: e.target.value}))}>
                    <option value="">All parameters</option>
                    {parameters.map(p => <option key={p.id} value={p.id}>{p.name} ({p.abbreviation})</option>)}
                  </select>
                </div>
                <div style={s.reportField}>
                  <label style={s.label}>Start Date</label>
                  <input style={s.input} type="date" value={reportParams.start_date}
                    onChange={e => setReportParams(p => ({...p, start_date: e.target.value}))} />
                </div>
                <div style={s.reportField}>
                  <label style={s.label}>End Date</label>
                  <input style={s.input} type="date" value={reportParams.end_date}
                    onChange={e => setReportParams(p => ({...p, end_date: e.target.value}))} />
                </div>
                <div style={s.reportField}>
                  <label style={s.label}>Status</label>
                  <select style={s.input} value={reportParams.status}
                    onChange={e => setReportParams(p => ({...p, status: e.target.value}))}>
                    <option value="">All statuses</option>
                    <option value="Pass">Pass</option>
                    <option value="Exceedance">Exceedance</option>
                    <option value="MR">MR (Monitor &amp; Report)</option>
                  </select>
                </div>
                <div style={{...s.reportField, justifyContent:"flex-end", flexShrink:0, flex:"0 0 auto"}}>
                  <button style={s.btn} disabled={reportLoading}
                    onClick={async () => {
                      setReportLoading(true);
                      setReportRan(false);
                      try {
                        const params: any = {};
                        if (reportParams.company_id)   params.company_id   = reportParams.company_id;
                        if (reportParams.parameter_id) params.parameter_id = reportParams.parameter_id;
                        if (reportParams.start_date)   params.start_date   = reportParams.start_date;
                        if (reportParams.end_date)     params.end_date     = reportParams.end_date;
                        const res = await getSampleReport(params);
                        setReportRows(res.data);
                        setReportRan(true);
                      } catch {
                        setStatus("Error: Failed to run report.");
                      } finally {
                        setReportLoading(false);
                      }
                    }}>
                    {reportLoading ? "Running…" : "Run Report"}
                  </button>
                </div>
              </div>
            </div>

            {/* â"€â"€ Results â"€â"€ */}
            {reportRan && (() => {
              const filteredRows = reportParams.status
                ? reportRows.filter((r: any) => {
                    if (reportParams.status === "MR")         return r.is_monitor_report;
                    if (reportParams.status === "Exceedance") return r.status === "Exceedance";
                    if (reportParams.status === "Pass")       return r.status === "Pass" && !r.is_monitor_report;
                    return true;
                  })
                : reportRows;
              return filteredRows.length === 0
                ? <p style={{...s.meta, marginTop:16}}>No results match the selected filters.</p>
                : (
                  <div style={{overflowX:"auto", marginTop:16}}>
                    <div style={{display:"flex", alignItems:"center", gap:16, marginBottom:6}}>
                      <span style={s.reportCount}>
                        {filteredRows.length} result{filteredRows.length !== 1 ? "s" : ""}
                        {reportParams.status ? ` · filtered by "${reportParams.status}"` : ""}
                      </span>
                      <button style={s.clearBtn} onClick={() => { setReportRan(false); setReportRows([]); setReportParams(p => ({...p, status:""})); }}>
                        Close Report
                      </button>
                      <button style={s.exportBtn} onClick={async () => {
                        try {
                          const res = await exportSampleReportExcel({
                            company_id:   reportParams.company_id   || undefined,
                            parameter_id: reportParams.parameter_id || undefined,
                            start_date:   reportParams.start_date   || undefined,
                            end_date:     reportParams.end_date     || undefined,
                          });
                          downloadBlob(res.data, "sample_detail_report.xlsx");
                        } catch { setStatus("Error: Failed to export Excel."); }
                      }}>
                        Export Excel
                      </button>
                      <button style={s.printBtn} onClick={() => {
                        const company   = companies.find(c => String(c.id) === reportParams.company_id)?.name ?? "All Companies";
                        const parameter = parameters.find(p => String(p.id) === reportParams.parameter_id)?.name ?? "All Parameters";
                        const dateRange = [reportParams.start_date, reportParams.end_date].filter(Boolean).join(" to ") || "All Dates";
                        const statusLabel = reportParams.status || "All";
                        const rows = filteredRows.map((r: any) => `
                          <tr style="background:${r.status==="Exceedance"?"#fff5f5":"#fff"}">
                            <td>${r.monitoring_period}</td>
                            <td>${r.company_name}</td>
                            <td>${r.permit_number}</td>
                            <td>${r.sample_date}</td>
                            <td>${r.sampler_name ?? "—"}</td>
                            <td>${r.flow_mgd?.toFixed(2) ?? "—"}</td>
                            <td><strong>${r.parameter_name}</strong></td>
                            <td>${r.concentration ?? "—"}</td>
                            <td>${r.loading?.toFixed(3) ?? "—"}</td>
                            <td>${r.is_monitor_report ? "MR" : r.is_range_limit ? `${r.min_value}—${r.max_value} ${r.range_unit}` : r.limit_conc ? `${r.limit_conc} mg/L` : r.limit_load ? `${r.limit_load} lbs/day` : "—"}</td>
                            <td style="color:${r.status==="Exceedance"?"#c53030":r.is_monitor_report?"#718096":"#276749"};font-weight:600">${r.status}</td>
                          </tr>`).join("");
                        const win = window.open("", "_blank");
                        if (!win) return;
                        win.document.write(`<!DOCTYPE html><html><head><title>Sample Report</title>
                          <style>
                            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
                            h2 { font-size: 14px; margin-bottom: 4px; }
                            p  { font-size: 11px; color: #555; margin: 2px 0 12px; }
                            table { width: 100%; border-collapse: collapse; }
                            th { background: #1a365d; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; white-space: nowrap; }
                            td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                            @media print { button { display: none; } }
                          </style></head><body>
                          <h2>Sample Report</h2>
                          <p>Company: ${company} &nbsp;|&nbsp; Parameter: ${parameter} &nbsp;|&nbsp; Period: ${dateRange} &nbsp;|&nbsp; Status: ${statusLabel} &nbsp;|&nbsp; ${filteredRows.length} records</p>
                          <table>
                            <thead><tr>
                              <th>Monitoring Period</th><th>Company</th><th>Permit</th><th>Sample Date</th>
                              <th>Sampler</th><th>Flow (MGD)</th><th>Parameter</th>
                              <th>Result (mg/L)</th><th>Loading (lbs/day)</th><th>Limit</th><th>Status</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                          </table>
                          <script>window.onload=()=>{ window.print(); window.close(); }</script>
                        </body></html>`);
                        win.document.close();
                      }}>
                        Print Report
                      </button>
                    </div>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Monitoring Period</th>
                          <th style={s.th}>Company</th>
                          <th style={s.th}>Permit</th>
                          <th style={s.th}>Sample Date</th>
                          <th style={s.th}>Sampler</th>
                          <th style={s.th}>Flow (MGD)</th>
                          <th style={s.th}>Parameter</th>
                          <th style={s.th}>Result (mg/L)</th>
                          <th style={s.th}>Loading (lbs/day)</th>
                          <th style={s.th}>Limit</th>
                          <th style={s.th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r: any, i: number) => {
                          const isExceedance = r.status === "Exceedance";
                          const isMR        = r.is_monitor_report;
                          return (
                            <tr key={i} style={isExceedance ? {background:"#fff5f5"} : undefined}>
                              <td style={s.td}>{r.monitoring_period}</td>
                              <td style={s.td}>{r.company_name}</td>
                              <td style={s.td}>{r.permit_number}</td>
                              <td style={s.td}>{r.sample_date}</td>
                              <td style={s.td}>{r.sampler_name ?? "—"}</td>
                              <td style={s.td}>{r.flow_mgd?.toFixed(2) ?? "—"}</td>
                              <td style={{...s.td, fontWeight:600}}>{r.parameter_name}</td>
                              <td style={s.td}>{r.concentration ?? "—"}</td>
                              <td style={s.td}>{r.loading?.toFixed(3) ?? "—"}</td>
                              <td style={s.td}>
                                {isMR
                                  ? <span style={s.mrBadge}>MR</span>
                                  : r.is_range_limit
                                    ? <span style={s.rangeBadge}>{r.min_value}—{r.max_value} {r.range_unit}</span>
                                    : r.limit_conc
                                      ? `${r.limit_conc} mg/L`
                                      : r.limit_load
                                        ? `${r.limit_load} lbs/day`
                                        : "—"}
                              </td>
                              <td style={s.td}>
                                {isMR
                                  ? <span style={s.statusInfo}>MR</span>
                                  : isExceedance
                                    ? <span style={s.statusFail}>Exceedance</span>
                                    : <span style={s.statusPass}>Pass</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
            })()}
            </>}
          </div>
        )}

        {tab === "schedule" && (
          <div>
            <div style={{display:"flex", alignItems:"center", gap:16, marginBottom:16,
              background:"#fff", padding:"12px 16px", borderRadius:8,
              boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
              <label style={s.label}>Filter by Company</label>
              <select style={{...s.input, margin:0, width:160, flex:"0 0 auto"}}
                value={scheduleCompany}
                onChange={e => {
                  setScheduleCompany(e.target.value);
                  getSamplingSchedule(e.target.value ? parseInt(e.target.value) : undefined)
                    .then(r => setScheduleRows(r.data));
                }}>
                <option value="">All companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {(() => {
                const overdue  = scheduleRows.filter(r => r.status === "overdue").length;
                const dueSoon  = scheduleRows.filter(r => r.status === "due_soon").length;
                const never    = scheduleRows.filter(r => r.status === "never").length;
                const current  = scheduleRows.filter(r => r.status === "current").length;
                return (
                  <div style={{display:"flex", gap:8, marginLeft:"auto", flexWrap:"wrap" as const, alignItems:"center"}}>
                    {overdue > 0 && <span style={s.chipOverdue}>{overdue} Overdue</span>}
                    {dueSoon > 0 && <span style={s.chipDueSoon}>{dueSoon} Due Soon</span>}
                    {never   > 0 && <span style={s.chipNever}>{never} Never Sampled</span>}
                    {current > 0 && <span style={s.chipCurrent}>{current} Current</span>}
                  </div>
                );
              })()}
            </div>

            {scheduleRows.length === 0
              ? <p style={s.meta}>No frequency requirements found.</p>
              : <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Company</th>
                    <th style={s.th}>Permit</th>
                    <th style={s.th}>Parameter</th>
                    <th style={s.th}>Frequency</th>
                    <th style={s.th}>Sample Type</th>
                    <th style={s.th}>Last Sampled</th>
                    <th style={s.th}>Next Due</th>
                    <th style={s.th}>Status</th>
                  </tr></thead>
                  <tbody>{scheduleRows.map((r: any, i: number) => (
                    <tr key={i} style={{
                      background: r.status === "overdue"  ? "#fff5f5"
                                : r.status === "due_soon" ? "#fffff0"
                                : undefined
                    }}>
                      <td style={s.td}>{r.company_name}</td>
                      <td style={s.td}>{r.permit_number}</td>
                      <td style={s.td}><strong>{r.parameter_name}</strong></td>
                      <td style={s.td}>{r.frequency_description}</td>
                      <td style={{...s.td, textTransform:"capitalize"}}>{r.sample_type ?? "—"}</td>
                      <td style={s.td}>{r.last_sample_date ?? <em style={{color:"#a0aec0"}}>Never</em>}</td>
                      <td style={s.td}>{r.next_due_date ?? "—"}</td>
                      <td style={s.td}>
                        {r.status === "overdue"  && <span style={s.schedOverdue}>Overdue {r.days_overdue}d</span>}
                        {r.status === "due_soon" && <span style={s.schedDueSoon}>Due Soon</span>}
                        {r.status === "never"    && <span style={s.schedNever}>Never Sampled</span>}
                        {r.status === "current"  && <span style={s.schedCurrent}>Current</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
            }
          </div>
        )}

        {tab === "users" && (
          <div style={s.twoCol}>
            <div>
              <h2 style={s.sectionTitle}>Users</h2>
              <p style={{...s.meta, marginBottom:10}}>Double-click a user to edit</p>
              {users.map(u => (
                <div key={u.id}
                  style={{...s.listItem, cursor:"pointer",
                    ...(editingUserId === u.id ? s.selectedItem : {})}}
                  title="Double-click to edit"
                  onDoubleClick={() => {
                    setEditingUserId(u.id);
                    setShowUserForm(true);
                    setNewUser({ username: u.username, email: u.email,
                                 password: "", role: u.role,
                                 company_id: u.company_id ? String(u.company_id) : "" });
                  }}>
                  <strong>{u.username}</strong>
                  <span style={s.meta}>{u.email} · <em>{u.role}</em>
                    {u.company_id
                      ? ` · ${companies.find(c => c.id === u.company_id)?.name ?? `Company #${u.company_id}`}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>

            {showUserForm && <form onSubmit={handleAddUser} style={s.formCard}>
              <h3 style={s.formTitle}>{editingUserId ? "Edit User" : "Add User"}</h3>

              <label style={s.label}>Username</label>
              <input style={s.input} value={newUser.username}
                onChange={e => setNewUser(p => ({...p, username: e.target.value}))} required />

              <label style={s.label}>Email</label>
              <input style={s.input} type="email" value={newUser.email}
                onChange={e => setNewUser(p => ({...p, email: e.target.value}))} required />

              <label style={s.label}>
                Password{editingUserId && <span style={s.meta}> — leave blank to keep current</span>}
              </label>
              <input style={s.input} type="password" value={newUser.password}
                onChange={e => setNewUser(p => ({...p, password: e.target.value}))}
                required={!editingUserId} />

              <label style={s.label}>Role</label>
              <select style={s.input} value={newUser.role}
                onChange={e => setNewUser(p => ({...p, role: e.target.value}))}>
                <option value="iu">Industrial User (IU)</option>
                <option value="coordinator">Coordinator</option>
                <option value="finance">Finance</option>
                <option value="admin">Admin</option>
              </select>

              <label style={s.label}>Company (IU only)</label>
              <select style={s.input} value={newUser.company_id}
                onChange={e => setNewUser(p => ({...p, company_id: e.target.value}))}>
                <option value="">None</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <div style={s.btnRow}>
                <button style={s.btn} type="submit">
                  {editingUserId ? "Save Changes" : "Add User"}
                </button>
                <button style={s.clearBtn} type="button"
                  onClick={() => {
                    setEditingUserId(null);
                    setShowUserForm(false);
                    setNewUser({ username:"", email:"", password:"", role:"iu", company_id:"" });
                    setStatus("");
                  }}>
                  Cancel
                </button>
              </div>
            </form>}

            {!showUserForm && (
              <div style={{alignSelf:"start"}}>
                <button style={s.btn} type="button"
                  onClick={() => { setEditingUserId(null); setShowUserForm(true); setStatus(""); }}>
                  + Add New User
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "compliance" && (
          <div>
            <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
              <h2 style={{...s.sectionTitle, margin:0}}>Compliance Summary</h2>
              <button style={s.outlineBtn} onClick={() => {
                setComplianceLoading(true);
                setRecalcMsg(null);
                getComplianceSummary().then(r => { setComplianceSummary(r.data); setComplianceLoading(false); });
              }}>Refresh</button>
              <button
                disabled={recalculating}
                style={{...s.outlineBtn, borderColor:"#c53030", color: recalculating ? "#a0aec0" : "#c53030",
                  background: recalculating ? "#fff5f5" : "#fff"}}
                onClick={async () => {
                  if (!window.confirm(
                    "This will clear all existing sample violations and recalculate from current results.\n\n" +
                    "Flow report violations are not affected.\n\nContinue?"
                  )) return;
                  setRecalculating(true);
                  setRecalcMsg(null);
                  try {
                    const r = await recalculateCompliance();
                    const d = r.data;
                    setRecalcMsg(
                      `Recalculated ${d.samples_processed} samples — ` +
                      `cleared ${d.violations_cleared} stale violations, ` +
                      `created ${d.violations_created} current violations` +
                      (d.errors > 0 ? ` (${d.errors} samples skipped due to errors)` : "") + "."
                    );
                    // Refresh the summary after recalculation
                    const sr = await getComplianceSummary();
                    setComplianceSummary(sr.data);
                  } catch {
                    setRecalcMsg("Recalculation failed — check server logs.");
                  } finally {
                    setRecalculating(false);
                  }
                }}>
                {recalculating ? "Recalculating…" : "Recalculate All"}
              </button>
              {recalcMsg && (
                <span style={{fontSize:12, color: recalcMsg.includes("failed") ? "#c53030" : "#276749",
                  background: recalcMsg.includes("failed") ? "#fff5f5" : "#f0fff4",
                  border: `1px solid ${recalcMsg.includes("failed") ? "#feb2b2" : "#9ae6b4"}`,
                  borderRadius:5, padding:"3px 10px"}}>
                  {recalcMsg}
                </span>
              )}
            </div>
            {complianceLoading
              ? <p style={s.meta}>Loading…</p>
              : complianceSummary.length === 0
              ? <p style={s.meta}>No active companies found.</p>
              : (
                <div style={{overflowX:"auto"}}>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={s.th}>Company</th>
                      <th style={s.th}>Permit</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>YTD Violations</th>
                      <th style={s.th}>Severity</th>
                      <th style={s.th}>Trend (60d)</th>
                      <th style={s.th}>Open Actions</th>
                      <th style={s.th}>Last Violation</th>
                    </tr></thead>
                    <tbody>
                      {complianceSummary.map((row: any) => {
                        const trendIcon = row.trend === "improving"  ? "▼" :
                                          row.trend === "worsening"  ? "▲" : "—";
                        const trendColor = row.trend === "improving" ? "#276749" :
                                           row.trend === "worsening" ? "#c53030" : "#718096";
                        const isExpanded = expandedCompany === row.company_id;
                        const hasDetails = (row.ytd_details?.length ?? 0) > 0;
                        const SEV_STYLE: Record<string, React.CSSProperties> = {
                          major:       {background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2"},
                          significant: {background:"#fffbeb", color:"#975a16", border:"1px solid #f6ad55"},
                          minor:       {background:"#ebf8ff", color:"#2b6cb0", border:"1px solid #bee3f8"},
                        };
                        const TYPE_LABEL: Record<string, string> = {
                          max_exceeds:        "Daily Max Exceeded",
                          avg_exceeds:        "Monthly Avg Exceeded",
                          weekly_avg_exceeds: "Weekly Avg Exceeded",
                          below_min:          "Below Minimum",
                          above_max:          "Above Maximum",
                          flow_exceeds:       "Flow Limit Exceeded",
                          missing_sample:     "Missing Sample",
                        };
                        return (
                          <React.Fragment key={row.company_id}>
                            <tr
                              title={hasDetails ? "Click to expand violations" : row.is_compliant ? undefined : "Double-click to open sample review"}
                              style={{cursor: hasDetails || !row.is_compliant ? "pointer" : "default",
                                      background: isExpanded ? "#fef9f0" : undefined}}
                              onClick={() => hasDetails && setExpandedCompany(isExpanded ? null : row.company_id)}
                              onDoubleClick={() => {
                                if (row.is_compliant) return;
                                setTab("review");
                                setReviewSubMode("samples");
                                setReviewFilterCompany(String(row.company_id));
                                setReviewFilterStatus("all");
                                setSelectedSample(null);
                                setSampleFlowReport(null);
                                loadReviewQueue();
                              }}>
                              <td style={s.td}>
                                <span style={{marginRight:6, fontSize:11, color:"#718096"}}>
                                  {hasDetails ? (isExpanded ? "▼" : "▶") : " "}
                                </span>
                                <strong>{row.company_name}</strong>
                              </td>
                              <td style={s.td}>{row.permit_number ?? "—"}</td>
                              <td style={s.td}>
                                <span style={{
                                  padding:"2px 10px", borderRadius:12, fontSize:12, fontWeight:700,
                                  background: row.is_compliant ? "#f0fff4" : "#fff5f5",
                                  color:      row.is_compliant ? "#276749" : "#c53030",
                                  border:     `1px solid ${row.is_compliant ? "#9ae6b4" : "#feb2b2"}`,
                                }}>
                                  {row.is_compliant ? "Compliant" : "Non-Compliant"}
                                </span>
                              </td>
                              <td style={{...s.td, textAlign:"center" as const}}>
                                <span style={{fontWeight:700, color: row.ytd_violations > 0 ? "#c53030" : "#276749"}}>
                                  {row.ytd_violations}
                                </span>
                              </td>
                              <td style={s.td}>
                                <div style={{display:"flex", gap:4, flexWrap:"wrap" as const}}>
                                  {row.by_severity.major > 0 && (
                                    <span style={{...s.sevChip, background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2"}}>
                                      {row.by_severity.major} Major
                                    </span>
                                  )}
                                  {row.by_severity.significant > 0 && (
                                    <span style={{...s.sevChip, background:"#fffbeb", color:"#975a16", border:"1px solid #f6ad55"}}>
                                      {row.by_severity.significant} Sig.
                                    </span>
                                  )}
                                  {row.by_severity.minor > 0 && (
                                    <span style={{...s.sevChip, background:"#ebf8ff", color:"#2b6cb0", border:"1px solid #bee3f8"}}>
                                      {row.by_severity.minor} Minor
                                    </span>
                                  )}
                                  {row.ytd_violations === 0 && <span style={{color:"#718096", fontSize:12}}>None</span>}
                                </div>
                              </td>
                              <td style={{...s.td, textAlign:"center" as const}}>
                                <span style={{fontWeight:700, color:trendColor, fontSize:15}}>{trendIcon}</span>
                                {" "}
                                <span style={{fontSize:12, color:trendColor}}>
                                  {row.recent_count}v / {row.prior_count}v
                                </span>
                              </td>
                              <td style={{...s.td, textAlign:"center" as const}}>
                                {row.open_enforcement > 0
                                  ? <span style={{fontWeight:700, color:"#c05621"}}>{row.open_enforcement} open</span>
                                  : <span style={{color:"#718096"}}>—</span>}
                                {row.closed_enforcement > 0 && (
                                  <span style={{fontSize:11, color:"#718096", marginLeft:4}}>
                                    ({row.closed_enforcement} closed)
                                  </span>
                                )}
                              </td>
                              <td style={{...s.td, fontSize:12, color:"#718096"}}>
                                {row.last_violation_date ?? "None"}
                              </td>
                            </tr>

                            {/* Expanded violation detail rows */}
                            {isExpanded && hasDetails && (
                              <tr key={`${row.company_id}-detail`}>
                                <td colSpan={8} style={{padding:0, background:"#fffbeb",
                                  borderBottom:"2px solid #f6ad55"}}>
                                  <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
                                    <thead>
                                      <tr style={{background:"#fef3c7"}}>
                                        <th style={{...s.th, fontSize:11, width:110}}>Date</th>
                                        <th style={{...s.th, fontSize:11}}>Parameter</th>
                                        <th style={{...s.th, fontSize:11}}>Violation Type</th>
                                        <th style={{...s.th, fontSize:11}}>Severity</th>
                                        <th style={{...s.th, fontSize:11, width:120}}>Exceedance</th>
                                        <th style={{...s.th, fontSize:11, width:140}}>Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(row.ytd_details as any[]).map((d: any, di: number) => (
                                        <tr key={di} style={{
                                          background: d.in_grace_period
                                            ? "#f0fff4"
                                            : di % 2 === 0 ? "#fffdf5" : "#fffbeb",
                                          opacity: d.in_grace_period ? 0.75 : 1,
                                        }}>
                                          <td style={{...s.td, fontSize:12}}>{d.violation_date}</td>
                                          <td style={{...s.td, fontSize:12, fontWeight:600}}>{d.parameter_name}</td>
                                          <td style={{...s.td, fontSize:12}}>
                                            {TYPE_LABEL[d.violation_type] ?? d.violation_type}
                                          </td>
                                          <td style={{...s.td, fontSize:12}}>
                                            <span style={{...s.sevChip, ...(SEV_STYLE[d.severity] ?? {})}}>
                                              {d.severity}
                                            </span>
                                          </td>
                                          <td style={{...s.td, fontSize:12, fontWeight:600,
                                            color: d.exceedance_percent != null ? "#c53030" : "#718096"}}>
                                            {d.exceedance_percent != null
                                              ? `+${d.exceedance_percent.toFixed(1)}%`
                                              : "—"}
                                          </td>
                                          <td style={{...s.td, fontSize:11, color:"#718096", fontStyle:"italic"}}>
                                            {d.in_grace_period ? "Within grace period" : ""}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }

            {/* ── SNC REPORT ─────────────────────────────────────────────── */}
            <div style={{marginTop:32, borderTop:"2px solid #e2e8f0", paddingTop:24}}>
              <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
                <h3 style={{margin:0, fontSize:16, fontWeight:700, color:"#1a365d"}}>
                  Significant Non-Compliance (SNC) Report
                </h3>
                <select
                  style={{padding:"5px 8px", border:"1px solid #cbd5e0", borderRadius:5, fontSize:13}}
                  value={sncCompany}
                  onChange={e => {
                    const v = e.target.value === "" ? "" : Number(e.target.value);
                    setSncCompany(v as number | "");
                    loadAdminSnc(sncYear, sncHalf, v as number | "");
                  }}>
                  <option value="">All Companies</option>
                  {complianceSummary.map((c: any) => (
                    <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
                  ))}
                </select>
                <select
                  style={{padding:"5px 8px", border:"1px solid #cbd5e0", borderRadius:5, fontSize:13}}
                  value={sncYear}
                  onChange={e => { const y = Number(e.target.value); setSncYear(y); loadAdminSnc(y, sncHalf, sncCompany); }}>
                  {Array.from({length:4},(_,i)=>new Date().getFullYear()-i).map(y=>(
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  style={{padding:"5px 8px", border:"1px solid #cbd5e0", borderRadius:5, fontSize:13}}
                  value={sncHalf}
                  onChange={e => { const h = Number(e.target.value); setSncHalf(h); loadAdminSnc(sncYear, h, sncCompany); }}>
                  <option value={1}>H1 (Jan–Jun)</option>
                  <option value={2}>H2 (Jul–Dec)</option>
                </select>
                <button style={s.outlineBtn}
                  onClick={() => loadAdminSnc(sncYear, sncHalf, sncCompany)}>
                  Run Report
                </button>
              </div>

              {sncLoading && (
                <p style={{color:"#718096", padding:"12px 0"}}>Calculating SNC…</p>
              )}

              {!sncLoading && sncResults.length === 0 && (
                <p style={{color:"#a0aec0", fontSize:13}}>
                  Select a period and click Run Report to generate the SNC determination.
                </p>
              )}

              {!sncLoading && sncResults.length > 0 && (
                <div>
                  {/* Summary row per company */}
                  <div style={{display:"flex", flexWrap:"wrap", gap:10, marginBottom:20}}>
                    {sncResults.map((co: any) => (
                      <div key={co.company_id} style={{
                        borderRadius:6, padding:"10px 16px", fontSize:13,
                        background: co.facility_in_snc ? "#fff5f5" : "#f0fff4",
                        border: `1px solid ${co.facility_in_snc ? "#fc8181" : "#68d391"}`,
                        minWidth:180,
                      }}>
                        <div style={{fontWeight:700, color:"#1a365d", marginBottom:3}}>{co.company_name}</div>
                        <div style={{fontSize:11, color:"#718096", marginBottom:5}}>{co.permit_number}</div>
                        <span style={{fontWeight:700, fontSize:12,
                          color: co.facility_in_snc ? "#c53030" : "#276749"}}>
                          {co.facility_in_snc ? "⚠ IN SNC" : "✓ Compliant"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Detail table per company */}
                  {sncResults.map((co: any) => (
                    <div key={co.company_id} style={{marginBottom:28}}>
                      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
                        <strong style={{fontSize:14, color:"#1a365d"}}>{co.company_name}</strong>
                        <span style={{fontSize:12, color:"#718096"}}>{co.permit_number}</span>
                        <span style={{fontSize:12, color:"#718096"}}>
                          {co.period_start} – {co.period_end}
                        </span>
                        <span style={{fontWeight:700, fontSize:12, padding:"2px 8px", borderRadius:10,
                          background: co.facility_in_snc ? "#fff5f5" : "#f0fff4",
                          color: co.facility_in_snc ? "#c53030" : "#276749",
                          border: `1px solid ${co.facility_in_snc ? "#fc8181" : "#9ae6b4"}`}}>
                          {co.facility_in_snc ? "IN SNC" : "Compliant"}
                        </span>
                      </div>
                      {co.parameters.length === 0 ? (
                        <p style={{color:"#a0aec0", fontSize:12}}>No permit limits found for this period.</p>
                      ) : (
                        <div style={{overflowX:"auto"}}>
                          <table style={{...s.table, fontSize:12}}>
                            <thead>
                              <tr>
                                <th style={s.th}>Parameter</th>
                                <th style={{...s.th, textAlign:"center" as const}}>Req.</th>
                                <th style={{...s.th, textAlign:"center" as const}}>Violations</th>
                                <th style={{...s.th, textAlign:"center" as const}}>Freq %</th>
                                <th style={{...s.th, textAlign:"center" as const}}>Freq SNC</th>
                                <th style={{...s.th, textAlign:"center" as const}}>TRC Factor</th>
                                <th style={{...s.th, textAlign:"center" as const}}>Max Ratio</th>
                                <th style={{...s.th, textAlign:"center" as const}}>TRC Count</th>
                                <th style={{...s.th, textAlign:"center" as const}}>TRC %</th>
                                <th style={{...s.th, textAlign:"center" as const}}>TRC SNC</th>
                                <th style={{...s.th, textAlign:"center" as const}}>In SNC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {co.parameters.map((p: any) => {
                                const rowBg = p.in_snc ? "#fff5f5" : undefined;
                                const tdC = {...s.td, textAlign:"center" as const, background:rowBg};
                                const tdL = {...s.td, background:rowBg};
                                return (
                                  <tr key={p.permit_limit_id}>
                                    <td style={tdL}>
                                      <strong>{p.parameter_name}</strong>
                                      {p.is_ph && <span style={{fontSize:10,color:"#c05621",marginLeft:4}}>(pH)</span>}
                                    </td>
                                    <td style={tdC}>{p.required_samples}</td>
                                    <td style={tdC}>{p.violation_count}</td>
                                    <td style={{...tdC, fontWeight:600,
                                      color: p.violation_frequency_pct > 66 ? "#c53030" : "#2d3748"}}>
                                      {p.violation_frequency_pct.toFixed(1)}%
                                    </td>
                                    <td style={tdC}>
                                      {p.frequency_snc
                                        ? <span style={{fontWeight:700, color:"#c53030"}}>YES</span>
                                        : <span style={{color:"#276749"}}>No</span>}
                                    </td>
                                    <td style={tdC}>{p.is_ph ? "—" : `${p.trc_factor}×`}</td>
                                    <td style={tdC}>{p.max_ratio != null ? p.max_ratio.toFixed(2) : "—"}</td>
                                    <td style={tdC}>{p.trc_exceedance_count}</td>
                                    <td style={{...tdC, fontWeight:600,
                                      color: p.trc_frequency_pct > 33 ? "#c53030" : "#2d3748"}}>
                                      {p.is_ph
                                        ? <span style={{fontSize:10,color:"#718096"}}>special</span>
                                        : `${p.trc_frequency_pct.toFixed(1)}%`}
                                    </td>
                                    <td style={tdC}>
                                      {p.trc_snc
                                        ? <span style={{fontWeight:700, color:"#c53030"}}>YES</span>
                                        : <span style={{color:"#276749"}}>No</span>}
                                    </td>
                                    <td style={tdC}>
                                      {p.in_snc
                                        ? <span style={{fontWeight:700, color:"#c53030"}}>⚠ SNC</span>
                                        : <span style={{fontWeight:600, color:"#276749"}}>✓</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}

                  <div style={{fontSize:11, color:"#a0aec0", marginTop:4}}>
                    Req. = required samples per permit frequency in period &nbsp;|&nbsp;
                    TRC: 1.4× for BOD, TSS, FOG; 1.2× for all others &nbsp;|&nbsp;
                    Freq SNC threshold: &gt;66% &nbsp;|&nbsp; TRC SNC threshold: &gt;33%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "enforcement" && (
          <>
          <div>
            <h2 style={s.sectionTitle}>Pending Enforcement Actions</h2>
            {enfLoading ? <p>Loading…</p> : enfActions.length === 0 ? (
              <p style={{color:"#718096"}}>No pending enforcement actions.</p>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Company</th>
                    <th style={s.th}>Violation Date</th>
                    <th style={s.th}>Parameter</th>
                    <th style={s.th}>Violation Type</th>
                    <th style={s.th}>Response Level</th>
                    <th style={{...s.th, textAlign:"right"}}>Fine</th>
                    <th style={s.th}>Notes</th>
                    <th style={s.th}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {enfActions.map((a: any) => (
                      <React.Fragment key={a.id}>
                        <tr style={{borderBottom:"1px solid #e2e8f0"}}>
                          <td style={s.td}>{a.company_name ?? a.company_id}</td>
                          <td style={s.td}>{a.violation_date ?? "—"}</td>
                          <td style={s.td}>{a.parameter_name ?? "—"}</td>
                          <td style={s.td}>{a.violation_type ?? "—"}</td>
                          <td style={s.td}>
                            <span style={{fontWeight:600, color:
                              a.response_level === "NOV" ? "#c53030" :
                              a.response_level === "Warning" ? "#b7791f" : "#2b6cb0"}}>
                              {a.response_level}
                            </span>
                          </td>
                          <td style={{...s.td, textAlign:"right"}}>
                            {a.fine_amount != null ? `$${Number(a.fine_amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}
                          </td>
                          <td style={{...s.td, maxWidth:200, whiteSpace:"pre-wrap", wordBreak:"break-word"}}>
                            {a.coordinator_notes || "—"}
                          </td>
                          <td style={{...s.td, whiteSpace:"nowrap"}}>
                            <button style={{...s.actionEdit, marginRight:4}}
                              onClick={() => {
                                setEnfApproveId(a.id);
                                setEnfApproveSig("");
                                setEnfApproveNotes("");
                                setEnfOverrideId(null);
                              }}>
                              Approve
                            </button>
                            <button style={s.actionCancel}
                              onClick={() => {
                                setEnfOverrideId(a.id);
                                setEnfOverrideLevel(a.response_level ?? "");
                                setEnfOverrideFine(a.fine_amount ?? "");
                                setEnfOverrideNotes(a.coordinator_notes ?? "");
                                setEnfApproveId(null);
                              }}>
                              Override
                            </button>
                          </td>
                        </tr>

                        {/* Approve panel */}
                        {enfApproveId === a.id && (
                          <tr><td colSpan={8} style={{background:"#f0fff4", padding:"12px 16px"}}>
                            <div style={{display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap"}}>
                              <div>
                                <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>
                                  E-Signature (your name)
                                </label>
                                <input style={{...s.input, marginBottom:0, width:200}}
                                  placeholder="Type your full name"
                                  value={enfApproveSig}
                                  onChange={e => setEnfApproveSig(e.target.value)} />
                              </div>
                              <div>
                                <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>
                                  Notes (optional)
                                </label>
                                <input style={{...s.input, marginBottom:0, width:260}}
                                  placeholder="Coordinator notes"
                                  value={enfApproveNotes}
                                  onChange={e => setEnfApproveNotes(e.target.value)} />
                              </div>
                              <button style={{...s.btn, background:"#276749"}}
                                disabled={!enfApproveSig.trim() || enfSaving}
                                onClick={async () => {
                                  setEnfSaving(true);
                                  try {
                                    await approveEnforcement(a.id, { e_signature: enfApproveSig, notes: enfApproveNotes });
                                    setEnfApproveId(null);
                                    const r = await getPendingEnforcement();
                                    setEnfActions(r.data);
                                  } finally { setEnfSaving(false); }
                                }}>
                                {enfSaving ? "Saving…" : "Confirm Approve"}
                              </button>
                              <button style={s.clearBtn} onClick={() => setEnfApproveId(null)}>Cancel</button>
                            </div>
                          </td></tr>
                        )}

                        {/* Override panel */}
                        {enfOverrideId === a.id && (
                          <tr><td colSpan={8} style={{background:"#fffbeb", padding:"12px 16px"}}>
                            <div style={{display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap"}}>
                              <div>
                                <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>
                                  Response Level
                                </label>
                                <select style={{...s.input, marginBottom:0, width:160}}
                                  value={enfOverrideLevel}
                                  onChange={e => setEnfOverrideLevel(e.target.value)}>
                                  <option value="Informal Notice">Informal Notice</option>
                                  <option value="Warning">Warning</option>
                                  <option value="NOV">NOV</option>
                                  <option value="Compliance Order">Compliance Order</option>
                                  <option value="Show Cause">Show Cause</option>
                                  <option value="Penalty">Penalty</option>
                                </select>
                              </div>
                              <div>
                                <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>
                                  Fine Amount ($)
                                </label>
                                <input type="number" step="0.01" min="0"
                                  style={{...s.input, marginBottom:0, width:120}}
                                  placeholder="0.00"
                                  value={enfOverrideFine}
                                  onChange={e => setEnfOverrideFine(e.target.value)} />
                              </div>
                              <div>
                                <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>
                                  Notes
                                </label>
                                <input style={{...s.input, marginBottom:0, width:260}}
                                  placeholder="Reason for override"
                                  value={enfOverrideNotes}
                                  onChange={e => setEnfOverrideNotes(e.target.value)} />
                              </div>
                              <button style={{...s.btn, background:"#b7791f"}}
                                disabled={enfSaving}
                                onClick={async () => {
                                  setEnfSaving(true);
                                  try {
                                    await overrideEnforcement(a.id, {
                                      response_level: enfOverrideLevel,
                                      fine_amount: enfOverrideFine !== "" ? parseFloat(enfOverrideFine) : null,
                                      notes: enfOverrideNotes,
                                    });
                                    setEnfOverrideId(null);
                                    const r = await getPendingEnforcement();
                                    setEnfActions(r.data);
                                  } finally { setEnfSaving(false); }
                                }}>
                                {enfSaving ? "Saving…" : "Save Override"}
                              </button>
                              <button style={s.clearBtn} onClick={() => setEnfOverrideId(null)}>Cancel</button>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── ERG Configuration ─────────────────────────────────────────── */}
          <div style={{marginTop:32}}>
            <div style={{display:"flex", alignItems:"center", gap:16, marginBottom:16}}>
              <h2 style={s.sectionTitle}>Enforcement Response Guide — Configuration</h2>
              <button style={{...s.clearBtn, fontSize:12}}
                onClick={async () => {
                  if (!window.confirm("Reset the entire ERG matrix to built-in defaults? This cannot be undone.")) return;
                  const r = await resetERGMatrix();
                  setErgMatrix(r.data);
                  setErgEditing(null);
                }}>
                Reset to Defaults
              </button>
            </div>

            {ergLoading ? <p>Loading…</p> : (
              <>
                {/* Decision Matrix */}
                <h3 style={{fontSize:14, fontWeight:700, color:"#2d3748", marginBottom:8}}>
                  Decision Matrix
                </h3>
                <p style={{fontSize:12, color:"#718096", marginBottom:12}}>
                  Maps each violation scenario (category × recurring × harm) to a response level and base fine.
                  Major-severity violations are automatically escalated one level with the fine doubled.
                </p>
                <div style={{overflowX:"auto", marginBottom:28}}>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={s.th}>Category</th>
                      <th style={s.th}>Recurring?</th>
                      <th style={s.th}>Potential Harm?</th>
                      <th style={s.th}>Response Level</th>
                      <th style={{...s.th, textAlign:"right"}}>Base Fine</th>
                      <th style={s.th}>Actions</th>
                    </tr></thead>
                    <tbody>
                      {(() => {
                        const CATEGORY_LABELS: Record<string,string> = {
                          discharge_limit: "Discharge Limit",
                          reporting:       "Reporting",
                          monitoring:      "Monitoring",
                          schedule_miss:   "Schedule Miss",
                        };
                        const LEVEL_COLORS: Record<string,string> = {
                          phone_call: "#2b6cb0", warning: "#b7791f",
                          nov: "#c05621", ao: "#c53030",
                          civil: "#702459", criminal: "#44337a", termination: "#1a202c",
                        };
                        return ergMatrix.map((row: any) => (
                          <React.Fragment key={row.id}>
                            <tr style={{borderBottom:"1px solid #e2e8f0"}}>
                              <td style={s.td}>{CATEGORY_LABELS[row.violation_category] ?? row.violation_category}</td>
                              <td style={s.td}>{row.is_recurring ? "✓ Yes" : "No"}</td>
                              <td style={s.td}>{row.has_harm    ? "✓ Yes" : "No"}</td>
                              <td style={s.td}>
                                <span style={{fontWeight:700, color: LEVEL_COLORS[row.response_level] ?? "#2d3748"}}>
                                  {row.response_level.replace("_"," ").toUpperCase()}
                                </span>
                              </td>
                              <td style={{...s.td, textAlign:"right"}}>
                                {row.fine_amount > 0 ? `$${Number(row.fine_amount).toLocaleString()}` : "—"}
                              </td>
                              <td style={s.td}>
                                <button style={s.actionEdit}
                                  onClick={() => { setErgEditing(row.id); setErgEditLevel(row.response_level); setErgEditFine(String(row.fine_amount)); }}>
                                  Edit
                                </button>
                              </td>
                            </tr>
                            {ergEditing === row.id && (
                              <tr><td colSpan={6} style={{background:"#ebf8ff", padding:"10px 14px"}}>
                                <div style={{display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap"}}>
                                  <div>
                                    <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>Response Level</label>
                                    <select style={{...s.input, marginBottom:0, width:180}}
                                      value={ergEditLevel} onChange={e => setErgEditLevel(e.target.value)}>
                                      {["phone_call","warning","nov","ao","civil","criminal","termination"].map(l => (
                                        <option key={l} value={l}>{l.replace("_"," ").toUpperCase()}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>Base Fine ($)</label>
                                    <input type="number" min="0" step="50"
                                      style={{...s.input, marginBottom:0, width:120}}
                                      value={ergEditFine} onChange={e => setErgEditFine(e.target.value)} />
                                  </div>
                                  <button style={{...s.btn, width:"auto", marginTop:0, padding:"7px 16px"}}
                                    disabled={ergSaving}
                                    onClick={async () => {
                                      setErgSaving(true);
                                      try {
                                        await updateERGMatrixEntry(row.id, { response_level: ergEditLevel, fine_amount: parseFloat(ergEditFine) || 0 });
                                        const r = await getERGMatrix();
                                        setErgMatrix(r.data);
                                        setErgEditing(null);
                                      } finally { setErgSaving(false); }
                                    }}>
                                    {ergSaving ? "Saving…" : "Save"}
                                  </button>
                                  <button style={s.actionCancel} onClick={() => setErgEditing(null)}>Cancel</button>
                                </div>
                              </td></tr>
                            )}
                          </React.Fragment>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Fine Schedule */}
                <h3 style={{fontSize:14, fontWeight:700, color:"#2d3748", marginBottom:8}}>
                  Fine Schedule (Min / Max per Level)
                </h3>
                <p style={{fontSize:12, color:"#718096", marginBottom:12}}>
                  Sets the allowed fine range per response level. Used to cap escalated fines.
                </p>
                <div style={{overflowX:"auto"}}>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={s.th}>Response Level</th>
                      <th style={{...s.th, textAlign:"right"}}>Min Fine</th>
                      <th style={{...s.th, textAlign:"right"}}>Max Fine</th>
                      <th style={s.th}>Actions</th>
                    </tr></thead>
                    <tbody>
                      {ergSchedule.map((row: any) => (
                        <React.Fragment key={row.id}>
                          <tr style={{borderBottom:"1px solid #e2e8f0"}}>
                            <td style={{...s.td, fontWeight:600}}>
                              {row.response_level.replace("_"," ").toUpperCase()}
                            </td>
                            <td style={{...s.td, textAlign:"right"}}>
                              {row.fine_min > 0 ? `$${Number(row.fine_min).toLocaleString()}` : "—"}
                            </td>
                            <td style={{...s.td, textAlign:"right"}}>
                              {row.fine_max > 0 ? `$${Number(row.fine_max).toLocaleString()}` : "—"}
                            </td>
                            <td style={s.td}>
                              <button style={s.actionEdit}
                                onClick={() => { setErgSchedEditing(row.id); setErgSchedMin(String(row.fine_min)); setErgSchedMax(String(row.fine_max)); }}>
                                Edit
                              </button>
                            </td>
                          </tr>
                          {ergSchedEditing === row.id && (
                            <tr><td colSpan={4} style={{background:"#fffbeb", padding:"10px 14px"}}>
                              <div style={{display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap"}}>
                                <div>
                                  <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>Min Fine ($)</label>
                                  <input type="number" min="0" step="50"
                                    style={{...s.input, marginBottom:0, width:120}}
                                    value={ergSchedMin} onChange={e => setErgSchedMin(e.target.value)} />
                                </div>
                                <div>
                                  <label style={{fontSize:12, fontWeight:600, display:"block", marginBottom:4}}>Max Fine ($)</label>
                                  <input type="number" min="0" step="50"
                                    style={{...s.input, marginBottom:0, width:120}}
                                    value={ergSchedMax} onChange={e => setErgSchedMax(e.target.value)} />
                                </div>
                                <button style={{...s.btn, width:"auto", marginTop:0, padding:"7px 16px"}}
                                  disabled={ergSaving}
                                  onClick={async () => {
                                    setErgSaving(true);
                                    try {
                                      await updateERGFineSchedule(row.id, { fine_min: parseFloat(ergSchedMin) || 0, fine_max: parseFloat(ergSchedMax) || 0 });
                                      const f = await getERGFineSchedule();
                                      setErgSchedule(f.data);
                                      setErgSchedEditing(null);
                                    } finally { setErgSaving(false); }
                                  }}>
                                  {ergSaving ? "Saving…" : "Save"}
                                </button>
                                <button style={s.actionCancel} onClick={() => setErgSchedEditing(null)}>Cancel</button>
                              </div>
                            </td></tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          </>
        )}

        {tab === "auditlog" && (
          <div>
            <h2 style={s.sectionTitle}>Audit Log</h2>
            {auditLoading ? <p>Loading…</p> : (
              <div style={{overflowX:"auto"}}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Timestamp</th>
                    <th style={s.th}>User</th>
                    <th style={s.th}>Action</th>
                    <th style={s.th}>Table</th>
                    <th style={s.th}>Record ID</th>
                    <th style={s.th}>Details</th>
                    <th style={s.th}>IP</th>
                  </tr></thead>
                  <tbody>
                    {auditLogs.map(l => (
                      <tr key={l.id} style={{borderBottom:"1px solid #e2e8f0"}}>
                        <td style={s.td}>{new Date(l.timestamp).toLocaleString()}</td>
                        <td style={s.td}>{l.username}</td>
                        <td style={s.td}>{l.action}</td>
                        <td style={s.td}>{l.table_name ?? "—"}</td>
                        <td style={s.td}>{l.record_id ?? "—"}</td>
                        <td style={{...s.td, maxWidth:300, whiteSpace:"pre-wrap", wordBreak:"break-word"}}>{l.details ?? "—"}</td>
                        <td style={s.td}>{l.ip_address ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {auditLogs.length === 0 && <p style={{color:"#718096", marginTop:12}}>No audit entries found.</p>}
              </div>
            )}
          </div>
        )}

        {/* Delete Company Confirmation Modal */}
        {deleteModal && (
          <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000,
                        display:"flex", alignItems:"center", justifyContent:"center"}}>
            <div style={{background:"#fff", borderRadius:10, padding:28, maxWidth:480, width:"90%",
                          boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
              <h3 style={{color:"#c53030", marginBottom:12}}>Delete Company</h3>
              <p style={{marginBottom:16}}>
                You are about to permanently delete <strong>{deleteModal.company.name}</strong> and all associated data.
                This cannot be undone.
              </p>
              <table style={{width:"100%", fontSize:13, marginBottom:16, borderCollapse:"collapse"}}>
                <tbody>
                  {Object.entries(deleteModal.dependents).map(([k, v]) => (
                    <tr key={k} style={{borderBottom:"1px solid #e2e8f0"}}>
                      <td style={{padding:"4px 8px", color:"#4a5568", textTransform:"capitalize"}}>{k.replace(/_/g," ")}</td>
                      <td style={{padding:"4px 8px", fontWeight:700, color: (v as number) > 0 ? "#c53030" : "#276749"}}>{v as number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{fontSize:13, marginBottom:8, color:"#4a5568"}}>
                Type <strong>{deleteModal.company.name}</strong> to confirm:
              </p>
              <input style={{...s.input, marginBottom:16, borderColor: deleteConfirmName === deleteModal.company.name ? "#c53030" : "#cbd5e0"}}
                value={deleteConfirmName}
                onChange={e => setDeleteConfirmName(e.target.value)}
                placeholder={deleteModal.company.name} />
              <div style={s.btnRow}>
                <button style={{...s.btn, background:"#c53030"}}
                  disabled={deleteConfirmName !== deleteModal.company.name}
                  onClick={async () => {
                    await deleteCompany(deleteModal.company.id);
                    setDeleteModal(null);
                    setSelectedCompanyId("");
                    getCompanies().then(r => setCompanies(r.data));
                    setStatus(`${deleteModal.company.name} has been permanently deleted.`);
                  }}>
                  Permanently Delete
                </button>
                <button style={s.clearBtn} onClick={() => setDeleteModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { minHeight:"100vh", background:"#f0f4f8" },
  stickyTop:    { position:"sticky", top:0, zIndex:100,
                  boxShadow:"0 2px 8px rgba(0,0,0,0.12)" },
  permitAlertBar:     { background:"#fffaf0", borderBottom:"2px solid #f6ad55", padding:"10px 24px" },
  permitAlertInner:   { display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" as const },
  permitAlertTitle:   { fontWeight:700, color:"#744210", fontSize:13, whiteSpace:"nowrap" as const },
  permitAlertList:    { display:"flex", flexWrap:"wrap" as const, gap:8, flex:1 },
  permitAlertDismiss: { marginLeft:"auto", background:"transparent", border:"none",
                        cursor:"pointer", color:"#744210", fontSize:16, lineHeight:1, padding:"2px 6px" },
  header:       { background:"#1a365d", color:"#fff", padding:"12px 24px",
                  display:"flex", alignItems:"center", gap:16 },
  brand:        { fontSize:20, fontWeight:700, flex:1 },
  role:         { fontSize:13, background:"#553c9a", padding:"3px 10px", borderRadius:12 },
  logoutBtn:    { marginLeft:"auto", background:"transparent", color:"#fff",
                  border:"1px solid #fff", borderRadius:5, padding:"4px 12px", cursor:"pointer" },
  tabs:         { display:"flex", gap:4, padding:"16px 24px 0", background:"#fff",
                  borderBottom:"2px solid #e2e8f0" },
  tab:          { padding:"8px 20px", border:"none", background:"transparent",
                  cursor:"pointer", fontSize:14, color:"#4a5568", borderRadius:"5px 5px 0 0" },
  activeTab:    { background:"#f3e8ff", color:"#553c9a", fontWeight:700,
                  borderBottom:"2px solid #553c9a" },
  content:      { padding:24 },
  twoCol:       { display:"flex", gap:24 },
  sectionTitle: { fontSize:18, fontWeight:700, color:"#1a365d", marginBottom:14 },
  listItem:     { background:"#fff", borderRadius:6, padding:"10px 14px", marginBottom:8,
                  boxShadow:"0 1px 3px rgba(0,0,0,0.07)" },
  meta:         { display:"block", fontSize:12, color:"#718096", marginTop:2 },
  formCard:     { background:"#fff", borderRadius:8, padding:20, minWidth:280,
                  boxShadow:"0 1px 4px rgba(0,0,0,0.08)", alignSelf:"start" },
  formTitle:    { fontSize:15, fontWeight:700, color:"#1a365d", marginBottom:14 },
  label:        { display:"block", fontSize:12, fontWeight:600, color:"#4a5568", marginBottom:4 },
  input:        { display:"block", width:"100%", padding:"7px 10px", marginBottom:12,
                  border:"1px solid #cbd5e0", borderRadius:5, fontSize:14 },
  btnRow:       { display:"flex", gap:8, marginTop:4 },
  btn:          { padding:"8px 20px", background:"#553c9a", color:"#fff",
                  border:"none", borderRadius:5, fontWeight:600, cursor:"pointer" },
  clearBtn:     { padding:"8px 16px", background:"#718096", color:"#fff",
                  border:"none", borderRadius:5, cursor:"pointer" },
  exportBtn:    { padding:"5px 14px", borderRadius:5, border:"1px solid #276749",
                  background:"#f0fff4", color:"#276749", cursor:"pointer", fontSize:13,
                  fontWeight:600 },
  sevChip:      { padding:"1px 8px", borderRadius:10, fontSize:11, fontWeight:600,
                  whiteSpace:"nowrap" as const },
  queuePanel:   { marginTop:12, border:"2px solid #553c9a", borderRadius:8,
                  background:"#faf5ff", overflow:"hidden" },
  queueHeader:  { display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"8px 12px", background:"#e9d8fd", borderBottom:"1px solid #d6bcfa" },
  queueItem:    { display:"flex", alignItems:"center", gap:8, padding:"6px 12px",
                  borderBottom:"1px solid #e9d8fd", fontSize:13 },
  viewAsSelect: { padding:"4px 10px", borderRadius:5, border:"1px solid rgba(255,255,255,0.4)",
                  background:"rgba(255,255,255,0.12)", color:"#fff", fontSize:13,
                  cursor:"pointer", marginLeft:"auto" },
  viewAsPill:   { position:"fixed", bottom:20, right:20, zIndex:999,
                  background:"#1a365d", color:"#fff", borderRadius:24,
                  padding:"10px 16px", display:"flex", alignItems:"center", gap:10,
                  boxShadow:"0 4px 16px rgba(0,0,0,0.25)", fontSize:13 },
  viewAsBack:   { background:"#553c9a", color:"#fff", border:"none", borderRadius:16,
                  padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700 },
  statusMsg:    { padding:"10px 16px", borderRadius:6, marginBottom:16, fontSize:14 },
  limitFormError: { background:"#fff5f5", color:"#c53030", border:"1px solid #fc8181",
                    borderRadius:5, padding:"8px 12px", marginBottom:10, fontSize:13 },
  selectedItem: { borderLeft:"3px solid #553c9a", background:"#f3e8ff" },
  limitsSection:      { marginTop:28, paddingTop:20, borderTop:"2px solid #e2e8f0" },
  limitsSectionHeader:{ display:"flex", alignItems:"center", gap:16, marginBottom:16 },
  limitsPermitBadge:  { fontSize:13, fontWeight:600, color:"#553c9a", background:"#f3e8ff",
                        padding:"4px 14px", borderRadius:12 },
  focusCol:     { outline:"none" },
  threeCol:     { display:"flex", gap:20, alignItems:"flex-start" },
  inlineLimits: { flex:"1 1 0", minWidth:0, background:"#fff", borderRadius:8,
                  padding:16, boxShadow:"0 1px 4px rgba(0,0,0,0.08)", alignSelf:"start" },
  inlineLimitsScroll: { overflowX:"auto" as const },
  limitsInlineTable:  { width:"100%", borderCollapse:"collapse" as const, fontSize:12 },
  th:           { padding:"6px 8px", background:"#f7fafc", borderBottom:"2px solid #e2e8f0",
                  textAlign:"left" as const, whiteSpace:"nowrap" as const, fontWeight:700,
                  color:"#1a202c" },
  td:           { padding:"6px 8px", borderBottom:"1px solid #edf2f7", verticalAlign:"top" as const },
  companySelect:{ display:"block", width:"100%", padding:"6px 8px", fontSize:14,
                  border:"1px solid #cbd5e0", borderRadius:6, background:"#fff",
                  minHeight:180 },
  btnStack:     { display:"flex", flexDirection:"column" as const, gap:8, marginTop:12 },
  outlineBtn:   { padding:"8px 16px", background:"#fff", color:"#553c9a",
                  border:"2px solid #553c9a", borderRadius:5, fontWeight:600,
                  cursor:"pointer" },
  permitsHeader:{ display:"flex", alignItems:"center", gap:12, marginBottom:14 },
  filterBadge:  { display:"inline-flex", alignItems:"center", gap:6, fontSize:12,
                  background:"#e9d8fd", color:"#553c9a", padding:"3px 10px",
                  borderRadius:12, fontWeight:600 },
  badgeClear:   { background:"none", border:"none", cursor:"pointer", color:"#553c9a",
                  fontWeight:700, fontSize:14, lineHeight:1, padding:0 },
  viewingBadgeRow:{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    marginBottom:12 },
  viewingBadge: { fontSize:11, fontWeight:600, color:"#276749", background:"#c6f6d5",
                  padding:"2px 10px", borderRadius:10 },
  paramBtn:     { padding:"5px 12px", fontSize:12, fontWeight:600, background:"#553c9a",
                  color:"#fff", border:"none", borderRadius:5, cursor:"pointer" },
  readOnly:     { background:"#f7fafc", color:"#718096", cursor:"default" },
  mrCheckRow:   { display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:600,
                  color:"#553c9a", margin:"0 0 12px", cursor:"pointer" },
  disabledLabel:{ color:"#a0aec0" },
  mrBadge:      { fontWeight:700, color:"#ed8936" },
  rangeBadge:   { fontWeight:700, color:"#1a202c" },
  drillBtn:     { background:"none", border:"none", cursor:"pointer", fontWeight:700,
                  color:"#c53030", fontSize:13, padding:"0 2px", textDecoration:"underline" },
  rangeRow:     { display:"flex", gap:12, marginBottom:12 },
  comboWrap:    { position:"relative" as const, marginBottom:12 },
  comboList:    { position:"absolute" as const, top:"100%", left:0, right:0, zIndex:100,
                  background:"#fff", border:"1px solid #cbd5e0", borderRadius:5,
                  boxShadow:"0 4px 12px rgba(0,0,0,0.12)", maxHeight:180, overflowY:"auto" as const },
  comboOption:  { padding:"8px 12px", cursor:"pointer", fontSize:14,
                  borderBottom:"1px solid #edf2f7" },
  comboAbbr:    { color:"#718096", fontSize:12 },
  comboNone:    { padding:"8px 12px", fontSize:13, color:"#a0aec0", fontStyle:"italic" },
  comboCreate:  { padding:"9px 12px", cursor:"pointer", fontSize:13, fontWeight:600,
                  color:"#553c9a", borderTop:"1px dashed #e9d8fd", background:"#faf5ff" },
  newParamCard: { background:"#faf5ff", border:"1px solid #d6bcfa", borderRadius:6,
                  padding:"14px 14px 10px", marginBottom:12 },
  newParamTitle:{ fontSize:12, fontWeight:700, color:"#553c9a", textTransform:"uppercase" as const,
                  letterSpacing:"0.06em", marginBottom:10 },
  table:        { width:"100%", borderCollapse:"collapse", background:"#fff",
                  borderRadius:8, boxShadow:"0 1px 4px rgba(0,0,0,0.08)", fontSize:13 },
  reviewCard:      { background:"#fff", borderRadius:8, padding:20,
                     boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  reviewMeta:      { display:"flex", gap:24, fontSize:13, color:"#4a5568",
                     marginBottom:14, padding:"10px 0", borderBottom:"1px solid #edf2f7" },
  reviewTextarea:  { display:"block", width:"100%", padding:"8px 10px", marginTop:6, marginBottom:12,
                     border:"1px solid #cbd5e0", borderRadius:5, fontSize:13,
                     resize:"vertical" as const, boxSizing:"border-box" as const, fontFamily:"inherit" },
  reviewedNote:    { fontSize:12, color:"#718096", alignSelf:"center" },
  violationBox:    { background:"#fff5f5", border:"1px solid #fc8181", borderRadius:6,
                     padding:"10px 14px", marginBottom:14 },
  violationRow:    { fontSize:13, color:"#c53030", marginTop:6 },
  badgePending:    { fontSize:11, fontWeight:700, background:"#fefcbf", color:"#744210",
                     padding:"2px 8px", borderRadius:8 },
  badgeReviewed:   { fontSize:11, fontWeight:700, background:"#c6f6d5", color:"#276749",
                     padding:"2px 8px", borderRadius:8 },
  badgeCorrected:  { fontSize:11, fontWeight:700, background:"#ebf8ff", color:"#2b6cb0",
                     padding:"2px 8px", borderRadius:8 },
  statusPass:      { fontSize:12, fontWeight:600, color:"#276749" },
  statusFail:      { fontSize:12, fontWeight:600, color:"#c53030" },
  statusInfo:      { fontSize:12, color:"#718096" },
  actionEdit:      { fontSize:11, fontWeight:600, padding:"2px 8px", marginRight:4,
                     background:"#ebf8ff", color:"#2b6cb0", border:"1px solid #bee3f8",
                     borderRadius:4, cursor:"pointer" },
  actionDel:       { fontSize:11, fontWeight:600, padding:"2px 8px",
                     background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2",
                     borderRadius:4, cursor:"pointer" },
  actionSave:      { fontSize:11, fontWeight:600, padding:"2px 8px", marginRight:4,
                     background:"#c6f6d5", color:"#276749", border:"1px solid #9ae6b4",
                     borderRadius:4, cursor:"pointer" },
  actionCancel:    { fontSize:11, fontWeight:600, padding:"2px 8px",
                     background:"#f7fafc", color:"#4a5568", border:"1px solid #cbd5e0",
                     borderRadius:4, cursor:"pointer" },
  recheckBtn:      { padding:"8px 14px", background:"#ebf8ff", color:"#2b6cb0",
                     border:"1px solid #bee3f8", borderRadius:6, fontSize:13,
                     fontWeight:600, cursor:"pointer" },
  deleteSampleBtn: { padding:"8px 16px", background:"#fff5f5", color:"#c53030",
                     border:"1px solid #feb2b2", borderRadius:6, fontSize:13,
                     fontWeight:600, cursor:"pointer" },
  reportForm:      { background:"#fff", borderRadius:8, padding:"16px 20px",
                     boxShadow:"0 1px 4px rgba(0,0,0,0.08)", marginBottom:4 },
  reportFormRow:   { display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const },
  reportField:     { display:"flex", flexDirection:"column" as const, minWidth:160, flex:"1 1 160px" },
  reportCount:     { fontSize:12, color:"#718096" },
  chipOverdue:   { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2",
                   display:"inline-flex", alignItems:"center", justifyContent:"center" },
  chipDueSoon:   { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#fffff0", color:"#744210", border:"1px solid #f6e05e",
                   display:"inline-flex", alignItems:"center", justifyContent:"center" },
  chipNever:     { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#f7fafc", color:"#4a5568", border:"1px solid #cbd5e0",
                   display:"inline-flex", alignItems:"center", justifyContent:"center" },
  chipCurrent:   { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#f0fff4", color:"#276749", border:"1px solid #9ae6b4",
                   display:"inline-flex", alignItems:"center", justifyContent:"center" },
  schedOverdue:  { fontSize:12, fontWeight:700, color:"#c53030" },
  schedDueSoon:  { fontSize:12, fontWeight:700, color:"#744210" },
  schedNever:    { fontSize:12, color:"#718096" },
  schedCurrent:  { fontSize:12, fontWeight:600, color:"#276749" },
  printBtn:        { padding:"5px 14px", background:"#2b6cb0", color:"#fff",
                     border:"none", borderRadius:5, fontSize:12, fontWeight:600,
                     cursor:"pointer" },
};
