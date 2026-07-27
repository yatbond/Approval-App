import assert from "node:assert/strict";
import test from "node:test";
import { createTemplateCopilotV2Ledger, applyTemplateCopilotV2FactTransition } from "./template-copilot-facts.ts";
import { confirmTemplateCopilotV2Candidate, projectTemplateCopilotV2Candidates, resolveTemplateCopilotV2CommittedExtractionConflict } from "./template-copilot-v2-candidates.ts";
import { getTemplateCopilotV2InterviewState } from "./template-copilot-question-library.ts";

const flag={enabled:true}; const actor="33333333-3333-4333-8333-333333333333";
const scope={businessUnitId:"11111111-1111-4111-8111-111111111111",businessName:"Finance",departmentId:"22222222-2222-4222-8222-222222222222",departmentName:"Accounts"};
function candidate(value="Purchase Approval", more={}){return {factId:"workflow.name",valueType:"text",value,originalWording:value,evidence:[{path:"/",messageId:"m",startCodePoint:0,endCodePoint:Array.from(value).length,exactText:value}],confidence:"medium",ambiguity:"none",...more};}

test("evidence-bound confirmation commits exactly one candidate, preserves history, and unlocks the next question",()=>{
 const base=createTemplateCopilotV2Ledger(scope,flag); const projected=projectTemplateCopilotV2Candidates({ledger:base,candidates:[candidate()]}); const id=projected.ledger.extractionEvidence.candidates[0].candidateId;
 const next=confirmTemplateCopilotV2Candidate({ledger:projected.ledger,candidateId:id,actorId:actor,confirmedAt:"2026-07-27T00:00:00Z",beforeRevision:2});
 assert.equal(next.facts["workflow.name"].status,"committed"); assert.equal(next.extractionEvidence.candidates[0].state,"confirmed"); assert.equal(next.extractionEvidence.history[0].choice,"confirm_candidate"); assert.equal(getTemplateCopilotV2InterviewState(next).nextQuestion.targetFactId,"workflow.purpose");
 assert.throws(()=>confirmTemplateCopilotV2Candidate({ledger:next,candidateId:id,actorId:actor,confirmedAt:"2026-07-27T00:00:01Z"}),/no longer available/);
});

test("conflict choices retain typed prior/incoming evidence and close instead of deleting",()=>{
 let base=createTemplateCopilotV2Ledger(scope,flag); base=applyTemplateCopilotV2FactTransition({ledger:base,factId:"workflow.name",transition:{operation:"human_commit",payload:{canonicalValue:"Invoice Approval",provenance:[{kind:"human_editor",sourceId:"manual",sourceMessageIds:[]}]}},actorId:actor,confirmedAt:"2026-07-27T00:00:00Z",flag});
 const conflicted=projectTemplateCopilotV2Candidates({ledger:base,candidates:[candidate()]}).ledger; const id=conflicted.extractionEvidence.conflicts[0].conflictId;
 const kept=resolveTemplateCopilotV2CommittedExtractionConflict({ledger:conflicted,conflictId:id,resolution:"keep_existing",rationale:"retain",actorId:actor,confirmedAt:"2026-07-27T00:01:00Z"});
 assert.equal(kept.facts["workflow.name"].canonicalValue,"Invoice Approval"); assert.equal(kept.extractionEvidence.conflicts[0].state,"closed"); assert.equal(kept.extractionEvidence.history[0].rationale,"retain"); assert.equal(kept.facts["workflow.name"].confirmation.confirmedAt,"2026-07-27T00:00:00Z"); assert.equal(kept.extractionEvidence.history[0].confirmedAt,"2026-07-27T00:01:00Z");
 const accepted=resolveTemplateCopilotV2CommittedExtractionConflict({ledger:conflicted,conflictId:id,resolution:"commit_incoming",actorId:actor,confirmedAt:"2026-07-27T00:01:00Z"}); assert.equal(accepted.facts["workflow.name"].canonicalValue,"Purchase Approval");
});

test("cross-turn candidate differences remain durable conflicts and require a human choice",()=>{
 const base=createTemplateCopilotV2Ledger(scope,flag);
 const first=projectTemplateCopilotV2Candidates({ledger:base,candidates:[candidate("Purchase Approval")]}).ledger;
 const firstId=first.extractionEvidence.candidates[0].candidateId;
 const conflicted=projectTemplateCopilotV2Candidates({ledger:first,candidates:[candidate("Invoice Approval")]}).ledger;
 const conflict=conflicted.extractionEvidence.conflicts[0];
 assert.equal(conflicted.facts["workflow.name"].status,"candidate");
 assert.equal(conflict.state,"open"); assert.equal(conflict.existing.candidate.candidateId,firstId);
 assert.equal(conflict.incoming.value,"Invoice Approval"); assert.equal(conflict.incoming.evidence[0].exactText,"Invoice Approval");
 assert.throws(()=>confirmTemplateCopilotV2Candidate({ledger:conflicted,candidateId:firstId,actorId:actor,confirmedAt:"2026-07-27T00:01:00Z"}),/open extraction conflict/);
 const kept=resolveTemplateCopilotV2CommittedExtractionConflict({ledger:conflicted,conflictId:conflict.conflictId,resolution:"keep_existing",actorId:actor,confirmedAt:"2026-07-27T00:02:00Z"});
 assert.equal(kept.facts["workflow.name"].status,"committed"); assert.equal(kept.facts["workflow.name"].canonicalValue,"Purchase Approval");
 assert.equal(kept.extractionEvidence.history[0].existingCandidate.candidateId,firstId); assert.equal(kept.extractionEvidence.history[0].incoming.value,"Invoice Approval");
 assert.throws(()=>confirmTemplateCopilotV2Candidate({ledger:kept,candidateId:firstId,actorId:actor,confirmedAt:"2026-07-27T00:03:00Z"}),/no longer matches/);
 const fresh=projectTemplateCopilotV2Candidates({ledger:first,candidates:[candidate("Invoice Approval")]}).ledger;
 const accepted=resolveTemplateCopilotV2CommittedExtractionConflict({ledger:fresh,conflictId:fresh.extractionEvidence.conflicts[0].conflictId,resolution:"commit_incoming",actorId:actor,confirmedAt:"2026-07-27T00:02:00Z"});
 assert.equal(accepted.facts["workflow.name"].canonicalValue,"Invoice Approval");
});

test("ambiguous candidates cannot be directly confirmed",()=>{
 const projected=projectTemplateCopilotV2Candidates({ledger:createTemplateCopilotV2Ledger(scope,flag),candidates:[candidate("Purchase Approval",{ambiguity:"possible",ambiguityNote:"Could be a draft name."})]}).ledger;
 assert.throws(()=>confirmTemplateCopilotV2Candidate({ledger:projected,candidateId:projected.extractionEvidence.candidates[0].candidateId,actorId:actor,confirmedAt:"2026-07-27T00:00:00Z"}),/Ambiguous extraction candidates/);
});
