"""Finish fitted armor in Blender, preserving per-piece pivots and joint names."""
import array
import base64
import bpy
import json
import math
import os
import sys
from mathutils import Vector

source, output, blend_file = sys.argv[sys.argv.index('--') + 1:][:3]
with open(source, encoding='utf8') as handle:
    data = json.load(handle)
bpy.ops.wm.read_factory_settings(use_empty=True)

def unpack(text, code):
    values = array.array(code)
    values.frombytes(base64.b64decode(text))
    return values

def pack(values, code):
    return base64.b64encode(array.array(code, values).tobytes()).decode('ascii')

palette = {'steel': (.27, .33, .38), 'edge': (.52, .58, .61), 'brass': (.38, .23, .08),
           'leather': (.12, .047, .021), 'dark': (.027, .019, .015),
           'gambeson': (.25, .16, .073) if data['kind'] == 'hide' else (.053, .045, .038),
           'linen': (.58, .48, .30), 'skin': (.58, .36, .25)}
materials = {}
for name, color in palette.items():
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = .82 if name in ('steel', 'edge', 'brass') else 0
    bsdf.inputs['Roughness'].default_value = .36 if name in ('steel', 'edge', 'brass') else .76
    materials[name] = material

armor = bpy.data.collections.new('D20 — ' + data['kind'])
character = bpy.data.collections.new('D20 — Персонаж')
bpy.context.scene.collection.children.link(character)
character.children.link(armor)
finished, beveled = [], 0
for part in data['parts']:
    p, indices, uv = unpack(part['positions'], 'f'), unpack(part['indices'], 'I'), unpack(part['uv'], 'f')
    mesh = bpy.data.meshes.new(part['name'])
    mesh.from_pydata(list(zip(p[::3], p[1::3], p[2::3])), [], list(zip(indices[::3], indices[1::3], indices[2::3])))
    mesh.update()
    layer = mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        i = loop.vertex_index
        layer.data[loop.index].uv = (uv[i*2], uv[i*2+1])
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    original = unpack(part['normals'], 'f')
    normals = []
    for i in range(0, len(original), 3):
        v = Vector(original[i:i+3])
        normals.append(v.normalized() if v.length > .01 else Vector((0, 1, 0)))
    mesh.normals_split_custom_set_from_vertices(normals)
    obj = bpy.data.objects.new(part['name'], mesh)
    armor.objects.link(obj)
    obj.data.materials.append(materials[part['material']])
    obj['studioPart'], obj['joint'] = part['id'], part['parent']
    # Tiny wires, scales and stitched edging already have a rounded profile.
    # Bevel only structural panels; this avoids multiplying every mail link.
    rounded = any(key in part['name'] for key in ('link', 'ring', 'scale', 'rivet', 'stitch', 'hem', 'bevel', 'border', 'rim', 'lacing', 'fur', 'keel', 'flute', 'crest', 'vent'))
    has_bevel = not rounded and len(mesh.vertices) < 1900
    if has_bevel:
        modifier = obj.modifiers.new('Кованая фаска / толщина кромки', 'BEVEL')
        modifier.width = .0016 if part['material'] in ('steel', 'edge', 'brass') else .0022
        modifier.segments = 2
        modifier.limit_method = 'ANGLE'
        modifier.angle_limit = math.radians(38)
        modifier.harden_normals = True
        modifier.use_clamp_overlap = True
        beveled += 1
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()) if has_bevel else None
    result = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get()) if evaluated else mesh
    result.calc_loop_triangles()
    corner_normals = result.corner_normals
    values, nvalues, texcoords, triangles, unique = [], [], [], [], {}
    for triangle in result.loop_triangles:
        vertices = [result.vertices[result.loops[k].vertex_index].co for k in triangle.loops]
        face_normal = (vertices[1]-vertices[0]).cross(vertices[2]-vertices[0])
        if face_normal.length_squared < 1e-20:
            continue
        face_normal.normalize()
        for corner in triangle.loops:
            loop = result.loops[corner]
            normal = corner_normals[corner].vector
            if normal.length_squared < 1e-12:
                normal = face_normal
            uv0 = result.uv_layers.active.data[corner].uv
            key = (loop.vertex_index, *(round(v, 6) for v in normal), *(round(v, 6) for v in uv0))
            if key not in unique:
                unique[key] = len(values)//3
                values.extend(result.vertices[loop.vertex_index].co)
                nvalues.extend(normal.normalized())
                texcoords.extend(uv0)
            triangles.append(unique[key])
    finished.append({**{k:part[k] for k in ('name', 'id', 'parent', 'material')},
                     'positions': pack(values, 'f'), 'normals': pack(nvalues, 'f'),
                     'uv': pack(texcoords, 'f'), 'indices': pack(triangles, 'I')})
    if evaluated:
        evaluated.to_mesh_clear()

# Save a genuine editable Blender source, with anatomical body and the same rig.
body = data['body']
p, ix = unpack(body['positions'], 'f'), unpack(body['indices'], 'H')
mesh = bpy.data.meshes.new('Anatomical body')
mesh.from_pydata(list(zip(p[::3], p[1::3], p[2::3])), [], list(zip(ix[::3], ix[1::3], ix[2::3])))
mesh.update()
anatomy = bpy.data.objects.new('Тело — ' + data['sex'], mesh)
character.objects.link(anatomy)
anatomy.data.materials.append(materials['skin'])
for poly in mesh.polygons:
    poly.use_smooth = True
rig_data = bpy.data.armatures.new('D20 humanoid 163')
rig = bpy.data.objects.new('Скелет', rig_data)
character.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for definition in body['bones']:
    bone = rig_data.edit_bones.new(definition['name'])
    # D20 is Y-up; Blender source is Z-up.
    bone.head, bone.tail = definition['head'], definition['tail']
    if (bone.tail-bone.head).length < .0001:
        bone.tail.y += .005
for definition in body['bones']:
    if definition['parent'] >= 0:
        rig_data.edit_bones[definition['name']].parent = rig_data.edit_bones[body['bones'][definition['parent']]['name']]
bpy.ops.object.mode_set(mode='OBJECT')
weights, joints = unpack(body['skinWeights'], 'B'), unpack(body['skinIndices'], 'B')
groups = [anatomy.vertex_groups.new(name=b['name']) for b in body['bones']]
for i in range(len(p)//3):
    for k in range(4):
        if weights[i*4+k]:
            groups[joints[i*4+k]].add([i], weights[i*4+k]/255, 'REPLACE')
anatomy.modifiers.new('Humanoid', 'ARMATURE').object = rig
for obj in armor.objects:
    group = obj.vertex_groups.new(name=obj['joint'])
    group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    obj.modifiers.new('Humanoid joint', 'ARMATURE').object = rig
for obj in [anatomy, rig, *armor.objects]:
    obj.rotation_euler.x = math.pi/2
rig.show_in_front = True
rig.data.display_type = 'STICK'
scene = bpy.context.scene
scene['d20_character_collection'] = character.name
scene['d20_armor_kind'], scene['d20_sex'] = data['kind'], data['sex']
scene['d20_note'] = 'Отдельные объёмные панели, подгонка, фаски и скелет. В игровом файле фаски уже применены.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.region_3d.view_distance = 3.2
            area.spaces.active.region_3d.view_location = (0, 0, .95)
bpy.ops.wm.save_as_mainfile(filepath=blend_file, check_existing=False)
with open(output, 'w', encoding='utf8') as handle:
    json.dump({'parts': finished, 'blender': bpy.app.version_string, 'beveled': beveled}, handle, separators=(',', ':'))
print('D20_FINISHED', data['sex'], data['kind'], len(finished), 'pieces;', beveled, 'bevels')
