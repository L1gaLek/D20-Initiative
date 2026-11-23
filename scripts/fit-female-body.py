"""Transfer the supplied CBBE surface onto the seamless D20 female topology.
Run with Blender --background --factory-startup --disable-autoexec --python
scripts/fit-female-body.py -- --source /path/to/femalebody_1.nif
--pynifly /path/containing/io_scene_nifly --native assets/models/human/female-base.mjs
--output assets/models/human/female.mjs
Only mesh data is read. The game's face, grip vertices and 163 native joints stay.
"""
import bpy,json,base64,array,sys,math,argparse,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
parser=argparse.ArgumentParser()
for name in ['source','pynifly','native','output']:parser.add_argument('--'+name,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sys.path.insert(0,str(Path(args.pynifly).resolve()))
import addon_utils
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('io_scene_nifly',default_set=True,persistent=False)
for name in [Path(args.source).name,'femalehands_1.nif','femalefeet_1.nif']:
 bpy.ops.import_scene.pynifly(filepath=str(Path(args.source).resolve().with_name(name)),rename_bones=False,blender_xf=False,import_animations=False,import_collisions=False,import_tris=False,create_collection=True)
data=json.loads(Path(args.native).read_text(encoding='utf-8-sig').split('export default ',1)[1].rstrip(' ;\r\n'))
def decode(k,t):
 a=array.array(t);a.frombytes(base64.b64decode(data[k]));return a
positions=decode('positions','f');indices=decode('indices','H');joints=decode('skinIndices','B');weights=decode('skinWeights','B')
defs={b['name']:b for b in data['bones']}
def zup(p):return Vector((p[0],-p[2],p[1]))
def yup(p):return [p.x,p.z,-p.y]
def head(n):return zup(defs[n]['head'])
heads={}
for o in bpy.context.scene.objects:
 if o.type=='ARMATURE':
  for b in o.data.bones:heads.setdefault(b.name,o.matrix_world@b.head_local)
def src(p,s=None):
 return next(v for n,v in heads.items() if n.startswith('NPC '+(s+' ' if s else '')+p+' ['))
def frame(a,b,front):
 axis=(b-a).normalized();normal=Vector(front)-axis*Vector(front).dot(axis)
 if normal.length<.01:normal=Vector((1,0,0))-axis*axis.x
 normal.normalize();return Matrix((axis.cross(normal).normalized(),axis,normal)).transposed()
def mapping(a,b,c,d,radial,foot=False):
 A=frame(a,b,(0,0,1) if foot else (0,1,0));B=frame(c,d,(0,0,1) if foot else (0,-1,0))
 lin=B@Matrix.Diagonal((radial,(d-c).length/(b-a).length,radial))@A.transposed();m=lin.to_4x4();m.translation=c-lin@a;return m
maps={}
def reg(p,a,b,n,c,d,r=.013,s=None,foot=False):maps[(s,p)]=(mapping(a,b,c,d,r,foot),n)
reg('Pelvis',src('Pelvis'),src('Spine'),'root',head('spine05'),head('spine04'))
reg('Spine',src('Spine'),src('Spine1'),'spine04',head('spine04'),head('spine02'))
reg('Spine1',src('Spine1'),src('Spine2'),'spine02',head('spine02'),head('spine01'))
reg('Spine2',src('Spine2'),(src('Clavicle','L')+src('Clavicle','R'))/2,'spine01',head('spine01'),head('neck01'))
for s in ['L','R']:
 reg('Clavicle',src('Clavicle',s),src('UpperArm',s),'shoulder01.'+s,head('shoulder01.'+s),head('upperarm01.'+s),s=s)
 reg('UpperArm',src('UpperArm',s),src('Forearm',s),'upperarm01.'+s,head('upperarm01.'+s),head('lowerarm01.'+s),.0125,s=s)
 reg('Forearm',src('Forearm',s),src('Hand',s),'lowerarm01.'+s,head('lowerarm01.'+s),head('wrist.'+s),.0125,s=s)
 reg('Thigh',src('Thigh',s),src('Calf',s),'upperleg01.'+s,head('upperleg01.'+s),head('lowerleg01.'+s),s=s)
 reg('Calf',src('Calf',s),src('Foot',s),'lowerleg01.'+s,head('lowerleg01.'+s),head('foot.'+s),s=s)
 maps[(s,'Breast')]=maps[(None,'Spine2')];maps[(s,'Butt')]=maps[(None,'Pelvis')]
maps[(None,'Belly')]=maps[(None,'Spine')]
def resolve(n):
 if not n.startswith('NPC '):return None
 p=n[4:].split(' [')[0];s=None
 if p[:2] in ['L ','R ']:s,p=p[0],p[2:]
 if p.startswith('UpperarmTwist'):p='UpperArm'
 if p.startswith('ForearmTwist'):p='Forearm'
 return maps.get((s,p))
body=bpy.data.objects['BaseShape'];vg={g.index:resolve(g.name) for g in body.vertex_groups}
points=[];fail=[]
for v in body.data.vertices:
 influences=[(vg[g.group],g.weight) for g in v.groups if vg.get(g.group) and g.weight>1e-7];total=sum(w for _,w in influences)
 if not total:fail.append(v.index);points.append(Vector((0,0,0)));continue
 p=body.matrix_world@v.co
 # A single continuous spine warp avoids creases from Skyrim's bent spine axes.
 knots=[(src('Pelvis').z,head('spine05')),(src('Spine').z,head('spine04')),(src('Spine1').z,head('spine02')),(src('Spine2').z,head('spine01')),((src('Clavicle','L').z+src('Clavicle','R').z)/2,head('neck01'))]
 at=1
 while at<len(knots)-1 and p.z>knots[at][0]:at+=1
 a,b=knots[at-1],knots[at];t=(p.z-a[0])/(b[0]-a[0]);target=a[1].lerp(b[1],t)
 torso=Vector((-p.x*.013,-p.y*.013+target.y-.067,target.z))
 point=Vector()
 for (m,n),w in influences:
  point+=(torso if n in ['root','spine04','spine02','spine01'] else m@p)*(w/total)
 points.append(point)
if fail:raise RuntimeError('Unmapped '+str(fail[:20]))
faces=[list(p.vertices) for p in body.data.polygons]
bvh=BVHTree.FromPolygons(points,faces,all_triangles=True)
# Preserve the established continuous topology, face and precise finger joints.
# The supplied body is the target surface in the native bind pose, rather than
# rebuilding a new approximation out of procedural shapes.
native=[zup(positions[i:i+3]) for i in range(0,len(positions),3)];result=[];changes=[]
def smooth(a,b,t):
 t=max(0,min(1,(t-a)/(b-a)));return t*t*(3-2*t)
for i,p in enumerate(native):
 names=[(data['bones'][joints[i*4+k]]['name'],weights[i*4+k]/255) for k in range(4) if weights[i*4+k]]
 protected=sum(w for n,w in names if any(x in n for x in ['finger','wrist','head','neck','eye','toe','foot']))
 blend=(1-smooth(1.35,1.435,p.z))*smooth(.17,.27,p.z)*(1-smooth(.05,.45,protected))
 for s in ['L','R']:
  d=(p-head('wrist.'+s)).length
  blend*=smooth(.025,.10,d)
 q,n,fi,d=bvh.find_nearest(p)
 # Keep groin anatomy neutral under the existing opaque underwear.
 if .84<p.z<.99 and abs(p.x)<.055:blend*=.25
 dest=p.lerp(q,blend) if q is not None else p
 result.append(yup(dest));changes.append((dest-p).length)
# Smooth the displacement field, preserving the native face/hand/foot seams.
connections=[set() for _ in native]
for k in range(0,len(indices),3):
 a,b,c=indices[k:k+3]
 for i,j in [(a,b),(b,c),(c,a)]:connections[i].add(j);connections[j].add(i)
displacements=[zup(p)-base for p,base in zip(result,native)]
for iteration in range(18):
 displacements=[d.lerp(sum((displacements[j] for j in connections[i]),Vector())/len(connections[i]),.48) if connections[i] and changes[i]>1e-7 else Vector() for i,d in enumerate(displacements)]
result=[yup(p+d) for p,d in zip(native,displacements)]

raw=array.array('f',[c for p in result for c in p])
data['positions']=base64.b64encode(raw.tobytes()).decode()
data['bodySource']='CBBE_fizicka_2-4 / 1-Бри / femalebody_1.nif'
data['bodyFit']='Native seamless topology fitted to supplied CBBE surface, with original head, hands, feet and rig.'
output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
output.write_text('// Supplied CBBE body fitted to the continuous D20 mesh and native rig.\nexport default '+json.dumps(data,separators=(',',':'),ensure_ascii=False)+';\n',encoding='utf-8')
report={'source':data['bodySource'],'sourceSha256':hashlib.sha256(Path(args.source).read_bytes()).hexdigest(),'nativeSha256':hashlib.sha256(Path(args.native).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode('utf-8')).hexdigest(),'blender':bpy.app.version_string,'vertices':len(native),'triangles':len(indices)//3,'bones':len(data['bones']),'changedVertices':sum(d.length>.001 for d in displacements),'maximumDisplacement':max(d.length for d in displacements),'method':'Bone-space CBBE surface transfer, seamless native retopology, 18 displacement smoothing passes. No source skeleton, physics, animations or executable plugins.'}
report['referenceSha256']={name:hashlib.sha256(Path(args.source).with_name(name).read_bytes()).hexdigest() for name in [Path(args.source).name,'femalehands_1.nif','femalefeet_1.nif']}
output.with_name('female-body-source.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('D20_BODY',json.dumps(report,ensure_ascii=False))
