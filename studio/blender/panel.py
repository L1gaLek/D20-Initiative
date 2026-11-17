"""Session-local helper panel; does not enable auto-execution in user preferences."""
import bpy
import os

if bpy.data.filepath:
    bpy.context.scene['d20_export_path'] = os.path.join(os.path.dirname(bpy.data.filepath), 'from-blender.glb')

def rig():
    col = bpy.data.collections.get(bpy.context.scene.get('d20_character_collection', 'D20 — Персонаж'))
    return next((o for o in col.all_objects if o.type == 'ARMATURE'), None) if col else None

class D20_OT_pose(bpy.types.Operator):
    bl_idname = 'd20.pose'
    bl_label = 'Управлять скелетом'
    def execute(self, context):
        armature = rig()
        if not armature:
            self.report({'ERROR'}, 'Скелет не найден')
            return {'CANCELLED'}
        if context.object and context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        armature.select_set(True)
        context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode='POSE')
        return {'FINISHED'}

class D20_OT_action(bpy.types.Operator):
    bl_idname = 'd20.action'
    bl_label = 'Создать действие'
    def execute(self, context):
        armature = rig()
        if not armature:
            return {'CANCELLED'}
        # Start from the visible pose. Switching away from an imported action
        # must not silently return unkeyed limbs and armor to the bind pose.
        saved = [(b, b.matrix_basis.copy()) for b in armature.pose.bones]
        armature.animation_data_create()
        for track in armature.animation_data.nla_tracks:
            track.mute = True
        armature.animation_data.action = bpy.data.actions.new(context.scene.d20_action_name or 'attack_custom')
        context.scene.frame_set(1)
        for bone, matrix in saved:
            bone.matrix_basis = matrix
            bone.keyframe_insert(data_path='location')
            bone.keyframe_insert(data_path='rotation_quaternion' if bone.rotation_mode == 'QUATERNION' else 'rotation_euler')
            bone.keyframe_insert(data_path='scale')
        return {'FINISHED'}

class D20_OT_key(bpy.types.Operator):
    bl_idname = 'd20.key'
    bl_label = 'Записать выбранные кости'
    def execute(self, context):
        armature = rig()
        if not armature:
            return {'CANCELLED'}
        for bone in armature.pose.bones:
            if bone.bone.select:
                bone.keyframe_insert(data_path='location')
                bone.keyframe_insert(data_path='rotation_quaternion' if bone.rotation_mode == 'QUATERNION' else 'rotation_euler')
        return {'FINISHED'}

class D20_OT_export(bpy.types.Operator):
    bl_idname = 'd20.export'
    bl_label = 'Экспорт в D20 Studio'
    def execute(self, context):
        col = bpy.data.collections.get(context.scene.get('d20_character_collection', 'D20 — Персонаж'))
        if not col:
            self.report({'ERROR'}, 'Коллекция персонажа не найдена')
            return {'CANCELLED'}
        if context.object and context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        helpers = {b.custom_shape for arm in bpy.data.objects if arm.type == 'ARMATURE'
                   for b in arm.pose.bones if b.custom_shape}
        for obj in col.all_objects:
            if obj not in helpers:
                obj.select_set(True)
        target = context.scene.get('d20_export_path') or os.path.join(os.path.dirname(bpy.data.filepath), 'from-blender.glb')
        props = bpy.ops.export_scene.gltf.get_rna_type().properties
        kwargs = {'filepath': target, 'export_format': 'GLB', 'use_selection': True, 'export_animations': True, 'export_skins': True, 'export_extras': True}
        for key, value in [('export_force_sampling', True), ('export_cameras', False), ('export_lights', False)]:
            if key in props:
                kwargs[key] = value
        bpy.ops.export_scene.gltf(**kwargs)
        self.report({'INFO'}, 'Готово. В D20 Studio нажмите «Вернуть модель».')
        return {'FINISHED'}

class D20_PT_studio(bpy.types.Panel):
    bl_label = 'D20 Studio'
    bl_idname = 'D20_PT_studio'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'D20 Studio'
    def draw(self, context):
        layout = self.layout
        layout.label(text='Редактируемый исходник персонажа')
        layout.operator('d20.pose', icon='ARMATURE_DATA')
        layout.separator()
        layout.prop(context.scene, 'd20_action_name', text='Действие')
        layout.operator('d20.action', icon='ACTION')
        layout.operator('d20.key', icon='KEY_HLT')
        layout.separator()
        layout.operator('d20.export', icon='EXPORT')
        layout.label(text='Затем: «Вернуть модель» в мастерской')

classes = [D20_OT_pose, D20_OT_action, D20_OT_key, D20_OT_export, D20_PT_studio]
for cls in classes:
    try:
        bpy.utils.register_class(cls)
    except ValueError:
        pass
bpy.types.Scene.d20_action_name = bpy.props.StringProperty(name='Действие', default='attack_custom')
