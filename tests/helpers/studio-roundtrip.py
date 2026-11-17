"""Exercise the real Blender panel: edit a plate, key a translated joint, export."""
import bpy
import hashlib
import json
import os
import runpy
import struct
import sys
from mathutils import Quaternion

source, panel, report = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.open_mainfile(filepath=source)
runpy.run_path(panel)
helpers = {b.custom_shape for arm in bpy.data.objects if arm.type == 'ARMATURE'
           for b in arm.pose.bones if b.custom_shape}
character = bpy.data.collections[bpy.context.scene['d20_character_collection']]
assert not any(obj in helpers for obj in character.all_objects), 'Bone display helpers must not become character meshes'
group = next(o for o in bpy.data.objects if 'sculpted-breast-cup' in str(o.get('studioPart', '')))
mesh = next(o for o in group.children_recursive if o.type == 'MESH')
def mesh_hash():
    return hashlib.sha256(b''.join(struct.pack('<fff', *v.co) for v in mesh.data.vertices)).hexdigest()
before = mesh_hash()
vertex = max(mesh.data.vertices, key=lambda v: v.co.z)
vertex.co.x += .004
mesh.data.update()
assert mesh_hash() != before
armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bone = next(b for b in armature.pose.bones if b.name.replace('.', '_') == 'wrist_R')
bpy.context.scene.d20_action_name = 'roundtrip_sword'
original_pose = {b.name: b.matrix_basis.copy() for b in armature.pose.bones}
assert bpy.ops.d20.action() == {'FINISHED'}
assert all(max(abs(b.matrix_basis[i][j] - original_pose[b.name][i][j]) for i in range(4) for j in range(4)) < .00001 for b in armature.pose.bones)
base_location, base_rotation = bone.location.copy(), bone.rotation_quaternion.copy()
bone.rotation_mode = 'QUATERNION'
for frame, amount in [(1, 0), (13, 1), (25, 0)]:
    bpy.context.scene.frame_set(frame)
    bone.location = base_location.copy()
    bone.location.z += .03 * amount
    bone.rotation_quaternion = base_rotation @ Quaternion((0, 0, 1), .15 * amount)
    bone.keyframe_insert(data_path='location')
    bone.keyframe_insert(data_path='rotation_quaternion')
bpy.context.scene.frame_set(1)
assert bpy.ops.d20.export() == {'FINISHED'}
output = bpy.context.scene['d20_export_path']
assert os.path.getsize(output) > 100000
bpy.context.scene.render.resolution_x = 600
bpy.context.scene.render.resolution_y = 800
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.filepath = os.path.join(os.path.dirname(report), 'blender-preview.png')
world = bpy.data.worlds.new('D20 test studio')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.24, .25, .28, 1)
bpy.context.scene.world = world
bpy.ops.render.render(write_still=True)
with open(report, 'w', encoding='utf8') as target:
    json.dump({'edited': mesh.name, 'before': before, 'after': mesh_hash(), 'bone': bone.name, 'output': output}, target, ensure_ascii=False, indent=2)
