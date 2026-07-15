#!/usr/bin/env python3
"""Small clean-room Organization IR v2 interoperability utility (stdlib only)."""
import hashlib, json, math, re, sys

MAX_INPUT = 4 * 1024 * 1024
ID = re.compile(r"^[A-Za-z][A-Za-z0-9._/-]*$")
CATALOGS = ("imports","types","behaviors","tools","memories","capabilities","units",
            "relations","goals","workTypes","initialWork","protocols","policies","budgets",
            "decisions","artifacts")
TOP = {"schema","name","version","actors","compiler","labels","documentation","provenance","extensions",*CATALOGS}
LAYERS = ["constitution","organization","role","task","skill","conversation","runtime"]

class DuplicateKey(ValueError): pass
def pairs(items):
    d={}
    for k,v in items:
        if k in d: raise DuplicateKey(k)
        d[k]=v
    return d

def load(raw):
    if len(raw)>MAX_INPUT: raise ValueError("input exceeds 4194304-byte limit")
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda x: (_ for _ in ()).throw(ValueError("non-finite number")))

def u16(s): return s.encode("utf-16-be", "surrogatepass")
def q(s):
    # json.dumps supplies the RFC 8259 escaping required by JCS; surrogates reject.
    s.encode("utf-8")
    return json.dumps(s, ensure_ascii=False, separators=(",",":"))
def num(x):
    if not math.isfinite(x): raise ValueError("non-finite number")
    if x == 0: return "0"
    if isinstance(x,int): return str(x)
    # Python repr supplies shortest-round-trip digits. JCS uses ECMAScript's decimal/exponent
    # thresholds, so move the decimal point without rounding when the spellings differ.
    s=repr(x).lower(); mant, sep, exp=s.partition("e")
    if sep:
        n=int(exp)
        if 1e-6 <= abs(x) < 1e21:
            sign=""
            if mant.startswith("-"): sign="-"; mant=mant[1:]
            whole, dot, frac=mant.partition(".")
            digits=whole+frac
            point=len(whole)+n
            if point <= 0: s=sign+"0."+("0"*(-point))+digits
            elif point >= len(digits): s=sign+digits+("0"*(point-len(digits)))
            else: s=sign+digits[:point]+"."+digits[point:]
        else: s=mant+"e"+("+" if n>=0 else "")+str(n)
    elif s.endswith(".0"): s=s[:-2]
    return s
def canon(v):
    if v is None:return "null"
    if v is True:return "true"
    if v is False:return "false"
    if isinstance(v,(int,float)) and not isinstance(v,bool):return num(v)
    if isinstance(v,str):return q(v)
    if isinstance(v,list):return "["+",".join(canon(x) for x in v)+"]"
    if isinstance(v,dict):return "{"+",".join(q(k)+":"+canon(v[k]) for k in sorted(v,key=u16))+"}"
    raise ValueError("value is not JSON")

def diagnostic(cls,path,message): return {"class":cls,"path":path,"message":message}
def check(d):
    out=[]
    if not isinstance(d,dict): return [diagnostic("structure","","document must be an object")]
    for k in d.keys()-TOP: out.append(diagnostic("unknown-member","/"+k,"unknown member"))
    if d.get("schema")!="autonomy.organization.v2": out.append(diagnostic("schema","/schema","unsupported schema"))
    if not isinstance(d.get("name"),str) or not d.get("name"): out.append(diagnostic("required","/name","nonempty string required"))
    actors=d.get("actors")
    if not isinstance(actors,dict) or not actors: out.append(diagnostic("required","/actors","nonempty catalog required"))
    cats={k:d.get(k,{}) for k in CATALOGS}; cats["actors"]=actors if isinstance(actors,dict) else {}
    for cat, vals in cats.items():
        if not isinstance(vals,dict): out.append(diagnostic("structure","/"+cat,"catalog must be an object")); continue
        for ident in vals:
            if not ID.fullmatch(ident): out.append(diagnostic("identifier",f"/{cat}/{ident}","invalid catalog identifier"))
    # High-value, sort-aware references in the supported single-module subset.
    refs=(("actors","behaviors","behaviors"),("actors","memberOf","units"),("units","members","actors"),
          ("units","goals","goals"),("units","policies","policies"))
    for src,field,target in refs:
        for ident,obj in cats[src].items():
            if not isinstance(obj,dict): out.append(diagnostic("structure",f"/{src}/{ident}","declaration must be an object")); continue
            values=obj.get(field,[]); values=values if isinstance(values,list) else [values]
            for i,v in enumerate(values):
                if isinstance(v,str) and "/" not in v and v not in cats[target]: out.append(diagnostic("reference",f"/{src}/{ident}/{field}/{i}",f"missing {target} reference: {v}"))
    # Parent/dependency graph checks.
    for cat,field in (("units","parent"),("goals","parent"),("budgets","parent"),("initialWork","parent"),("initialWork","dependencies"),("behaviors","behaviors")):
        graph={}
        for ident,obj in cats[cat].items():
            v=obj.get(field,[]) if isinstance(obj,dict) else []
            graph[ident]=v if isinstance(v,list) else ([v] if isinstance(v,str) else [])
            if len(graph[ident])!=len(set(graph[ident])): out.append(diagnostic("duplicate-edge",f"/{cat}/{ident}/{field}","duplicate graph edge"))
        visiting=set(); done=set()
        def dfs(n):
            if n in visiting:return True
            if n in done:return False
            visiting.add(n); cyc=any(x in graph and dfs(x) for x in graph.get(n,[])); visiting.remove(n); done.add(n); return cyc
        if any(dfs(n) for n in graph): out.append(diagnostic("cycle",f"/{cat}",f"{field} graph is cyclic"))
    for ident,obj in cats["budgets"].items():
        if isinstance(obj,dict) and isinstance(obj.get("limit"),(int,float)) and obj["limit"]<0: out.append(diagnostic("range",f"/budgets/{ident}/limit","budget must be nonnegative"))
    return out

def strip_annotations(v):
    if isinstance(v,list): return [strip_annotations(x) for x in v]
    if isinstance(v,dict): return {k:strip_annotations(x) for k,x in v.items() if k not in ("documentation","provenance")}
    return v
def normalize(d,module_id=None):
    errs=check(d)
    if errs: raise ValueError("document is invalid: "+errs[0]["message"])
    n=json.loads(json.dumps(d))
    for c in CATALOGS:n.setdefault(c,{})
    for imp in n["imports"].values(): imp.setdefault("required",True)
    for b in n["behaviors"].values():
        ins=b.get("instructions")
        if isinstance(ins,dict): ins.setdefault("precedence",LAYERS[:]); ins.setdefault("conflict","reject")
    return n

def migrate(d):
    if not isinstance(d,dict) or d.get("schema")!="autonomy.ir.v1": raise ValueError("migration source must be autonomy.ir.v1")
    behaviors={}; actors={}; caps={}
    for aid,a in d.get("agents",{}).items():
        bid=aid+"-behavior"; behaviors[bid]={"kind":"prompt","inline":a.get("behavior","")}
        grants=[]
        for c in a.get("capabilities",[]):
            caps.setdefault(c,{"resourceKinds":[c],"actions":["use"]}); grants.append({"capability":c})
        actors[aid]={"kind":a.get("kind","agent"),"behaviors":[bid]}
        if grants: actors[aid]["capabilities"]=grants
    out={"schema":"autonomy.organization.v2","name":d.get("name","migrated-organization"),"behaviors":behaviors,"capabilities":caps,"actors":actors,
         "extensions":{"open-autonomy.dev/migration-v1-source":d}}
    return {"document":out,"losses":[{"class":"non-round-trip","fields":["targets","codeHost","policy","resources","documents","agents.triggers","agents.timeout","agents.review","agents.result","agents.prelaunch"],"authorizationRequired":True}]}

def main():
    req=load(sys.stdin.buffer.read())
    op=req.get("operation",req.get("op")); d=req.get("document")
    if op=="check": return {"ok":not bool(check(d)),"diagnostics":check(d)}
    if op=="canonical":
        text=canon(d); domain=req.get("domain")
        if not isinstance(domain,str) or not domain: raise ValueError("canonical requires nonempty domain")
        digest=hashlib.sha256(b"oa-c14n-v1\0"+domain.encode()+b"\0"+text.encode()).hexdigest()
        return {"ok":True,"canonical":text,"canonicalBytesUtf8Hex":text.encode().hex(),"sha256":digest}
    if op=="normalize": return {"ok":True,"document":normalize(d,req.get("moduleId")),"subset":"closed single-module; authored imports are retained but not loaded"}
    if op=="migrate-v1-v2": return {"ok":True,**migrate(d)}
    raise ValueError("operation must be check, canonical, normalize, or migrate-v1-v2")
if __name__=="__main__":
    try: print(canon(main()))
    except Exception as e: print(canon({"ok":False,"error":{"class":"request","message":str(e)}})); sys.exit(1)
