"""Build an editable .blend from a locally exported D20 Studio character."""
import bpy
import json
import os
import sys
from mathutils import Vector

source, destination, project_file = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
kwargs = {'filepath': source}
if 'import_pack_images' in bpy.ops.import_scene.gltf.get_rna_type().properties:
    kwargs['import_pack_images'] = True
bpy.ops.import_scene.gltf(**kwargs)
# The glTF importer also creates an unlinked Icosphere as a bone display
# shape. It is an editor helper, not a piece of the exported character.
bone_shapes = {b.custom_shape for arm in bpy.data.objects if arm.type == 'ARMATURE'
               for b in arm.pose.bones if b.custom_shape}
for shape in bone_shapes:
    shape.hide_render = True
imported = [obj for obj in bpy.context.scene.objects if obj not in bone_shapes]
character = bpy.data.collections.new('D20 — Персонаж')
bpy.context.scene.collection.children.link(character)
groups = {}
for name in ['Тело и лицо', 'Доспехи', 'Оружие и щит', 'Скелет', 'Прочее']:
    col = bpy.data.collections.new(name)
    character.children.link(col)
    groups[name] = col
for obj in imported:
    chain = []
    current = obj
    while current:
        chain.append(current.name.lower())
        current = current.parent
    names = ' '.join(chain)
    if obj.type == 'ARMATURE':
        category = 'Скелет'
        obj.show_in_front = True
        obj.data.display_type = 'STICK'
    elif 'detailed-sword' in names or 'detailed-shield' in names:
        category = 'Оружие и щит'
    elif any(x in names for x in ['plate', 'cuirass', 'gauntlet', 'greave', 'pauldron', 'tasset', 'cuisse', 'tabard', 'vambrace', 'gorget', 'visor', 'sabaton', 'leather-strap']):
        category = 'Доспехи'
    elif 'anatomical-body' in names or 'hair' in names or obj.type == 'MESH':
        category = 'Тело и лицо'
    else:
        category = 'Прочее'
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    groups[category].objects.link(obj)
stage = bpy.data.collections.new('Сцена — не экспортируется')
bpy.context.scene.collection.children.link(stage)
def light(name, at, energy, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = energy, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    stage.objects.link(obj)
    obj.location = at
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
light('Мягкий основной', (-3, -4, 5), 600, 4)
light('Контурный', (3, 2, 4), 450, 3)
camera_data = bpy.data.cameras.new('Камера мастерской')
camera = bpy.data.objects.new('Камера мастерской', camera_data)
stage.objects.link(camera)
camera.location = (2.7, -4.2, 2.0)
camera.rotation_euler = (Vector((0, 0, .9)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = camera
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x, scene.render.resolution_y = 1200, 1200
scene.render.resolution_percentage = 100
scene.frame_start, scene.frame_end = 1, 72
scene.render.fps = 24
scene['d20_project_path'] = project_file
scene['d20_export_path'] = os.path.join(os.path.dirname(destination), 'from-blender.glb')
scene['d20_character_collection'] = character.name
scene['d20_note'] = 'Откройте файл через D20 Studio для панели обмена. Тело, пластины и скелет редактируются отдельно.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.region_3d.view_distance = 3.5
            area.spaces.active.region_3d.view_location = (0, 0, .9)
bpy.ops.object.select_all(action='DESELECT')
for obj in imported:
    if obj.type == 'ARMATURE':
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        break
bpy.ops.wm.save_as_mainfile(filepath=destination, check_existing=False)
print('D20_STUDIO_READY ' + destination)
