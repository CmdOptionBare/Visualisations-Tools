"""Integration tests, isolated copies; does not change user projects or history."""
import json, shutil, tempfile, threading, unittest, urllib.request, urllib.error, zipfile, io
from pathlib import Path
import server

class Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='c4-tests-')
        root=Path(cls.tmp.name)
        for name in ['diagram-projects','Templates','static']:shutil.copytree(server.ROOT/name,root/name)
        server.ROOT=root;server.PROJECTS=root/'diagram-projects';server.DB=root/'data'/'history.sqlite3'
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
        cls.url='http://127.0.0.1:'+str(cls.http.server_port)
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.tmp.cleanup()
    def call(self,path,body=None,raw=False):
        req=urllib.request.Request(self.url+path,data=None if body is None else json.dumps(body).encode(),headers={} if body is None else {'Content-Type':'application/json'})
        with urllib.request.urlopen(req) as r:return r.read() if raw else json.load(r)
    def test_complete_lifecycle(self):
        self.assertEqual(self.call('/api/projects'),['ACP-Protokoll','C4-Studio'])
        acp=self.call('/api/project?project=ACP-Protokoll');original=acp['files']
        views=acp['model']['views'];self.assertEqual([v['level'] for v in views],[1,2,3,4])
        self.assertEqual([r['order'] for r in views[3]['relationships']],['1','2','3','4','5','6'])
        self.assertIn('#element=',views[0]['svg']);self.assertIn('1. Auftrag mit Kontext',views[3]['svg'])
        self.call('/api/save',{'name':'ACP-Protokoll','files':original,'message':'Original'})
        first=self.call('/api/revisions?project=ACP-Protokoll')[0]['id']
        # Library updates do not mutate pinned projects.
        other=self.call('/api/project?project=C4-Studio')['files']
        libraries=self.call('/api/templates');self.assertEqual(libraries['Arbeitsplatz'],['1.0.0','1.1.0'])
        self.assertEqual(json.loads(original['templates.lock.json'])['Arbeitsplatz'],'1.0.0')
        update=self.call('/api/template/update',{'files':original,'template':'Arbeitsplatz','version':'1.1.0'})
        self.assertIn('templates/Arbeitsplatz/1.1.0/environment.dsl',update['files'])
        self.assertNotIn('templates/Arbeitsplatz/1.0.0/environment.dsl',update['files'])
        # Preview remains unsaved.
        self.assertEqual(self.call('/api/project?project=ACP-Protokoll')['files'],original)
        self.call('/api/save',{'name':'ACP-Protokoll','files':update['files'],'message':'Update 1.1.0'})
        self.assertEqual(len(self.call('/api/revisions?project=ACP-Protokoll')),2)
        restored=self.call('/api/revision?id='+str(first))['files'];self.assertEqual(restored,original)
        self.call('/api/save',{'name':'ACP-Protokoll','files':restored,'message':'Restore'})
        self.assertEqual(len(self.call('/api/revisions?project=ACP-Protokoll')),3)
        self.assertEqual(self.call('/api/project?project=C4-Studio')['files'],other)
        # Broken source cannot create a revision or overwrite a valid folder.
        invalid={**original,'workspace.dsl':'workspace { INVALID }'}
        with self.assertRaises(urllib.error.HTTPError):self.call('/api/save',{'name':'ACP-Protokoll','files':invalid})
        self.assertEqual(len(self.call('/api/revisions?project=ACP-Protokoll')),3)
        self.assertEqual(self.call('/api/project?project=ACP-Protokoll')['files'],original)
        z=zipfile.ZipFile(io.BytesIO(self.call('/api/export?project=ACP-Protokoll',raw=True)))
        self.assertEqual(z.read('ACP-Protokoll/workspace.dsl').decode(),original['workspace.dsl'])
        # First-time template incorporation and version immutability.
        self.call('/api/template/create',{'name':'Testmodell','version':'1.0.0','files':{'server.dsl':'extra = softwareSystem "Testserver"'}})
        attached=self.call('/api/template/update',{'files':other,'template':'Testmodell','version':'1.0.0','scope':'model'})
        self.assertIn('Testmodell',json.loads(attached['files']['templates.lock.json']))
        with self.assertRaises(urllib.error.HTTPError):self.call('/api/template/create',{'name':'Testmodell','version':'1.0.0','files':{'server.dsl':'changed'}})
        # Invalid fragment fails at integration, not after mutating the project.
        self.call('/api/template/create',{'name':'Broken','version':'1.0.0','files':{'bad.dsl':'THIS IS INVALID'}})
        with self.assertRaises(urllib.error.HTTPError):self.call('/api/template/update',{'files':other,'template':'Broken','version':'1.0.0','scope':'model'})
        self.assertEqual(self.call('/api/project?project=C4-Studio')['files'],other)
        # Multiple independent imports use the same save endpoint.
        self.call('/api/save',{'name':'Import-Kopie','files':other,'message':'Ordnerimport'})
        self.assertIn('Import-Kopie',self.call('/api/projects'))
    def test_rejected_include_escape_and_scripts(self):
        for src in ['workspace {\nmodel {\n!include ../secret.dsl\n}\n}', 'workspace {\n!include https://example.com/a.dsl\n}', 'workspace {\n!script python\n}']:
            with self.assertRaises(urllib.error.HTTPError):self.call('/api/build',{'files':{'workspace.dsl':src}})
        with self.assertRaises(urllib.error.HTTPError):self.call('/api/build',{'files':{'workspace.dsl':'workspace {}','../evil.dsl':'x'}})
        req=urllib.request.Request(self.url+'/api/build',data=b'{}',headers={'Content-Type':'application/json','Origin':'https://another-origin.invalid'})
        with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(req)

if __name__=='__main__':unittest.main(verbosity=2)
