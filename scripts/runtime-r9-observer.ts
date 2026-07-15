#!/usr/bin/env bun
import {createHash,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {canonicalSemanticJson} from '../packages/core/src/organization-canonical';
const statePath=process.argv[2],privateKeyPath=process.env.R9_OBSERVER_PRIVATE_KEY;
if(!statePath||!privateKeyPath)throw new Error('state path and R9_OBSERVER_PRIVATE_KEY are required');
const sessions=JSON.parse(readFileSync(statePath,'utf8')) as Array<{id:string;agent:string;status:string;params?:Record<string,string>}>;
const session=sessions.find(value=>value.params?.DOGFOOD_RUN_ID===process.env.R9_DOGFOOD_RUN_ID);
if(!session)throw new Error('canonical runtime effect is absent');
const base={schema:'autonomy.r9-external-runtime-observation.v1',issuer:'repository-r9-observer',subjectBundleDigest:process.env.R9_BUNDLE_DIGEST,releaseDigest:process.env.R9_RELEASE_DIGEST,instanceId:process.env.R9_INSTANCE_ID,compilerDigest:process.env.R9_COMPILER_DIGEST,runtimeDigest:process.env.R9_RUNTIME_DIGEST,organizationDigest:process.env.R9_ORGANIZATION_DIGEST,workId:session.params!.DOGFOOD_RUN_ID,actor:session.agent,status:session.status};
const statements=[{...base,kind:'process',executable:'scripts/runner.ts'},{...base,kind:'effect',canonical:true,command:'launch maintainer',effectPath:'.open-autonomy/runner-state/human-sessions.json'}],key=readFileSync(privateKeyPath);
console.log(JSON.stringify(statements.map(statement=>{const bytes=Buffer.from(canonicalSemanticJson(statement)),digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`,signature=sign(null,bytes,key).toString('base64');return{statement,digest,signer:'repository-r9-observer',algorithm:'Ed25519',signature};})));
