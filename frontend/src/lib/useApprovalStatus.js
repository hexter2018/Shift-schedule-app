import { useState, useCallback, useEffect } from "react";
import { storageKey } from "./logic";
import { getApprovalStatus, submitForApproval } from "./approvals";

// Extracted straight out of App.jsx (was inline state + 2 callbacks + 1
// effect there) — self-contained enough that pulling it into its own hook
// doesn't touch anything else App.jsx does, which is exactly the kind of
// piece worth extracting first: real size reduction, close to zero risk.
export function useApprovalStatus({ store, department, ready }){
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(true);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalSubmitError, setApprovalSubmitError] = useState(null);

  // Reads the *current* schedule key off the store ref rather than a prop —
  // this gets called from month-switch handlers where the ref has already
  // moved on to the new month by the time this runs, and from a polling
  // interval that must always check whatever month is currently showing,
  // not whatever month was showing when the interval was created.
  const refreshApprovalStatus = useCallback(async ()=>{
    if(!store.current.state) return;
    const key = storageKey(department.slug, store.current.state.month, store.current.state.yearBE);
    try{
      const status = await getApprovalStatus(key);
      setApprovalStatus(status);
    }catch(err){
      console.error(err);
    }finally{
      setApprovalLoading(false);
    }
  }, [store, department]);

  const onSubmitApproval = useCallback(async (sectionManagerEmail, divisionManagerEmail)=>{
    const key = storageKey(department.slug, store.current.state.month, store.current.state.yearBE);
    setApprovalSubmitting(true);
    setApprovalSubmitError(null);
    try{
      await submitForApproval(key, { sectionManagerEmail, divisionManagerEmail });
      await refreshApprovalStatus();
    }catch(err){
      setApprovalSubmitError(err.message);
    }finally{
      setApprovalSubmitting(false);
    }
  }, [refreshApprovalStatus, department, store]);

  // Poll periodically while mounted — a manager approving over email
  // happens completely outside this browser session, so the only way to
  // notice is to keep checking. 15s keeps the banner reasonably live
  // without hammering the backend.
  useEffect(()=>{
    if(!ready) return;
    refreshApprovalStatus();
    const interval = setInterval(refreshApprovalStatus, 15000);
    return ()=> clearInterval(interval);
  }, [ready, refreshApprovalStatus]);

  return {
    approvalStatus, approvalLoading, approvalSubmitting, approvalSubmitError,
    refreshApprovalStatus, onSubmitApproval,
  };
}
