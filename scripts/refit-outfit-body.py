"""Refit an existing D20 outfit to a changed seamless body.
Blender --background --factory-startup --disable-autoexec --python this.py --
--native female-base.mjs --body female.mjs --source old-outfit.mjs --output outfit.mjs
The topology, UVs, native skin weights and part IDs of each garment are preserved.
"""
import bpy,json,base64,array,sys,argparse
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
parser=argparse.ArgumentParser()
for name in ['native','body','source','output']:parser.add_argument('--'+name,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
def model(file):return json.loads(Path(file).read_text(encoding='utf-8-sig').split('export default ',1)[1].rstrip(' ;\r\n'))
old=model(args.native);new=model(args.body);asset=model(args.source)
if old['indices']!=new['indices'] or old['bones']!=new['bones']:raise ValueError('Body topology and native rig must match.')
def dec(o,k,t):
 a=array.array(t);a.frombytes(base64.b64decode(o[k]));return a
def enc(v,t):return base64.b64encode(array.array(t,v).tobytes()).decode()
a=dec(old,'positions','f');b=dec(new,'positions','f');ix=dec(old,'indices','H');op=[Vector(a[i:i+3]) for i in range(0,len(a),3)];np=[Vector(b[i:i+3]) for i in range(0,len(b),3)];faces=[list(ix[i:i+3]) for i in range(0,len(ix),3)];bv=BVHTree.FromPolygons(op,faces,all_triangles=True)
report={}
for part in asset['pieces']:
 p=dec(part,'positions','f');result=[];moved=0
 for i in range(0,len(p),3):
  v=Vector(p[i:i+3]);q,n,fi,d=bv.find_nearest(v)
  if q is not None and d<.18:
   j,k,l=faces[fi];q2=barycentric_transform(q,op[j],op[k],op[l],np[j],np[k],np[l]);t=max(0,min(1,(.18-d)/.10));v+=(q2-q)*t;moved+=1
  result.extend(v)
 triangles=dec(part,'indices','I')
 mesh=bpy.data.meshes.new('fitted');mesh.from_pydata([result[i:i+3] for i in range(0,len(result),3)],[],[list(triangles[i:i+3]) for i in range(0,len(triangles),3)]);mesh.update()
 part['positions']=enc(result,'f');part['normals']=enc([x for v in mesh.vertices for x in v.normal],'f');bpy.data.meshes.remove(mesh)
 report[part['name']]=moved
asset['bodySource']=new['bodySource'];asset['bodyFit']='Refitted to the supplied CBBE surface on the D20 native skeleton.'
Path(args.output).write_text('// Supplied outfit refitted to the CBBE-shaped D20 body.\nexport default '+json.dumps(asset,separators=(',',':'),ensure_ascii=False)+';\n',encoding='utf-8')
print('D20_OUTFIT_REFIT',json.dumps(report,ensure_ascii=False))
