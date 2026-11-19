#!/usr/bin/env python3
"""Local Structurizr workbench. Python stdlib, official CLI, Graphviz."""
import io, json, os, re, shutil, sqlite3, subprocess, tempfile, threading, textwrap, zipfile
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
ROOT = Path(__file__).resolve().parent
PROJECTS = ROOT/'diagram-projects'
DB = ROOT/'data'/'history.sqlite3'
LOCK = threading.RLock()
CLI = ROOT/'tools'/'structurizr'/'structurizr.sh'

def connection():
    DB.parent.mkdir(exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute('CREATE TABLE IF NOT EXISTS revisions (id INTEGER PRIMARY KEY, project TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP, message TEXT, files TEXT NOT NULL, compiler TEXT NOT NULL)')
    return c

def name_ok(name):
    if not isinstance(name,str) or not re.fullmatch(r'[\w -]{1,80}',name) or name in ('.','..'):
        raise ValueError('Projekt-/Templatename: 1–80 Buchstaben, Ziffern, Leerzeichen, - oder _.')
    return name

def files_in(path):
    return {str(p.relative_to(path)):p.read_text() for p in sorted(path.rglob('*')) if p.is_file() and not p.is_symlink() and p.suffix in ('.dsl','.json')}

def validate(files):
    if not isinstance(files,dict) or 'workspace.dsl' not in files or len(files)>200:
        raise ValueError('Ein Projekt benötigt workspace.dsl und höchstens 200 Quelldateien.')
    if sum(len(str(s)) for s in files.values()) > 2_000_000: raise ValueError('Projekt ist größer als 2 MB.')
    for name,source in files.items():
        p=Path(name)
        if p.is_absolute() or '..' in p.parts or '\\' in name or p.suffix not in ('.dsl','.json') or not isinstance(source,str):
            raise ValueError('Ungültiger Quellpfad: '+str(name))
        # Never run user-supplied plugins/scripts or fetch network includes.
        if p.suffix=='.dsl':
            for line in source.splitlines():
                s=line.strip()
                if s.startswith('!') and not s.startswith(('!include ', '!identifiers ', '!impliedRelationships ')):
                    raise ValueError('Lokaler sicherer Modus erlaubt nur !include, !identifiers und !impliedRelationships: '+s)
                if s.startswith('!include '):
                    target=s[9:].strip().strip('"')
                    dest=p.parent/target
                    if not target or ':' in target or '\\' in target or dest.is_absolute() or '..' in dest.parts:
                        raise ValueError('Includes müssen relative Pfade innerhalb des Projekts sein: '+target)
        # Block workspace extends / remote workspace import too.
        if re.search(r'^\s*workspace\s+extends\b',source,re.M): raise ValueError('workspace extends ist in diesem lokalen Modus deaktiviert.')

def compile_files(files):
    validate(files)
    with tempfile.TemporaryDirectory(prefix='c4-build-') as tmp:
        folder=Path(tmp)
        for name,source in files.items():
            p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source)
        result=subprocess.run(['bash',str(CLI),'export','-workspace',str(folder/'workspace.dsl'),'-format','json','-output',str(folder/'build')],capture_output=True,text=True,timeout=35)
        if result.returncode: raise ValueError((result.stdout+'\n'+result.stderr).replace(str(folder)+'/','')[-7000:])
        data=json.loads((folder/'build'/'workspace.json').read_text())
        # DSL source remains in history, not in the public compiled model.
        data.pop('documentation',None)
        return data

def flatten(model):
    elements={};rels={}
    def visit(e,kind,parent=None):
        elements[e['id']]={**e,'kind':kind,'parent':parent}
        for r in e.get('relationships',[]):rels[r['id']]=r
        for key,k in [('containers','container'),('components','component')]:
            for child in e.get(key,[]): visit(child,k,e['id'])
    for key,k in [('people','person'),('softwareSystems','softwareSystem')]:
        for e in model.get(key,[]):visit(e,k)
    return elements,rels

def enrich(data):
    es,rs=flatten(data['model']);views=[]
    for group,level in [('systemLandscapeViews',1),('systemContextViews',1),('containerViews',2),('componentViews',3),('dynamicViews',4)]:
        for view in data.get('views',{}).get(group,[]):
            v={**view,'level':level,'group':group}
            v['svg']=render(v,es,rs);views.append(v)
    return {'name':data.get('name','Workspace'),'elements':es,'relationships':rs,'views':views,'compiler':'Structurizr CLI 2025.11.09 (offizieller Java-Parser)'}

def render(view,es,rs):
    q=lambda x:json.dumps(str(x),ensure_ascii=False)
    lines=['digraph G {','graph [bgcolor="transparent", pad="0.4", nodesep="0.6", ranksep="1.1", splines="spline", rankdir='+('TB' if view.get('automaticLayout',{}).get('rankDirection')=='TopBottom' else 'LR')+'];','node [shape="box", style="rounded,filled", fontname="Arial", fontsize="13", color="#c8d6d2", penwidth="1.2", margin="0.22,0.18"];','edge [fontname="Arial", fontsize="10", color="#9aaea7", fontcolor="#526961", arrowsize="0.7"];']
    for item in view.get('elements',[]):
        e=es[item['id']];color={'person':'#f1e5cc','softwareSystem':'#e0eee8','container':'#e7eff8','component':'#f1edf9'}[e['kind']]
        label=e['name']+'\n['+e['kind']+']\n'+'\n'.join(textwrap.wrap(e.get('description',''),42))
        lines.append(q(e['id'])+' [label='+q(label)+', fillcolor='+q(color)+', URL='+q('#element='+e['id'])+', tooltip='+q(e.get('description',''))+'];')
    for item in view.get('relationships',[]):
        r=rs.get(item['id'])
        if not r:continue
        label=item.get('description',r.get('description',''))
        if item.get('order'):label=item['order']+'. '+label
        label='\n'.join(textwrap.wrap(label,35))
        lines.append(q(r['sourceId'])+' -> '+q(r['destinationId'])+' [label='+q(label)+'];')
    lines.append('}')
    r=subprocess.run(['dot','-Tsvg'],input='\n'.join(lines),capture_output=True,text=True,timeout=15)
    if r.returncode:raise ValueError('Layout fehlgeschlagen: '+r.stderr[:500])
    return r.stdout[r.stdout.index('<svg'):]

def save(name,files,message):
    name_ok(name); model=enrich(compile_files(files))
    with LOCK:
        project=PROJECTS/name
        project.mkdir(parents=True,exist_ok=True)
        # All accepted source files are snapshotted, including vendored templates and lock.
        with connection() as c:
            c.execute('INSERT INTO revisions(project,message,files,compiler) VALUES (?,?,?,?)',(name,message[:200],json.dumps(files,ensure_ascii=False),model['compiler']))
        for p in project.rglob('*'):
            if p.is_file() and p.suffix in ('.dsl','.json'):p.unlink()
        for path,source in files.items():
            p=project/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source)
    return model

class Handler(BaseHTTPRequestHandler):
    def send(self,data,status=200,ctype='application/json; charset=utf-8'):
        body=json.dumps(data,ensure_ascii=False).encode() if isinstance(data,(dict,list)) else data if isinstance(data,bytes) else data.encode()
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(body)));self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        try:
            u=urlparse(self.path);params=parse_qs(u.query);name=params.get('project',[''])[0]
            if u.path=='/api/projects':return self.send([p.name for p in sorted(PROJECTS.iterdir()) if p.is_dir() and (p/'workspace.dsl').exists()])
            if u.path=='/api/project':
                name_ok(name);files=files_in(PROJECTS/name);return self.send({'files':files,'model':enrich(compile_files(files))})
            if u.path=='/api/revisions':
                name_ok(name)
                with connection() as c:rows=c.execute('SELECT id,created,message FROM revisions WHERE project=? ORDER BY id DESC',(name,)).fetchall()
                return self.send([dict(zip(['id','created','message'],r)) for r in rows])
            if u.path=='/api/revision':
                with connection() as c:r=c.execute('SELECT files FROM revisions WHERE id=?',(int(params['id'][0]),)).fetchone()
                if not r:raise ValueError('Revision nicht gefunden.')
                return self.send({'files':json.loads(r[0])})
            if u.path=='/api/templates':
                return self.send({p.name:[v.name for v in sorted(p.iterdir()) if v.is_dir()] for p in sorted((ROOT/'Templates').iterdir()) if p.is_dir()})
            if u.path=='/api/export':
                name_ok(name);buffer=io.BytesIO()
                with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as z:
                    for path,src in files_in(PROJECTS/name).items():z.writestr(name+'/'+path,src)
                return self.send(buffer.getvalue(),ctype='application/zip')
            path={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}.get(u.path)
            if path:return self.send((ROOT/'static'/path).read_bytes(),ctype={'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8'}[path.split('.')[-1]])
            self.send({'error':'Nicht gefunden'},404)
        except Exception as e:self.send({'error':str(e)},400)
    def do_POST(self):
        try:
            if self.headers.get('Origin') and urlparse(self.headers['Origin']).netloc!=self.headers.get('Host'):raise ValueError('Origin nicht erlaubt.')
            if not self.headers.get('Content-Type','').startswith('application/json'):raise ValueError('JSON erforderlich.')
            n=int(self.headers.get('Content-Length','0'))
            if n>3_000_000:raise ValueError('Anfrage zu groß.')
            data=json.loads(self.rfile.read(n));path=urlparse(self.path).path
            if path=='/api/build':return self.send({'model':enrich(compile_files(data['files']))})
            if path=='/api/save':return self.send({'model':save(data['name'],data['files'],data.get('message','Manuelle Revision'))})
            if path=='/api/template/create':
                name=name_ok(data['name']);version=data['version'];files=data['files']
                if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise ValueError('Version muss x.y.z sein.')
                if not files or any(not re.fullmatch(r'[\w-]+\.dsl',p) or not isinstance(s,str) for p,s in files.items()):raise ValueError('Template benötigt einfache .dsl-Dateinamen.')
                dest=ROOT/'Templates'/name/version
                with LOCK:
                    if dest.exists():raise ValueError('Template-Version existiert bereits und ist unveränderlich.')
                    dest.mkdir(parents=True)
                    for p,s in files.items():(dest/p).write_text(s)
                return self.send({'ok':True})
            if path=='/api/template/update':
                files=data['files'];validate(files);name=name_ok(data['template']);version=data['version']
                if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise ValueError('Ungültige Version.')
                template=files_in(ROOT/'Templates'/name/version)
                if not template:raise ValueError('Template-Version nicht gefunden.')
                lock=json.loads(files.get('templates.lock.json','{}'));old=lock.get(name)
                oldprefix=f'templates/{name}/{old}/';newprefix=f'templates/{name}/{version}/'
                result={p:(s.replace(oldprefix,newprefix) if p.endswith('.dsl') and old else s) for p,s in files.items() if not old or not p.startswith(oldprefix)}
                if not old:
                    scope=data.get('scope','model')
                    if scope not in ('model','views'):raise ValueError('Template-Kontext muss model oder views sein.')
                    includes='\n'+''.join('        !include '+newprefix+p+'\n' for p in sorted(template) if p.endswith('.dsl'))
                    result['workspace.dsl'],count=re.subn(r'(\b'+scope+r'\s*\{)',lambda m:m[0]+includes,result['workspace.dsl'],count=1)
                    if not count:raise ValueError('Kein '+scope+'-Block in workspace.dsl gefunden.')
                for p,s in template.items():result[newprefix+p]=s
                lock[name]=version;result['templates.lock.json']=json.dumps(lock,ensure_ascii=False,indent=2)
                return self.send({'files':result,'model':enrich(compile_files(result))})
            self.send({'error':'Nicht gefunden'},404)
        except Exception as e:self.send({'error':str(e)},400)

def main():
    PROJECTS.mkdir(exist_ok=True)
    with connection() as c:
        for p in PROJECTS.iterdir():
            if p.is_dir() and (p/'workspace.dsl').exists() and not c.execute('SELECT 1 FROM revisions WHERE project=?',(p.name,)).fetchone():
                c.execute('INSERT INTO revisions(project,message,files,compiler) VALUES (?,?,?,?)',(p.name,'Ausgangsstand',json.dumps(files_in(p),ensure_ascii=False),'Structurizr CLI 2025.11.09'))
    port=int(os.environ.get('PORT','4777'))
    print(f'C4 Studio: http://127.0.0.1:{port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
if __name__=='__main__':main()
