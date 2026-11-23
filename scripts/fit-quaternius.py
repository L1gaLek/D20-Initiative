"""Fit CC0 Quaternius Standard outfits; invoked by build-quaternius.mjs."""
import bpy,json,base64,array,sys,math,bmesh,argparse
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
parser=argparse.ArgumentParser()
for name in ['source','native','sex','kind','output','blend']:parser.add_argument('--'+name,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);sex,kind=args.sex,args.kind
source=Path(args.source)/'Exports/glTF (Godot-Unreal)/Outfits'/(sex.title()+'_'+kind.title()+'.gltf')
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
data=json.loads(Path(args.native).read_text(encoding='utf-8'));defs={b['name']:b for b in data['bones']}
def zup(p):return Vector((p[0],-p[2],p[1]))
def yup(p):return [p.x,p.z,-p.y]
def head(n):return zup(defs[n]['head'])
def tail(n):return zup(defs[n]['tail'])
def dec(k,t):
 a=array.array(t);a.frombytes(base64.b64decode(data[k]));return a
native=dec('positions','f');native_points=[zup(native[i:i+3]) for i in range(0,len(native),3)];ix=dec('indices','H');faces=[list(ix[i:i+3]) for i in range(0,len(ix),3)];bvh=BVHTree.FromPolygons(native_points,faces,all_triangles=True)
rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];srcBones={}
for o in rigs:
 for b in o.data.bones:srcBones.setdefault(b.name,(o.matrix_world@b.head_local,o.matrix_world@b.tail_local))
def src(n):return srcBones[n][0]
def frame(a,b):
 axis=(b-a).normalized();front=Vector((0,-1,0));normal=front-axis*front.dot(axis)
 if normal.length<.01:normal=Vector((0,0,1))-axis*axis.z
 normal.normalize();return Matrix((axis.cross(normal).normalized(),axis,normal)).transposed()
def mapping(a,b,c,d,r=1):
 A=frame(a,b);B=frame(c,d);lin=B@Matrix.Diagonal((r,(d-c).length/(b-a).length,r))@A.transposed();m=lin.to_4x4();m.translation=c-lin@a;return m
maps={}
def reg(n,end,target,to,r=1):maps[n]=(mapping(src(n),src(end),head(target),head(to),r),target)
reg('pelvis','spine_01','spine05','spine04');reg('spine_01','spine_02','spine04','spine02');reg('spine_02','spine_03','spine02','spine01');reg('spine_03','neck_01','spine01','neck01');reg('neck_01','Head','neck01','head')
maps['root']=maps['pelvis'];headMap=Matrix.Diagonal((.95,.95,.95,1));headMap.translation=head('head')-src('Head')*.95;maps['Head']=(headMap,'head')
for s in ['L','R']:
 q=s.lower()
 reg('clavicle_'+q,'upperarm_'+q,'shoulder01.'+s,'upperarm01.'+s)
 reg('upperarm_'+q,'lowerarm_'+q,'upperarm01.'+s,'lowerarm01.'+s,.94)
 reg('lowerarm_'+q,'hand_'+q,'lowerarm01.'+s,'wrist.'+s,.94)
 reg('hand_'+q,'middle_01_'+q,'wrist.'+s,'finger3-1.'+s,.93)
 reg('thigh_'+q,'calf_'+q,'upperleg01.'+s,'lowerleg01.'+s,1.05)
 reg('calf_'+q,'foot_'+q,'lowerleg01.'+s,'foot.'+s,1.05)
 reg('foot_'+q,'ball_'+q,'foot.'+s,'toe3-1.'+s,1.08)
 maps['ball_'+q]=maps['foot_'+q]
knots=[(src(n).z,head(t),src(n).y) for n,t in [('pelvis','spine05'),('spine_01','spine04'),('spine_02','spine02'),('spine_03','spine01'),('neck_01','neck01')]]
for side in ['L','R']:
 for number,name in enumerate(['thumb','index','middle','ring','pinky'],1):
  for segment in range(1,4):
   key=f'{name}_{segment:02d}_{side.lower()}';target=f'finger{number}-{segment}.{side}'
   end=src(f'{name}_{segment+1:02d}_{side.lower()}') if segment<3 else srcBones[key][1]
   maps[key]=(mapping(src(key),end,head(target),tail(target),.88),target)

for name in srcBones:
 if name.startswith('ball_leaf_'):maps[name]=maps['ball_'+name[-1]]
 elif '_04_leaf_' in name:maps[name]=maps[name.split('_04_leaf_')[0]+'_03_'+name[-1]]

def torso(p):
 at=1
 while at<len(knots)-1 and p.z>knots[at][0]:at+=1
 a,b=knots[at-1],knots[at];t=(p.z-a[0])/(b[0]-a[0]);center=a[1].lerp(b[1],t);sy=a[2]+(b[2]-a[2])*t
 return Vector((p.x,center.y+(p.y-sy),center.z))
objects=[]
for o in list(bpy.context.scene.objects):
 if o.type!='MESH' or not o.vertex_groups:continue
 # Skin included in the source sleeves is replaced by the native D20 body.
 bm=bmesh.new();bm.from_mesh(o.data);remove=[]
 for f in bm.faces:
  mat=o.data.materials[f.material_index] if f.material_index<len(o.data.materials) else None
  if mat and 'Regular' in mat.name:remove.append(f)
 # Native D20 hands keep the exact established weapon grip.
 layer=bm.verts.layers.deform.active
 for f in bm.faces:
  hand=sum(w for v in f.verts for group,w in (v[layer].items() if layer else []) if o.vertex_groups[group].name.startswith(('hand_','thumb_','index_','middle_','ring_','pinky_')))/len(f.verts)
  if hand>.55 and f not in remove:remove.append(f)
 bmesh.ops.delete(bm,geom=remove,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(o.data);bm.free()
 if not o.data.polygons:continue
 if o.name.endswith('_Body'):
  bpy.context.view_layer.objects.active=o
  sub=o.modifiers.new('Fit sampling','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=1
  bpy.ops.object.modifier_move_up(modifier=sub.name);bpy.ops.object.modifier_apply(modifier=sub.name)
 oldGroups={g.index:maps.get(g.name) for g in o.vertex_groups};world=o.matrix_world.copy();weights=[]
 for v in o.data.vertices:
  p=world@v.co;inf=[(oldGroups[g.group],g.weight) for g in v.groups if oldGroups.get(g.group) and g.weight>1e-7];total=sum(w for _,w in inf)
  if not total:raise RuntimeError('Missing weights '+o.name+' '+str([(o.vertex_groups[g.group].name,g.weight) for g in v.groups]))
  result=Vector();merged={}
  for (m,n),w in inf:
   result+=(torso(p) if n in ['spine05','spine04','spine02','spine01'] else m@p)*(w/total);merged[n]=merged.get(n,0)+w/total
  q,n,_,distance=bvh.find_nearest(result)
  if q is not None and distance<.11 and (result-q).dot(n)<.012:result=q+n*.012
  v.co=result;weights.append(merged)
 o.parent=None;o.matrix_world=Matrix.Identity(4);o.modifiers.clear();o.vertex_groups.clear()
 for n in sorted({n for merged in weights for n in merged}):o.vertex_groups.new(name=n)
 for i,merged in enumerate(weights):
  for n,w in merged.items():o.vertex_groups[n].add([i],w,'REPLACE')
 o.data.update();objects.append(o)
# Export actual source UVs and PBR material slots in the native bind pose.
enc=lambda a:base64.b64encode(a.tobytes()).decode();pieces=[]
for obj in objects:
 mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data;groups={g.index:g.name for g in obj.vertex_groups}
 for matid,mat in enumerate(mesh.materials):
  if 'Regular' in mat.name:continue
  triangles=[t for t in mesh.loop_triangles if t.material_index==matid]
  if not triangles:continue
  pos=[];normal=[];tex=[];joints=[];skin=[];inds=[];known={}
  for tri in triangles:
   for li in tri.loops:
    loop=mesh.loops[li];vi=loop.vertex_index;coords=tuple(uv[li].uv);key=(vi,*coords)
    if key not in known:
     known[key]=len(pos)//3;v=mesh.vertices[vi];pos.extend(yup(v.co));normal.extend(yup(v.normal));tex.extend(coords)
     inf=sorted([(list(defs).index(groups[g.group]),g.weight) for g in v.groups],key=lambda p:-p[1])[:4];total=sum(w for _,w in inf)
     for k in range(4):joints.append(inf[k][0] if k<len(inf) else 0);skin.append(inf[k][1]/total if k<len(inf) else 0)
    inds.append(known[key])
  piece={'id':'quaternius::'+obj.name,'name':obj.name,'material':kind,'positions':enc(array.array('f',pos)),'normals':enc(array.array('f',normal)),'uv':enc(array.array('f',tex)),'skinIndices':enc(array.array('H',joints)),'skinWeights':enc(array.array('f',skin)),'indices':enc(array.array('I',inds))}
  if 'Hood' in obj.name:piece['optional']='hood'
  pieces.append(piece)
asset={'format':'d20-fitted-outfit','version':1,'style':'quaternius-standard','sex':sex,'kind':kind,'preserveBody':True,'source':'Quaternius Modular Character Outfits - Fantasy / Standard 2.1 / CC0-1.0','bones':list(defs),'images':{},'materials':[{'id':kind,'name':'Quaternius '+kind,'colorMap':kind+'-color','normalMap':kind+'-normal','ormMap':kind+'-orm','roughness':1,'metalness':1}],'pieces':pieces}
Path(args.output).write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8')
print('FITTED',sex,kind,len(pieces),sum(len(base64.b64decode(p['positions']))//12 for p in pieces),'vertices')
# Store editable source meshes; the Studio exporter also provides a complete character.
for o in list(bpy.context.scene.objects):
 if o not in objects:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.armature_add();target=bpy.context.object;target.name='D20 163';bpy.ops.object.mode_set(mode='EDIT');target.data.edit_bones.remove(target.data.edit_bones[0])
for b in data['bones']:
 bone=target.data.edit_bones.new(b['name']);bone.head=zup(b['head']);bone.tail=zup(b['tail'])
for b in data['bones']:
 if b['parent']>=0:target.data.edit_bones[b['name']].parent=target.data.edit_bones[data['bones'][b['parent']]['name']]
bpy.ops.object.mode_set(mode='OBJECT')
for obj in objects:obj.modifiers.new('D20 skin','ARMATURE').object=target
out=Path(args.blend);out.parent.mkdir(parents=True,exist_ok=True)
for image in bpy.data.images:
 if image.filepath and image.size[0]:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(out))
