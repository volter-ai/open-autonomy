#!/usr/bin/env bun
import {createCompilerArtifact,runStableCompiler,verifyCompilerArtifact,type CompilerArtifact,type CompilerOperation,type StableCompilerPass} from '../packages/core/src/organization-compiler-api';
import type {CompilerLevel} from '../packages/core/src/organization-compiler';

const raw=await Bun.stdin.text();
if(Buffer.byteLength(raw)>16_777_216){console.error(JSON.stringify({ok:false,error:'request exceeds 16777216 bytes'}));process.exit(1);}
try{
  const request=JSON.parse(raw) as {operation:'wrap';stage:CompilerOperation;level:CompilerLevel;content:unknown}|{operation:'verify';artifact:CompilerArtifact}|{operation:'execute';artifact:CompilerArtifact;pass:StableCompilerPass;budget?:Record<string,number>};
  if(request.operation==='wrap')console.log(JSON.stringify({ok:true,artifact:createCompilerArtifact(request.stage,request.level,request.content)}));
  else if(request.operation==='verify'){const errors=verifyCompilerArtifact(request.artifact);console.log(JSON.stringify({ok:errors.length===0,errors}));if(errors.length)process.exitCode=1;}
  else if(request.operation==='execute'){const result=await runStableCompiler({input:request.artifact,passes:[request.pass],budget:request.budget});console.log(JSON.stringify({ok:Boolean(result.artifact),...result}));if(!result.artifact)process.exitCode=1;}
  else throw new Error('operation must be wrap or verify');
}catch(error){console.error(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}));process.exit(1);}
