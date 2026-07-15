export type NativeLaunch = { substrate:"hermes"|"paperclip"; nativeRunId:string; taskId:string; cwd:string; wrapperArgs:string[] };
export type PaperclipUnboundLaunch={substrate:"paperclip";nativeRunId:null;taskId:null;agentId:string;companyId:string;cwd:string;wrapperArgs:string[]};
export type PaperclipExternalWitness={challenge:string;expectedCommand:string;expectedConfigDigest:string;readBackConfigDigest:string;agentId:string;issueId:string;run:{id:string;agentId:string;contextSnapshot:{issueId?:string};processPid:number|null};concurrentCandidateRunIds:string[];log:string;adapterInvoke:{command:string;commandArgs:string[]}};
const requiredHermesEnv=["HERMES_KANBAN_TASK","HERMES_KANBAN_RUN_ID","HERMES_KANBAN_DB","HERMES_KANBAN_BOARD","HERMES_KANBAN_WORKSPACE","HERMES_PROFILE","HERMES_HOME"] as const;
export function normalizeHermesLaunch(argv:string[],env:Record<string,string|undefined>,cwd:string):NativeLaunch{
  for(const key of requiredHermesEnv)if(!env[key])throw new Error(`missing native Hermes binding ${key}`);
  if(cwd!==env.HERMES_KANBAN_WORKSPACE)throw new Error("Hermes cwd/workspace binding mismatch");
  let i=0;if(argv[i++]!=="-p"||argv[i++]!==env.HERMES_PROFILE||argv[i++]!=="--cli"||argv[i++]!=="--accept-hooks")throw new Error("unexpected Hermes argv prefix");
  while(argv[i]==="--skills"){i++;if(!argv[i++])throw new Error("empty Hermes skill");}
  if(argv[i]==="-m"){i++;if(!argv[i++])throw new Error("empty Hermes model");}
  if(argv[i]==="--toolsets"){i++;if(!argv[i++])throw new Error("empty Hermes toolsets");}
  if(argv[i++]!=="chat"||argv[i++]!=="-q"||argv[i++]!==`work kanban task ${env.HERMES_KANBAN_TASK}`)throw new Error("unexpected Hermes worker query");
  if(argv[i]==="-Q")i++;if(i!==argv.length)throw new Error("unexpected trailing Hermes argv");
  return{substrate:"hermes",nativeRunId:env.HERMES_KANBAN_RUN_ID!,taskId:env.HERMES_KANBAN_TASK!,cwd,wrapperArgs:[]};
}
export function normalizePaperclipLaunch(argv:string[],env:Record<string,string|undefined>,cwd:string):PaperclipUnboundLaunch{
  if(argv.length!==2||argv[0]!=="--oa-task"||!argv[1])throw new Error("unexpected Paperclip adapter argv");
  for(const key of ["PAPERCLIP_AGENT_ID","PAPERCLIP_COMPANY_ID","PAPERCLIP_API_URL"])if(!env[key])throw new Error(`missing Paperclip identity ${key}`);
  // Configured PAPERCLIP_RUN_ID/TASK_ID are not trusted: process adapter config
  // can forge them. Native identity is joined later from control-plane evidence.
  return{substrate:"paperclip",nativeRunId:null,taskId:null,agentId:env.PAPERCLIP_AGENT_ID!,companyId:env.PAPERCLIP_COMPANY_ID!,cwd,wrapperArgs:argv};
}
export function bindPaperclipExternalCausality(launch:PaperclipUnboundLaunch,w:PaperclipExternalWitness):NativeLaunch{
  if(!w.challenge||w.expectedConfigDigest!==w.readBackConfigDigest)throw new Error("Paperclip immutable config/challenge binding failed");
  if(w.agentId!==launch.agentId||w.run.agentId!==launch.agentId||w.run.contextSnapshot.issueId!==w.issueId||!w.run.processPid)throw new Error("Paperclip native agent/issue/run/PID join failed");
  if(w.concurrentCandidateRunIds.length)throw new Error("Paperclip native run join ambiguous");
  if(!w.log.includes(w.challenge)||!w.log.includes("LAUNCHER_RECEIPT"))throw new Error("Paperclip challenge receipt absent from native log");
  if(w.adapterInvoke.command!==w.expectedCommand||JSON.stringify(w.adapterInvoke.commandArgs)!==JSON.stringify(launch.wrapperArgs))throw new Error("Paperclip adapter invocation mismatch");
  return{substrate:"paperclip",nativeRunId:w.run.id,taskId:w.issueId,cwd:launch.cwd,wrapperArgs:launch.wrapperArgs};
}
